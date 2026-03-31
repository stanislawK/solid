from pydantic import BaseModel, Field


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


class WikimediaImageResponse(BaseModel):
    latin_name: str = Field(
        description="The Latin plant name used for Wikimedia Commons lookup"
    )
    image_url: str | None = Field(
        default=None,
        description="Direct Wikimedia Commons image URL, or null when nothing was found",
    )


class WikipediaRequest(BaseModel):
    article_title: str = Field(
        ...,
        description="The exact title of the Wikipedia page to fetch data from.",
        min_length=1,
        examples=["Monstera deliciosa"],
    )
    preferred_image_url: str | None = Field(
        default=None,
        description="Previously stored local image URL to keep on the created plant instead of fetching a Wikipedia image.",
        examples=["/images/monstera.jpg"],
    )


class PlantNameRequest(BaseModel):
    plant_name: str = Field(
        ...,
        description="The name of the plant to generate data for.",
        min_length=1,
        examples=["Fikus"],
    )
    preferred_image_url: str | None = Field(
        default=None,
        description="Previously stored local image URL to keep on the created plant and skip Wikimedia image lookup.",
        examples=["/images/fikus.jpg"],
    )
