from fastapi import APIRouter, Depends, HTTPException, status, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.repositories import SQLAlchemyPlantRepository, LocalVolumeStorage
from app.schemas import (
    PlantCreate,
    PlantImageUrlUpdate,
    PlantRead,
    WikipediaRequest,
    PlantNameRequest,
    PlantUpdate,
    AiPlantIdentificationResponse,
)
from app.services import (
    PlantService,
    WikipediaService,
    GeminiPlantSummarizer,
    CurlImageDownloader,
    PillowImageValidator,
    PillowImageProcessor,
    GeminiPlantIdentifier,
)
from app.config import settings
from app.routers.auth import get_current_user, require_csrf_for_cookie_auth
from typing_extensions import Annotated

router = APIRouter(
    prefix="/plants",
    tags=["plants"],
    dependencies=[Depends(require_csrf_for_cookie_auth)],
)


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
    validator = PillowImageValidator()

    processor = PillowImageProcessor()
    identifier = GeminiPlantIdentifier(api_key=settings.gem_api_key)

    # 3. The Service (Business Logic)
    return PlantService(
        repository=repo,
        summarizer=summarizer,
        wiki_provider=wiki,
        image_downloader=downloader,
        storage_repo=storage,
        image_validator=validator,
        identifier=identifier,
        image_processor=processor,
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
        plant = service.create_from_wiki(
            request.article_title,
            current_user.id,
            preferred_image_url=request.preferred_image_url,
        )
        return PlantRead.model_validate(plant)

    except Exception as e:
        # SRP: The service throws the error, the router decides the HTTP status code
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not process plant data: {str(e)}",
        )


@router.post(
    "/from-name-ai", response_model=PlantRead, status_code=status.HTTP_201_CREATED
)
async def create_plant_from_name_ai(
    request: PlantNameRequest,
    service: Annotated[PlantService, Depends(get_plant_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PlantRead:
    """
    Endpoint to trigger the pure LLM fallback flow from a plant name.
    """
    try:
        plant = service.create_from_name_ai(
            request.plant_name,
            current_user.id,
            preferred_image_url=request.preferred_image_url,
        )
        return PlantRead.model_validate(plant)

    except ValueError as e:
        # Expected domain errors (e.g. not a houseplant)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        # General errors
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not process plant data: {str(e)}",
        )


@router.post(
    "/identify",
    response_model=AiPlantIdentificationResponse,
    status_code=status.HTTP_200_OK,
)
async def identify_and_store_plant_image(
    file: UploadFile,
    service: Annotated[PlantService, Depends(get_plant_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> AiPlantIdentificationResponse:
    """
    Identify a plant from an uploaded image using AI, returning proposals and the saved image URL.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    image_bytes = await file.read()
    mime_type = file.content_type or "image/jpeg"

    try:
        response = service.identify_from_image(
            file_bytes=image_bytes,
            filename=file.filename,
            mime_type=mime_type,
            user_id=current_user.id,
        )
        return response
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not process image data: {str(e)}",
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
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


@router.patch("/{plant_id}", response_model=PlantRead)
def update_plant(
    plant_id: int,
    payload: PlantUpdate,
    service: Annotated[PlantService, Depends(get_plant_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PlantRead:
    try:
        plant = service.update_plant(plant_id, current_user.id, payload)
        return PlantRead.model_validate(plant)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/{plant_id}/image", response_model=PlantRead)
async def update_plant_image(
    plant_id: int,
    file: UploadFile,
    service: Annotated[PlantService, Depends(get_plant_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PlantRead:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    image_bytes = await file.read()
    try:
        plant = service.update_plant_image(
            plant_id, current_user.id, image_bytes, file.filename
        )
        return PlantRead.model_validate(plant)
    except ValueError as e:
        if "format" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/{plant_id}/image/from-url", response_model=PlantRead)
def update_plant_image_from_url(
    plant_id: int,
    payload: PlantImageUrlUpdate,
    service: Annotated[PlantService, Depends(get_plant_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PlantRead:
    try:
        plant = service.update_plant_image_from_url(
            plant_id, current_user.id, payload.image_url
        )
        return PlantRead.model_validate(plant)
    except ValueError as e:
        if "format" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not process image data: {str(e)}",
        )


@router.delete("/{plant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plant(
    plant_id: int,
    service: Annotated[PlantService, Depends(get_plant_service)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    try:
        service.delete_plant(plant_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
