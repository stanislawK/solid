from pydantic import BaseModel, Field


class AiPlantProposal(BaseModel):
    name: str = Field(description="Name of the plant in Polish")
    latin_name: str | None = Field(
        default=None, description="Name of the plant in Latin"
    )


class AiPlantProposals(BaseModel):
    proposals: list[AiPlantProposal] = Field(
        description="List of top 3 proposals for the plant identity"
    )


class AiPlantIdentificationResponse(BaseModel):
    image_url: str
    proposals: list[AiPlantProposal]
