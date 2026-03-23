from sqlalchemy.orm import Session
from .models import Plant, User
from abc import ABC, abstractmethod
from typing import Protocol
import os
import uuid


class ImageStorageProtocol(Protocol):
    def save_image(self, filename: str, image_bytes: bytes) -> str:
        """Saves an image and returns its public URL path."""
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
