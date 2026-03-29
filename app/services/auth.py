from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Protocol

import jwt
from authlib.integrations.starlette_client import OAuth
from fastapi import Request
from fastapi.responses import RedirectResponse

from app.repositories import IUserRepository
from app.schemas.auth import AuthUserInfo


class AuthProvider(Protocol):
    async def authorize_redirect(
        self, request: Request, redirect_uri: str
    ) -> RedirectResponse: ...
    async def authorize_access_token(self, request: Request) -> AuthUserInfo: ...


class ITokenProvider(Protocol):
    def create_access_token(self, subject: str) -> str: ...
    def verify_token(self, token: str) -> str | None: ...


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

    def create_access_token(self, subject: str) -> str:
        expire = datetime.now(timezone.utc) + timedelta(minutes=self.expire_minutes)
        to_encode = {"exp": int(expire.timestamp()), "sub": str(subject)}
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)

    def verify_token(self, token: str) -> str | None:
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload.get("sub")
        except jwt.InvalidTokenError:
            return None


class AuthBusinessService:
    def __init__(
        self,
        user_repo: IUserRepository,
        token_provider: ITokenProvider,
        admin_email: str = "",
    ):
        self.user_repo = user_repo
        self.token_provider = token_provider
        self.admin_email = admin_email

    def process_google_user(self, user_info: AuthUserInfo) -> dict:
        from app.models import User

        if not user_info.email:
            raise ValueError("No email found in user_info")

        user = self.user_repo.get_by_email(user_info.email)
        is_admin = bool(self.admin_email and user_info.email == self.admin_email)

        if not user:
            new_user = User(
                email=user_info.email,
                name=user_info.name or "Unknown",
                picture=user_info.picture,
                provider=user_info.provider or "google",
                is_active=is_admin,
            )
            user = self.user_repo.create(new_user)

        if not user.is_active:
            raise PermissionError("User is inactive")

        token = self.token_provider.create_access_token(user.email)
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {"email": user.email},
        }

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

        if self.admin_email and user.email == self.admin_email:
            raise ValueError("Cannot deactivate the admin user.")

        user.is_active = False
        self.user_repo.update(user)
        return True

    def get_all_users(self) -> list:
        return self.user_repo.get_all()
