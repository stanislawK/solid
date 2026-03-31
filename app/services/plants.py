from __future__ import annotations

from abc import ABC, abstractmethod

from app.models import Plant
from app.repositories import IPlantRepository, ImageStorageProtocol
from app.schemas.plants import PlantCreate, PlantUpdate
from app.schemas.plants_ai import AiPlantIdentificationResponse

from .ai import IPlantIdentifier, IPlantSummarizer
from .image import (
    ImageDownloaderProtocol,
    ImageProcessorProtocol,
    ImageValidatorProtocol,
)
from .wiki import WikipediaProvider


"""
O: Open/Closed Principle (OCP)
We want the PlantService to be open to new watering behaviors but closed to modifications. We do this by creating a "Watering Strategy."
"""


class WateringStrategy(ABC):
    @abstractmethod
    def calculate_schedule(self, plant_data) -> str:
        pass


class DesertStrategy(WateringStrategy):
    def calculate_schedule(self, plant_data) -> str:
        return "Water once every 2 weeks."


class TropicalStrategy(WateringStrategy):
    def calculate_schedule(self, plant_data) -> str:
        return "Water daily and mist leaves."


class PlantService:
    def __init__(
        self,
        repository: IPlantRepository,
        summarizer: IPlantSummarizer,
        wiki_provider: WikipediaProvider,
        image_downloader: ImageDownloaderProtocol,
        storage_repo: ImageStorageProtocol,
        image_validator: ImageValidatorProtocol,
        identifier: IPlantIdentifier | None = None,
        image_processor: ImageProcessorProtocol | None = None,
    ):
        self.repository = repository
        self.summarizer = summarizer
        self.wiki_provider = wiki_provider
        self.image_downloader = image_downloader
        self.storage_repo = storage_repo
        self.image_validator = image_validator
        self.identifier = identifier
        self.image_processor = image_processor

    def _remove_existing_image(self, plant: Plant) -> None:
        if plant.image_url:
            self.storage_repo.delete_image(plant.image_url)

    def _store_image_bytes(self, filename: str, image_bytes: bytes) -> str:
        if not self.image_validator.validate_image(image_bytes):
            raise ValueError("Invalid image file format")

        return self.storage_repo.save_image(filename, image_bytes)

    def _download_and_store_image(self, image_url: str) -> str:
        image_bytes = self.image_downloader.download_image(image_url)
        return self._store_image_bytes(image_url, image_bytes)

    def _replace_plant_image(self, plant: Plant, local_image_url: str) -> Plant:
        self._remove_existing_image(plant)
        plant.image_url = local_image_url
        return self.repository.save(plant)

    def identify_from_image(
        self, file_bytes: bytes, filename: str, mime_type: str, user_id: int
    ) -> AiPlantIdentificationResponse:
        if not self.identifier or not self.image_processor:
            raise RuntimeError("Plant identifier or image processor is not configured")

        if not self.image_validator.validate_image(file_bytes):
            raise ValueError("Invalid image file format")

        optimized_bytes = self.image_processor.optimize_image(file_bytes)
        optimized_mime_type = "image/jpeg"
        optimized_filename = (
            filename.rsplit(".", 1)[0] + ".jpg"
            if "." in filename
            else filename + ".jpg"
        )

        local_image_url = self._store_image_bytes(optimized_filename, optimized_bytes)

        proposals_dto = self.identifier.identify_plant(
            optimized_bytes, optimized_mime_type
        )

        return AiPlantIdentificationResponse(
            image_url=local_image_url, proposals=proposals_dto.proposals
        )

    def create_from_wiki(
        self,
        article_title: str,
        user_id: int,
        preferred_image_url: str | None = None,
    ) -> Plant:
        raw_content = self.wiki_provider.get_article(article_title)

        local_image_url = preferred_image_url
        if local_image_url is None:
            image_url_wiki = self.wiki_provider.get_article_image_url(article_title)

            if image_url_wiki:
                try:
                    local_image_url = self._download_and_store_image(image_url_wiki)
                except Exception as e:
                    print(f"Failed to download/store image: {e}")

        plant_dto = self.summarizer.summarize_plant_data(
            raw_content, article_title=article_title
        )

        plant_data = plant_dto.model_dump()
        plant_data["image_url"] = local_image_url
        new_plant_model = Plant(**plant_data, user_id=user_id)
        return self.repository.save(new_plant_model)

    def create_from_name_ai(
        self,
        plant_name: str,
        user_id: int,
        preferred_image_url: str | None = None,
    ) -> Plant:
        plant_dto = self.summarizer.generate_plant_data_from_name(plant_name)

        plant_data = plant_dto.model_dump()
        if preferred_image_url is not None:
            plant_data["image_url"] = preferred_image_url
        new_plant_model = Plant(**plant_data, user_id=user_id)
        return self.repository.save(new_plant_model)

    def create_manual(self, plant_data: PlantCreate, user_id: int) -> Plant:
        new_plant_model = Plant(**plant_data.model_dump(), user_id=user_id)
        return self.repository.save(new_plant_model)

    def get_all_for_user(self, user_id: int) -> list[Plant]:
        return self.repository.get_all_by_user_id(user_id)

    def get_one_for_user(self, plant_id: int, user_id: int) -> Plant | None:
        return self.repository.get_by_id_and_user_id(plant_id, user_id)

    def update_plant(
        self, plant_id: int, user_id: int, update_data: PlantUpdate
    ) -> Plant:
        plant = self.get_one_for_user(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")

        updates = update_data.model_dump(exclude_unset=True)

        for key, value in updates.items():
            setattr(plant, key, value)
        return self.repository.save(plant)

    def update_plant_image(
        self, plant_id: int, user_id: int, image_bytes: bytes, filename: str
    ) -> Plant:
        plant = self.get_one_for_user(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")

        local_image_url = self._store_image_bytes(filename, image_bytes)
        return self._replace_plant_image(plant, local_image_url)

    def update_plant_image_from_url(
        self, plant_id: int, user_id: int, image_url: str
    ) -> Plant:
        plant = self.get_one_for_user(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")

        local_image_url = self._download_and_store_image(image_url)
        return self._replace_plant_image(plant, local_image_url)

    def delete_plant(self, plant_id: int, user_id: int) -> None:
        plant = self.get_one_for_user(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")

        self._remove_existing_image(plant)

        self.repository.delete(plant)
