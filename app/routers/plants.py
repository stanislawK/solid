from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Plant
from app.repositories import SQLAlchemyPlantRepository
from app.schemas import PlantCreate, PlantRead, WikipediaRequest
from app.services import (
    PlantService,
    WikipediaService,
    GeminiPlantSummarizer,
)
from app.config import settings
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

    # 2. External Providers (Infrastructure)
    wiki = WikipediaService(browser=settings.browser)
    summarizer = GeminiPlantSummarizer(api_key=settings.gem_api_key)

    # 3. The Service (Business Logic)
    return PlantService(repository=repo, summarizer=summarizer, wiki_provider=wiki)


# --- Endpoints ---


@router.post("/wiki", response_model=PlantRead, status_code=status.HTTP_201_CREATED)
async def create_plant_from_wikipedia(
    request: WikipediaRequest,
    service: Annotated[PlantService, Depends(get_plant_service)],
) -> PlantRead:
    """
    Endpoint to trigger the Wikipedia + LLM flow.
    """
    try:
        # The Router only orchestrates the call and handles HTTP specifics (errors/status)
        plant = service.create_from_wiki(request.article_title)
        return PlantRead.model_validate(plant)

    except Exception as e:
        # SRP: The service throws the error, the router decides the HTTP status code
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not process plant data: {str(e)}",
        )


@router.post("/", response_model=PlantRead, status_code=status.HTTP_201_CREATED)
def create_plant_manually(
    payload: PlantCreate, service: Annotated[PlantService, Depends(get_plant_service)]
) -> PlantRead:
    """
    Classic manual creation (SRP: Reuse the same service logic).
    """
    plant = service.create_manual(payload)
    return PlantRead.model_validate(plant)


@router.get("", response_model=list[PlantRead])
def list_plants(db: Session = Depends(get_db)) -> list[PlantRead]:
    plants = db.execute(select(Plant).order_by(Plant.id)).scalars().all()
    return [PlantRead.model_validate(p) for p in plants]


@router.get("/{plant_id}", response_model=PlantRead)
def get_plant(plant_id: int, db: Session = Depends(get_db)) -> PlantRead:
    plant = db.get(Plant, plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plant not found"
        )
    return PlantRead.model_validate(plant)
