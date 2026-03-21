from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.services import (
    AuthProvider,
    GoogleAuthProvider,
    AuthBusinessService,
    ITokenProvider,
    JWTTokenProvider,
)
from app.repositories import IUserRepository, SQLAlchemyUserRepository
from app.db import get_db
from app.config import settings
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

# Standard HTTP Bearer scheme for Swagger UI "Paste Token" UI
bearer_scheme = HTTPBearer()

# --- Composition Root (Dependency Injection) ---


def get_auth_provider() -> AuthProvider:
    return GoogleAuthProvider(
        client_id=settings.gcp_client_id,
        client_secret=settings.gcp_client_secret,
    )


def get_user_repository(db: Session = Depends(get_db)) -> IUserRepository:
    return SQLAlchemyUserRepository(db)


def get_token_provider() -> ITokenProvider:
    return JWTTokenProvider(
        secret_key=settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
        expire_minutes=settings.jwt_access_token_expire_minutes,
    )


def get_auth_business_service(
    repo: IUserRepository = Depends(get_user_repository),
    token_provider: ITokenProvider = Depends(get_token_provider),
) -> AuthBusinessService:
    return AuthBusinessService(repo, token_provider, admin_email=settings.admin_email)


# --- Dependencies for Protecting Endpoints ---


def get_current_user(
    token: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    repo: IUserRepository = Depends(get_user_repository),
    token_provider: ITokenProvider = Depends(get_token_provider),
) -> User:
    email = token_provider.verify_token(token.credentials)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = repo.get_by_email(email)
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
    if current_user.email != settings.admin_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )
    return current_user


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
        result = auth_service.process_google_user(user_info)
        access_token = result["access_token"]
        return RedirectResponse(url=f"{settings.frontend_url}/#access_token={access_token}")
    except PermissionError:
        return RedirectResponse(url=f"{settings.frontend_url}/#error=inactive")
    except Exception as exc:
        return RedirectResponse(url=f"{settings.frontend_url}/#error=server_error")


@router.get("/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Example of an endpoint protected by JWT Token.
    Only logged-in users sending a valid Bearer token can access this."""
    return {
        "email": current_user.email,
        "name": current_user.name,
        "provider": current_user.provider,
    }


@router.post("/activate")
async def activate_user(
    email: str,
    admin_user: User = Depends(get_admin_user),
    auth_service: AuthBusinessService = Depends(get_auth_business_service),
):
    """Admin-only endpoint to activate a user account."""
    try:
        auth_service.activate_user(email)
        return {"message": f"User {email} activated successfully."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/deactivate")
async def deactivate_user(
    email: str,
    admin_user: User = Depends(get_admin_user),
    auth_service: AuthBusinessService = Depends(get_auth_business_service),
):
    """Admin-only endpoint to deactivate a user account."""
    try:
        auth_service.deactivate_user(email)
        return {"message": f"User {email} deactivated successfully."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
