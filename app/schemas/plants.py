from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


"""
LSP says: You should be able to swap a parent for a child without the "client" (the code using it) ever knowing the difference.
If the child is stricter (making an optional field required), it's not a perfect substitute. It "breaks" the contract of the parent.
E.g. In our Plant API, if we have a SpecialPlant class that inherits from Plant, but for some reason, it cannot have a latin_name (maybe it throws an error if you try to set it), then we have broken LSP. Any code expecting a Plant would crash when it gets a SpecialPlant.
"""


class PlantBase(BaseModel):
    name: str
    latin_name: str | None = None
    description: str | None = None
    watering: int = Field(ge=1, le=10)
    light: int = Field(ge=1, le=10)
    image_url: str | None = None
    image_search_query: str | None = None


class PlantCreate(PlantBase):
    pass


class PlantUpdate(BaseModel):
    name: str | None = None
    latin_name: str | None = None
    description: str | None = None
    watering: int | None = Field(default=None, ge=1, le=10)
    light: int | None = Field(default=None, ge=1, le=10)


class PlantRead(PlantBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    added_at: datetime
    user_id: int
