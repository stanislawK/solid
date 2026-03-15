from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.services import AuthProvider, GoogleAuthProvider, AuthBusinessService
from app.repositories import IUserRepository, SQLAlchemyUserRepository
from app.db import get_db
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# --- Composition Root (Dependency Injection) ---


def get_auth_provider() -> AuthProvider:
    return GoogleAuthProvider(
        client_id=settings.gcp_client_id,
        client_secret=settings.gcp_client_secret,
    )


def get_user_repository(db: Session = Depends(get_db)) -> IUserRepository:
    return SQLAlchemyUserRepository(db)


def get_auth_business_service(
    repo: IUserRepository = Depends(get_user_repository),
) -> AuthBusinessService:
    return AuthBusinessService(repo)


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
    return auth_service.process_google_user(user_info)
