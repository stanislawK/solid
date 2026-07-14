from __future__ import annotations

from app.models import Plant
from app.services.image import ImageUrlValidatorProtocol, UnsafeImageUrlError
from app.services.plants import PlantService


class FakeImageDownloader:
    def __init__(self, content: bytes = b"fake-bytes"):
        self.content = content
        self.calls: list[tuple[str, str, str]] = []

    async def download_image(self, url: str, hostname: str, resolved_ip: str) -> bytes:
        self.calls.append((url, hostname, resolved_ip))
        return self.content


class FakeImageValidator:
    def __init__(self, valid: bool = True):
        self.valid = valid

    def validate_image(self, file_bytes: bytes) -> bool:
        return self.valid


class FakeImageUrlValidator(ImageUrlValidatorProtocol):
    def __init__(self, resolved_ip: str = "93.184.216.34", reject: bool = False):
        self.resolved_ip = resolved_ip
        self.reject = reject

    async def validate_url(self, url: str) -> tuple[str, str, str]:
        if self.reject:
            raise UnsafeImageUrlError("URL rejected by fake validator")
        return url, "example.com", self.resolved_ip


class FakeImageStorage:
    def __init__(self):
        self.saved: list[tuple[str, bytes]] = []
        self.deleted: list[str] = []

    def save_image(self, filename: str, image_bytes: bytes) -> str:
        self.saved.append((filename, image_bytes))
        return "/images/fake.jpg"

    def delete_image(self, image_url: str) -> None:
        self.deleted.append(image_url)


class FakePlantRepository:
    def __init__(self, plants: list[Plant] | None = None):
        self._plants = {p.id: p for p in (plants or [])}

    async def save(self, plant: Plant) -> Plant:
        if plant.id is None:
            plant.id = len(self._plants) + 1
        self._plants[plant.id] = plant
        return plant

    async def get_by_id(self, plant_id: int) -> Plant | None:
        return self._plants.get(plant_id)

    async def get_all_by_user_id(self, user_id: int) -> list[Plant]:
        return [p for p in self._plants.values() if p.user_id == user_id]

    async def search_all_by_user_id(self, user_id: int, query: str) -> list[Plant]:
        return [p for p in self._plants.values() if p.user_id == user_id]

    async def get_by_id_and_user_id(self, plant_id: int, user_id: int) -> Plant | None:
        plant = self._plants.get(plant_id)
        if plant and plant.user_id == user_id:
            return plant
        return None

    async def delete(self, plant: Plant) -> None:
        self._plants.pop(plant.id, None)


def make_plant_service(
    *,
    image_downloader=None,
    image_url_validator=None,
    image_validator=None,
    storage_repo=None,
    repository=None,
) -> PlantService:
    return PlantService(
        repository=repository or FakePlantRepository(),
        summarizer=None,
        wiki_provider=None,
        image_downloader=image_downloader or FakeImageDownloader(),
        storage_repo=storage_repo or FakeImageStorage(),
        image_validator=image_validator or FakeImageValidator(),
        image_url_validator=image_url_validator or FakeImageUrlValidator(),
    )
