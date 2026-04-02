from datetime import datetime
from sqlalchemy.orm import Session
from .models import AuthSession, Plant, User
from abc import ABC, abstractmethod
from typing import Protocol
import os
import uuid


class ImageStorageProtocol(Protocol):
    def save_image(self, filename: str, image_bytes: bytes) -> str:
        """Saves an image and returns its public URL path."""
        ...

    def delete_image(self, image_url: str) -> None:
        """Deletes an image by its public URL path."""
        ...


class LocalVolumeStorage(ImageStorageProtocol):
    def __init__(self, storage_dir: str = "data/images", base_url: str = "/images"):
        self.storage_dir = storage_dir
        self.base_url = base_url
        os.makedirs(self.storage_dir, exist_ok=True)

    def save_image(self, filename: str, image_bytes: bytes) -> str:
        ext = filename.split(".")[-1] if "." in filename else "jpg"
        unique_name = f"{uuid.uuid4().hex}.{ext}"
        filepath = os.path.join(self.storage_dir, unique_name)
        with open(filepath, "wb") as f:
            f.write(image_bytes)
        return f"{self.base_url}/{unique_name}"

    def delete_image(self, image_url: str) -> None:
        if not image_url.startswith(self.base_url):
            return
        filename = image_url[len(self.base_url) :].lstrip("/")
        filepath = os.path.join(self.storage_dir, filename)
        if os.path.exists(filepath):
            os.remove(filepath)


"""
D: Dependency Inversion Principle (DIP)
Dependency Inversion says the PlantService should depend on an Interface (Abstraction), and the PlantRepository should also implement that same Interface.
Why do we do this? Because now, for your Unit Tests, you can create a FakeTestRepository that just saves plants in a Python list
"""


class IPlantRepository(ABC):
    @abstractmethod
    def save(self, plant: Plant) -> Plant:
        pass

    @abstractmethod
    def get_by_id(self, plant_id: int) -> Plant | None:
        pass

    @abstractmethod
    def get_all_by_user_id(self, user_id: int) -> list[Plant]:
        pass

    @abstractmethod
    def get_by_id_and_user_id(self, plant_id: int, user_id: int) -> Plant | None:
        pass

    @abstractmethod
    def delete(self, plant: Plant) -> None:
        pass


class SQLAlchemyPlantRepository(IPlantRepository):
    def __init__(self, db: Session):
        self.db = db

    def save(self, plant: Plant) -> Plant:
        self.db.add(plant)
        self.db.commit()
        self.db.refresh(plant)
        return plant

    def get_by_id(self, plant_id: int) -> Plant | None:
        return self.db.query(Plant).filter(Plant.id == plant_id).first()

    def get_all_by_user_id(self, user_id: int) -> list[Plant]:
        return (
            self.db.query(Plant)
            .filter(Plant.user_id == user_id)
            .order_by(Plant.id)
            .all()
        )

    def get_by_id_and_user_id(self, plant_id: int, user_id: int) -> Plant | None:
        return (
            self.db.query(Plant)
            .filter(Plant.id == plant_id, Plant.user_id == user_id)
            .first()
        )

    def delete(self, plant: Plant) -> None:
        self.db.delete(plant)
        self.db.commit()


class IAuthSessionRepository(ABC):
    @abstractmethod
    def create(self, auth_session: AuthSession) -> AuthSession:
        pass

    @abstractmethod
    def get_active_by_refresh_token_hash(
        self, refresh_token_hash: str, now: datetime
    ) -> AuthSession | None:
        pass

    @abstractmethod
    def get_active_by_session_id(
        self, session_id: str, now: datetime
    ) -> AuthSession | None:
        pass

    @abstractmethod
    def rotate(
        self,
        auth_session: AuthSession,
        refresh_token_hash: str,
        expires_at: datetime,
        last_used_at: datetime,
        user_agent: str | None,
        ip_address: str | None,
    ) -> AuthSession:
        pass

    @abstractmethod
    def revoke(self, auth_session: AuthSession, revoked_at: datetime) -> AuthSession:
        pass

    @abstractmethod
    def revoke_all_for_user(self, user_id: int, revoked_at: datetime) -> None:
        pass


class IUserRepository(ABC):
    @abstractmethod
    def get_by_email(self, email: str) -> User | None:
        pass

    @abstractmethod
    def get_by_id(self, user_id: int) -> User | None:
        pass

    @abstractmethod
    def create(self, user: User) -> User:
        pass

    @abstractmethod
    def update(self, user: User) -> User:
        pass

    @abstractmethod
    def get_all(self) -> list[User]:
        pass


class SQLAlchemyUserRepository(IUserRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email).first()

    def get_by_id(self, user_id: int) -> User | None:
        return self.db.query(User).filter(User.id == user_id).first()

    def create(self, user: User) -> User:
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update(self, user: User) -> User:
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def get_all(self) -> list[User]:
        return self.db.query(User).all()


class SQLAlchemyAuthSessionRepository(IAuthSessionRepository):
    def __init__(self, db: Session):
        self.db = db

    def create(self, auth_session: AuthSession) -> AuthSession:
        self.db.add(auth_session)
        self.db.commit()
        self.db.refresh(auth_session)
        return auth_session

    def get_active_by_refresh_token_hash(
        self, refresh_token_hash: str, now: datetime
    ) -> AuthSession | None:
        return (
            self.db.query(AuthSession)
            .filter(
                AuthSession.refresh_token_hash == refresh_token_hash,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now,
            )
            .first()
        )

    def get_active_by_session_id(
        self, session_id: str, now: datetime
    ) -> AuthSession | None:
        return (
            self.db.query(AuthSession)
            .filter(
                AuthSession.session_id == session_id,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now,
            )
            .first()
        )

    def rotate(
        self,
        auth_session: AuthSession,
        refresh_token_hash: str,
        expires_at: datetime,
        last_used_at: datetime,
        user_agent: str | None,
        ip_address: str | None,
    ) -> AuthSession:
        auth_session.refresh_token_hash = refresh_token_hash
        auth_session.expires_at = expires_at
        auth_session.last_used_at = last_used_at
        auth_session.user_agent = user_agent
        auth_session.ip_address = ip_address
        self.db.add(auth_session)
        self.db.commit()
        self.db.refresh(auth_session)
        return auth_session

    def revoke(self, auth_session: AuthSession, revoked_at: datetime) -> AuthSession:
        auth_session.revoked_at = revoked_at
        self.db.add(auth_session)
        self.db.commit()
        self.db.refresh(auth_session)
        return auth_session

    def revoke_all_for_user(self, user_id: int, revoked_at: datetime) -> None:
        (
            self.db.query(AuthSession)
            .filter(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .update({AuthSession.revoked_at: revoked_at}, synchronize_session=False)
        )
        self.db.commit()
