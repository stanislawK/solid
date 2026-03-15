from sqlalchemy.orm import Session
from .models import Plant, User
from abc import ABC, abstractmethod

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
