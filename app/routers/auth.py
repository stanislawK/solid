import secrets
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.services import (
    AuthProvider,
    GoogleAuthProvider,
    AuthBusinessService,
    ITokenProvider,
    JWTTokenProvider,
)
from app.repositories import (
    IAuthSessionRepository,
    IUserRepository,
    SQLAlchemyAuthSessionRepository,
    SQLAlchemyUserRepository,
)
from app.db import get_db
from app.config import settings
from app.models import User
from app.schemas import UserMeRead, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])

# Standard HTTP Bearer scheme for Swagger UI "Paste Token" UI
bearer_scheme = HTTPBearer(auto_error=False)

# --- Composition Root (Dependency Injection) ---


def get_auth_provider() -> AuthProvider:
    return GoogleAuthProvider(
        client_id=settings.gcp_client_id,
        client_secret=settings.gcp_client_secret,
    )


def get_user_repository(db: AsyncSession = Depends(get_db)) -> IUserRepository:
    return SQLAlchemyUserRepository(db)


def get_auth_session_repository(
    db: AsyncSession = Depends(get_db),
) -> IAuthSessionRepository:
    return SQLAlchemyAuthSessionRepository(db)


def get_token_provider() -> ITokenProvider:
    return JWTTokenProvider(
        secret_key=settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
        expire_minutes=settings.jwt_access_token_expire_minutes,
    )


def get_auth_business_service(
    repo: IUserRepository = Depends(get_user_repository),
    auth_session_repo: IAuthSessionRepository = Depends(get_auth_session_repository),
    token_provider: ITokenProvider = Depends(get_token_provider),
) -> AuthBusinessService:
    return AuthBusinessService(
        repo,
        auth_session_repo,
        token_provider,
        access_token_expire_minutes=settings.jwt_access_token_expire_minutes,
        refresh_token_expire_days=settings.auth_refresh_token_expire_days,
        admin_email=settings.admin_email,
    )


def _set_auth_cookies(response: Response, auth_result: dict) -> None:
    response.set_cookie(
        key=settings.auth_access_cookie_name,
        value=auth_result["access_token"],
        httponly=True,
        max_age=settings.jwt_access_token_expire_minutes * 60,
        path="/",
        samesite=settings.session_same_site,
        secure=settings.session_https_only,
    )
    response.set_cookie(
        key=settings.auth_refresh_cookie_name,
        value=auth_result["refresh_token"],
        httponly=True,
        max_age=settings.auth_refresh_token_expire_days * 24 * 60 * 60,
        path="/",
        samesite=settings.session_same_site,
        secure=settings.session_https_only,
    )
    response.set_cookie(
        key=settings.auth_csrf_cookie_name,
        value=auth_result["csrf_token"],
        httponly=False,
        max_age=settings.auth_refresh_token_expire_days * 24 * 60 * 60,
        path="/",
        samesite=settings.session_same_site,
        secure=settings.session_https_only,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        settings.auth_access_cookie_name,
        path="/",
        samesite=settings.session_same_site,
        secure=settings.session_https_only,
    )


def _set_no_store_headers(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


def _get_request_client_ip(request: Request) -> str | None:
    if settings.trust_proxy_headers:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",", maxsplit=1)[0].strip() or None

        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip() or None

    return request.client.host if request.client is not None else None


def _build_frontend_redirect_url(auth_error: str | None = None) -> str:
    parsed = urlsplit(settings.frontend_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError("FRONTEND_URL must be an absolute http(s) URL")

    query_params = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key != "auth_error"
    ]
    if auth_error is not None:
        query_params.append(("auth_error", auth_error))

    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path or "/",
            urlencode(query_params),
            "",
        )
    )
    response.delete_cookie(
        settings.auth_refresh_cookie_name,
        path="/",
        samesite=settings.session_same_site,
        secure=settings.session_https_only,
    )
    response.delete_cookie(
        settings.auth_csrf_cookie_name,
        path="/",
        samesite=settings.session_same_site,
        secure=settings.session_https_only,
    )


def require_csrf_for_cookie_auth(request: Request) -> None:
    if request.method.upper() in {"GET", "HEAD", "OPTIONS"}:
        return

    if request.headers.get("Authorization"):
        return

    access_cookie = request.cookies.get(settings.auth_access_cookie_name)
    refresh_cookie = request.cookies.get(settings.auth_refresh_cookie_name)
    if access_cookie is None and refresh_cookie is None:
        return

    csrf_cookie = request.cookies.get(settings.auth_csrf_cookie_name)
    csrf_header = request.headers.get("X-CSRF-Token")
    if (
        not csrf_cookie
        or not csrf_header
        or not secrets.compare_digest(csrf_cookie, csrf_header)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed",
        )


# --- Dependencies for Protecting Endpoints ---


async def get_current_user(
    request: Request,
    token: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    repo: IUserRepository = Depends(get_user_repository),
    auth_session_repo: IAuthSessionRepository = Depends(get_auth_session_repository),
    token_provider: ITokenProvider = Depends(get_token_provider),
) -> User:
    raw_token = token.credentials if token is not None else None
    if raw_token is None:
        raw_token = request.cookies.get(settings.auth_access_cookie_name)

    if raw_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = token_provider.verify_access_token(raw_token)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if claims.session_id is not None:
        auth_session = await auth_session_repo.get_active_by_session_id(
            claims.session_id, auth_service_now()
        )
        if auth_session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    user = await repo.get_by_email(claims.subject)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user"
        )
    return user


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.email.lower() != settings.admin_email.strip().lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )
    return current_user


def auth_service_now() -> datetime:
    return datetime.now(timezone.utc)


# --- Endpoints ---


@router.get("/login")
async def login(request: Request, auth: AuthProvider = Depends(get_auth_provider)):
    """Route 1: Send the user to Google"""
    # Fallback to current URL if gcp_redirect_uri is empty
    redirect_uri = settings.gcp_redirect_uri or str(request.url_for("auth_callback"))
    return await auth.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def auth_callback(
    request: Request,
    auth: AuthProvider = Depends(get_auth_provider),
    auth_service: AuthBusinessService = Depends(get_auth_business_service),
):
    """Route 2: Google sends the user back here with a 'code'"""
    try:
        user_info = await auth.authorize_access_token(request)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OAuth token verification failed",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth verification error: {str(exc)}",
        ) from exc

    # At this point, you have the user's email!
    try:
        result = await auth_service.process_google_user(
            user_info,
            user_agent=request.headers.get("user-agent"),
            ip_address=_get_request_client_ip(request),
        )
        response = RedirectResponse(url=_build_frontend_redirect_url())
        _set_auth_cookies(response, result)
        _set_no_store_headers(response)
        return response
    except PermissionError:
        response = RedirectResponse(url=_build_frontend_redirect_url("inactive"))
        _clear_auth_cookies(response)
        _set_no_store_headers(response)
        return response
    except Exception:
        response = RedirectResponse(url=_build_frontend_redirect_url("server_error"))
        _clear_auth_cookies(response)
        _set_no_store_headers(response)
        return response


@router.get("/me", response_model=UserMeRead)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Example of an endpoint protected by JWT Token.
    Only logged-in users sending a valid Bearer token can access this."""
    return UserMeRead(
        email=current_user.email,
        name=current_user.name,
        picture=current_user.picture,
        provider=current_user.provider,
        is_active=current_user.is_active,
        is_admin=current_user.email.lower() == settings.admin_email.strip().lower(),
    )


@router.post("/refresh")
async def refresh_auth_session(
    request: Request,
    _: None = Depends(require_csrf_for_cookie_auth),
    auth_service: AuthBusinessService = Depends(get_auth_business_service),
):
    refresh_token = request.cookies.get(settings.auth_refresh_cookie_name)
    if refresh_token is None:
        response = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Refresh token missing"},
        )
        _clear_auth_cookies(response)
        return response

    try:
        result = await auth_service.refresh_session(
            refresh_token,
            user_agent=request.headers.get("user-agent"),
            ip_address=_get_request_client_ip(request),
        )
    except PermissionError:
        response = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Refresh failed"},
        )
        _clear_auth_cookies(response)
        _set_no_store_headers(response)
        return response

    response = JSONResponse({"message": "Session refreshed"})
    _set_auth_cookies(response, result)
    _set_no_store_headers(response)
    return response


@router.post("/logout")
async def logout(
    request: Request,
    _: None = Depends(require_csrf_for_cookie_auth),
    auth_service: AuthBusinessService = Depends(get_auth_business_service),
):
    refresh_token = request.cookies.get(settings.auth_refresh_cookie_name)
    if refresh_token is not None:
        await auth_service.revoke_session(refresh_token)

    response = JSONResponse({"message": "Logged out"})
    _clear_auth_cookies(response)
    _set_no_store_headers(response)
    return response


@router.post("/activate")
async def activate_user(
    email: str,
    _: None = Depends(require_csrf_for_cookie_auth),
    admin_user: User = Depends(get_admin_user),
    auth_service: AuthBusinessService = Depends(get_auth_business_service),
):
    """Admin-only endpoint to activate a user account."""
    try:
        await auth_service.activate_user(email)
        return {"message": f"User {email} activated successfully."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/deactivate")
async def deactivate_user(
    email: str,
    _: None = Depends(require_csrf_for_cookie_auth),
    admin_user: User = Depends(get_admin_user),
    auth_service: AuthBusinessService = Depends(get_auth_business_service),
):
    """Admin-only endpoint to deactivate a user account."""
    try:
        await auth_service.deactivate_user(email)
        return {"message": f"User {email} deactivated successfully."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/users", response_model=list[UserRead])
async def get_all_users(
    admin_user: User = Depends(get_admin_user),
    auth_service: AuthBusinessService = Depends(get_auth_business_service),
):
    """Admin-only endpoint to get list of all users and their status."""
    return await auth_service.get_all_users()
