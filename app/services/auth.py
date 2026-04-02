from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol

import jwt
from authlib.integrations.starlette_client import OAuth
from fastapi import Request
from fastapi.responses import RedirectResponse

from app.repositories import IAuthSessionRepository, IUserRepository
from app.schemas.auth import AuthUserInfo


@dataclass(frozen=True)
class AccessTokenClaims:
    subject: str
    session_id: str | None


@dataclass(frozen=True)
class AuthSessionTokens:
    access_token: str
    refresh_token: str
    csrf_token: str


class AuthProvider(Protocol):
    async def authorize_redirect(
        self, request: Request, redirect_uri: str
    ) -> RedirectResponse: ...
    async def authorize_access_token(self, request: Request) -> AuthUserInfo: ...


class ITokenProvider(Protocol):
    def create_access_token(self, subject: str, session_id: str) -> str: ...
    def verify_access_token(self, token: str) -> AccessTokenClaims | None: ...
    def generate_refresh_token(self) -> str: ...
    def hash_refresh_token(self, token: str) -> str: ...
    def generate_csrf_token(self) -> str: ...


class GoogleAuthProvider:
    def __init__(self, client_id: str, client_secret: str):
        self.oauth = OAuth()
        self.oauth.register(
            name="google",
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_id=client_id,
            client_secret=client_secret,
            client_kwargs={
                "scope": "openid email profile",
                "code_challenge_method": "S256",
            },
        )

    async def authorize_redirect(
        self, request: Request, redirect_uri: str
    ) -> RedirectResponse:
        return await self.oauth.google.authorize_redirect(request, redirect_uri)

    async def authorize_access_token(self, request: Request) -> AuthUserInfo:
        try:
            token = await self.oauth.google.authorize_access_token(request)
            user_data = token.get("userinfo", {})
            return AuthUserInfo(
                id=user_data.get("sub"),
                email=user_data.get("email"),
                name=user_data.get("name"),
                picture=user_data.get("picture"),
                provider="google",
            )
        except Exception as exc:
            raise ValueError(f"Google OAuth verification failed: {exc}") from exc


class JWTTokenProvider:
    def __init__(self, secret_key: str, algorithm: str, expire_minutes: int):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.expire_minutes = expire_minutes

    def create_access_token(self, subject: str, session_id: str) -> str:
        issued_at = datetime.now(timezone.utc)
        expire = issued_at + timedelta(minutes=self.expire_minutes)
        to_encode = {
            "exp": int(expire.timestamp()),
            "iat": int(issued_at.timestamp()),
            "sub": str(subject),
            "sid": session_id,
            "typ": "access",
        }
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)

    def verify_access_token(self, token: str) -> AccessTokenClaims | None:
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            token_type = payload.get("typ")
            if token_type not in (None, "access"):
                return None
            subject = payload.get("sub")
            if not isinstance(subject, str) or not subject:
                return None
            session_id = payload.get("sid")
            if session_id is not None and not isinstance(session_id, str):
                return None
            return AccessTokenClaims(subject=subject, session_id=session_id)
        except jwt.InvalidTokenError:
            return None

    def generate_refresh_token(self) -> str:
        return secrets.token_urlsafe(48)

    def hash_refresh_token(self, token: str) -> str:
        return hmac.new(
            self.secret_key.encode("utf-8"),
            token.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    def generate_csrf_token(self) -> str:
        return secrets.token_urlsafe(32)


class AuthBusinessService:
    def __init__(
        self,
        user_repo: IUserRepository,
        auth_session_repo: IAuthSessionRepository,
        token_provider: ITokenProvider,
        access_token_expire_minutes: int,
        refresh_token_expire_days: int,
        admin_email: str = "",
    ):
        self.user_repo = user_repo
        self.auth_session_repo = auth_session_repo
        self.token_provider = token_provider
        self.access_token_expire_minutes = access_token_expire_minutes
        self.refresh_token_expire_days = refresh_token_expire_days
        self.admin_email = admin_email.strip().lower()

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)

    def _create_session_tokens(
        self,
        user_email: str,
        user_id: int,
        user_agent: str | None,
        ip_address: str | None,
    ) -> AuthSessionTokens:
        from app.models import AuthSession

        refresh_token = self.token_provider.generate_refresh_token()
        session_id = secrets.token_hex(16)
        expires_at = self._utcnow() + timedelta(days=self.refresh_token_expire_days)
        auth_session = AuthSession(
            session_id=session_id,
            refresh_token_hash=self.token_provider.hash_refresh_token(refresh_token),
            user_id=user_id,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.auth_session_repo.create(auth_session)
        return AuthSessionTokens(
            access_token=self.token_provider.create_access_token(
                user_email, session_id
            ),
            refresh_token=refresh_token,
            csrf_token=self.token_provider.generate_csrf_token(),
        )

    def process_google_user(
        self,
        user_info: AuthUserInfo,
        user_agent: str | None,
        ip_address: str | None,
    ) -> dict:
        from app.models import User

        if not user_info.email:
            raise ValueError("No email found in user_info")

        normalized_email = user_info.email.strip().lower()
        user = self.user_repo.get_by_email(normalized_email)
        is_admin = bool(self.admin_email and normalized_email == self.admin_email)

        if not user:
            new_user = User(
                email=normalized_email,
                name=user_info.name or "Unknown",
                picture=user_info.picture,
                provider=user_info.provider or "google",
                is_active=is_admin,
            )
            user = self.user_repo.create(new_user)

        if not user.is_active:
            raise PermissionError("User is inactive")

        tokens = self._create_session_tokens(
            user.email,
            user.id,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        return {
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "csrf_token": tokens.csrf_token,
            "token_type": "bearer",
            "user": {"email": user.email},
        }

    def refresh_session(
        self,
        refresh_token: str,
        user_agent: str | None,
        ip_address: str | None,
    ) -> dict:
        now = self._utcnow()
        auth_session = self.auth_session_repo.get_active_by_refresh_token_hash(
            self.token_provider.hash_refresh_token(refresh_token), now
        )
        if auth_session is None:
            raise PermissionError("Session refresh denied")

        user = self.user_repo.get_by_id(auth_session.user_id)
        if user is None or not user.is_active:
            self.auth_session_repo.revoke(auth_session, now)
            raise PermissionError("Session refresh denied")

        new_refresh_token = self.token_provider.generate_refresh_token()
        self.auth_session_repo.rotate(
            auth_session,
            refresh_token_hash=self.token_provider.hash_refresh_token(
                new_refresh_token
            ),
            expires_at=now + timedelta(days=self.refresh_token_expire_days),
            last_used_at=now,
            user_agent=user_agent,
            ip_address=ip_address,
        )

        return {
            "access_token": self.token_provider.create_access_token(
                user.email, auth_session.session_id
            ),
            "refresh_token": new_refresh_token,
            "csrf_token": self.token_provider.generate_csrf_token(),
            "token_type": "bearer",
            "user": {"email": user.email},
        }

    def revoke_session(self, refresh_token: str) -> None:
        now = self._utcnow()
        auth_session = self.auth_session_repo.get_active_by_refresh_token_hash(
            self.token_provider.hash_refresh_token(refresh_token), now
        )
        if auth_session is None:
            return
        self.auth_session_repo.revoke(auth_session, now)

    def activate_user(self, user_email: str) -> bool:
        user = self.user_repo.get_by_email(user_email)
        if not user:
            raise ValueError(f"User {user_email} not found.")

        user.is_active = True
        self.user_repo.update(user)
        return True

    def deactivate_user(self, user_email: str) -> bool:
        user = self.user_repo.get_by_email(user_email)
        if not user:
            raise ValueError(f"User {user_email} not found.")

        if self.admin_email and user.email.lower() == self.admin_email:
            raise ValueError("Cannot deactivate the admin user.")

        user.is_active = False
        self.user_repo.update(user)
        self.auth_session_repo.revoke_all_for_user(user.id, self._utcnow())
        return True

    def get_all_users(self) -> list:
        return self.user_repo.get_all()
