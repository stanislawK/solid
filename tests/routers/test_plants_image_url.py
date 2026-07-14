from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.models import Plant, User
from app.routers.auth import get_current_user
from app.routers.plants import get_plant_service
from main import app
from tests.conftest import (
    FakeImageUrlValidator,
    FakePlantRepository,
    make_plant_service,
)


@pytest.fixture
def fake_user() -> User:
    return User(id=1, email="test@example.com", is_active=True)


@pytest.fixture
async def client(fake_user):
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://localhost") as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_plant_service, None)


async def test_rejects_ssrf_url_with_400(client, fake_user):
    plant = Plant(
        id=1,
        name="Monstera",
        watering=5,
        light=5,
        user_id=fake_user.id,
        added_at=datetime.now(timezone.utc),
    )
    service = make_plant_service(
        repository=FakePlantRepository([plant]),
        image_url_validator=FakeImageUrlValidator(reject=True),
    )
    app.dependency_overrides[get_plant_service] = lambda: service

    response = await client.put(
        f"/plants/{plant.id}/image/from-url",
        json={"image_url": "http://169.254.169.254/latest/meta-data/"},
    )
    assert response.status_code == 400
    assert "rejected" in response.json()["detail"].lower()


async def test_accepts_valid_url(client, fake_user):
    plant = Plant(
        id=1,
        name="Monstera",
        watering=5,
        light=5,
        user_id=fake_user.id,
        added_at=datetime.now(timezone.utc),
    )
    service = make_plant_service(repository=FakePlantRepository([plant]))
    app.dependency_overrides[get_plant_service] = lambda: service

    response = await client.put(
        f"/plants/{plant.id}/image/from-url",
        json={"image_url": "http://example.com/a.jpg"},
    )
    assert response.status_code == 200
    assert response.json()["image_url"] == "/images/fake.jpg"
