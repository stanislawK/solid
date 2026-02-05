from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: str = "ok"


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


class PlantCreate(PlantBase):
    pass


class PlantRead(PlantBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    added_at: datetime


class WikipediaResponse(BaseModel):
    search_term: str
    results: list[str] = Field(description="List of related Wikipedia article titles")


class WikipediaArticleResponse(BaseModel):
    title: str
    content: str = Field(description="Plain-text content of the Wikipedia article")


class WikipediaRequest(BaseModel):
    article_title: str = Field(
        ...,
        description="The exact title of the Wikipedia page to fetch data from.",
        min_length=1,
        examples=["Monstera deliciosa"],
    )
