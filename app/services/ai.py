from __future__ import annotations

from typing import Protocol

from google import genai

from app.schemas.plants import PlantCreate
from app.schemas.plants_ai import AiPlantProposals


class IPlantIdentifier(Protocol):
    def identify_plant(
        self, image_bytes: bytes, mime_type: str
    ) -> AiPlantProposals: ...


class IPlantSummarizer(Protocol):
    def summarize_plant_data(self, raw_text: str, article_title: str) -> PlantCreate:
        """
        Takes raw text and returns a PlantCreate object with the fields: 'name', 'latin_name',
        'description', 'watering', and 'light'.
        """
        ...

    def generate_plant_data_from_name(self, plant_name: str) -> PlantCreate:
        """
        Takes a plant name and generates a PlantCreate object.
        """
        ...


class GeminiPlantSummarizer:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model

    def summarize_plant_data(self, raw_text: str, article_title: str) -> PlantCreate:
        prompt = f"""
        Based on the following Wikipedia text, extract or infer the following:
        1. General description in polish (5-10 sentences)
        2. Name of a plant in Latin (if available)
        3. Name of a plant in Polish: {article_title}
        4. Watering needs (1-10 scale)
        5. Light needs (1-10 scale)
        
        Text: {raw_text}
        """
        response = self.client.models.generate_content(
            model=self.model,
            contents={"text": prompt},
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=PlantCreate,
            ),
        )
        self.client.close()
        if response.text is None:
            raise ValueError("Gemini response text is None")
        return PlantCreate.model_validate_json(response.text)

    def generate_plant_data_from_name(self, plant_name: str) -> PlantCreate:
        system_instruction = (
            "You are a strict botanical expert. You must only provide data for indoor houseplants. "
            "Write the description strictly in Polish (5-10 sentences). "
            "If the plant is unknown, imaginary, or not a houseplant, you MUST set the 'name' field "
            "strictly to 'NOT_A_HOUSEPLANT' and you can fill other fields with any strictly valid dummy values."
        )
        prompt = f"""
        Check if the plant '{plant_name}' exists and is a houseplant.
        Output the Polish description, Latin name, watering needs (1-10), and light needs (1-10).
        Output an image_search_query (ideally the Latin name).
        """
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=PlantCreate,
                temperature=0.1,
                system_instruction=system_instruction,
            ),
        )
        self.client.close()
        if response.text is None:
            raise ValueError("Gemini response text is None")

        result = PlantCreate.model_validate_json(response.text)
        if result.name == "NOT_A_HOUSEPLANT":
            raise ValueError(
                f"The plant '{plant_name}' is not recognized as a valid indoor houseplant."
            )
        return result


class GeminiPlantIdentifier(IPlantIdentifier):
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model

    def identify_plant(self, image_bytes: bytes, mime_type: str) -> AiPlantProposals:
        prompt = """
        You are an expert botanist and horticulturist. Your task is to accurately identify the plant in the provided image.
        Focus on recognizable features like leaf shape, venation, color patterns, and plant structure.
        Provide your top 3 most probable candidates. For each candidate, provide the name in Polish and the Latin name.
        """
        response = self.client.models.generate_content(
            model=self.model,
            contents=[
                genai.types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt,
            ],
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AiPlantProposals,
            ),
        )
        self.client.close()
        if response.text is None:
            raise ValueError("Gemini response text is None")
        return AiPlantProposals.model_validate_json(response.text)
