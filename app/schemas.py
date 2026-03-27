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
    image_url: str | None = None


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


class WikipediaSearch(BaseModel):
    title: str
    snippet: str
    thumbnail: str | None = None


class WikipediaResponse(BaseModel):
    search_term: str
    results: list[WikipediaSearch] = Field(
        description="List of related Wikipedia article titles"
    )


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


class AuthUserInfo(BaseModel):
    id: str | None = None
    email: str | None = None
    name: str | None = None
    picture: str | None = None
    provider: str | None = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserBase(BaseModel):
    email: str
    name: str
    picture: str | None = None
    provider: str
    is_active: bool = False


class UserCreate(UserBase):
    pass


class UserMeRead(UserBase):
    is_admin: bool = False


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class AiPlantProposal(BaseModel):
    name: str = Field(description="Name of the plant in Polish")
    latin_name: str | None = Field(default=None, description="Name of the plant in Latin")


class AiPlantProposals(BaseModel):
    proposals: list[AiPlantProposal] = Field(description="List of top 3 proposals for the plant identity")


class AiPlantIdentificationResponse(BaseModel):
    image_url: str
    proposals: list[AiPlantProposal]
