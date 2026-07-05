from __future__ import annotations

import pytest

from app.models import Plant
from app.services.image import UnsafeImageUrlError
from tests.conftest import (
    FakeImageUrlValidator,
    FakePlantRepository,
    make_plant_service,
)


async def test_update_plant_image_from_url_propagates_ssrf_rejection():
    plant = Plant(
        id=1,
        name="Monstera",
        watering=5,
        light=5,
        user_id=1,
    )
    repository = FakePlantRepository([plant])
    service = make_plant_service(
        repository=repository,
        image_url_validator=FakeImageUrlValidator(reject=True),
    )

    with pytest.raises(UnsafeImageUrlError):
        await service.update_plant_image_from_url(
            plant.id, plant.user_id, "http://169.254.169.254/latest/meta-data/"
        )


async def test_update_plant_image_from_url_succeeds_for_safe_url():
    plant = Plant(
        id=1,
        name="Monstera",
        watering=5,
        light=5,
        user_id=1,
    )
    repository = FakePlantRepository([plant])
    service = make_plant_service(repository=repository)

    updated = await service.update_plant_image_from_url(
        plant.id, plant.user_id, "http://example.com/a.jpg"
    )
    assert updated.image_url == "/images/fake.jpg"
