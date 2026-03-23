from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.repositories import SQLAlchemyPlantRepository, LocalVolumeStorage
from app.schemas import PlantCreate, PlantRead, WikipediaRequest
from app.services import (
    PlantService,
    WikipediaService,
    GeminiPlantSummarizer,
    CurlImageDownloader,
)
from app.config import settings
from app.routers.auth import get_current_user
from typing_extensions import Annotated

router = APIRouter(prefix="/plants", tags=["plants"])


# --- Composition Root (Dependency Injection) ---


def get_plant_service(db: Session = Depends(get_db)) -> PlantService:
    """
    This is the only place that knows about 'Concrete' classes.
    It assembles the 'Lego blocks' for the rest of the app.
    """
    # 1. Repositories (Data Access)
    repo = SQLAlchemyPlantRepository(db)
    storage = LocalVolumeStorage(storage_dir=settings.storage_dir)

    # 2. External Providers (Infrastructure)
    wiki = WikipediaService(browser=settings.browser)
    summarizer = GeminiPlantSummarizer(api_key=settings.gem_api_key)
    downloader = CurlImageDownloader(browser=settings.browser)

    # 3. The Service (Business Logic)
    return PlantService(
        repository=repo,
        summarizer=summarizer,
        wiki_provider=wiki,
        image_downloader=downloader,
        storage_repo=storage,
    )


# --- Endpoints ---


@router.post("/wiki", response_model=PlantRead, status_code=status.HTTP_201_CREATED)
async def create_plant_from_wikipedia(
    request: WikipediaRequest,
    service: Annotated[PlantService, Depends(get_plant_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PlantRead:
    """
    Endpoint to trigger the Wikipedia + LLM flow.
    """
    try:
        # The Router only orchestrates the call and handles HTTP specifics (errors/status)
        plant = service.create_from_wiki(request.article_title, current_user.id)
        return PlantRead.model_validate(plant)

    except Exception as e:
        # SRP: The service throws the error, the router decides the HTTP status code
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not process plant data: {str(e)}",
        )


@router.post("/", response_model=PlantRead, status_code=status.HTTP_201_CREATED)
def create_plant_manually(
    payload: PlantCreate,
    service: Annotated[PlantService, Depends(get_plant_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PlantRead:
    """
    Classic manual creation (SRP: Reuse the same service logic).
    """
    plant = service.create_manual(payload, current_user.id)
    return PlantRead.model_validate(plant)


@router.get("", response_model=list[PlantRead])
def list_plants(
    service: Annotated[PlantService, Depends(get_plant_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[PlantRead]:
    plants = service.get_all_for_user(current_user.id)
    return [PlantRead.model_validate(p) for p in plants]


@router.get("/{plant_id}", response_model=PlantRead)
def get_plant(
    plant_id: int,
    service: Annotated[PlantService, Depends(get_plant_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PlantRead:
    plant = service.get_one_for_user(plant_id, current_user.id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plant not found"
        )
    return PlantRead.model_validate(plant)
