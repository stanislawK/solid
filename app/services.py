import curl_cffi
from .schemas import (
    AuthUserInfo,
    PlantCreate,
    PlantUpdate,
    WikipediaSearch,
    AiPlantProposals,
    AiPlantIdentificationResponse,
)
from .repositories import IPlantRepository, IUserRepository, ImageStorageProtocol
from .models import Plant
from google import genai

from abc import ABC, abstractmethod
from typing import Protocol, cast
from fastapi import Request
from fastapi.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth
import jwt
from datetime import datetime, timezone, timedelta
from io import BytesIO
from PIL import Image, UnidentifiedImageError

"""
O: Open/Closed Principle (OCP)
We want the PlantService to be open to new watering behaviors but closed to modifications. We do this by creating a "Watering Strategy."
"""


class WateringStrategy(ABC):
    @abstractmethod
    def calculate_schedule(self, plant_data) -> str:
        pass


class DesertStrategy(WateringStrategy):
    def calculate_schedule(self, plant_data) -> str:
        return "Water once every 2 weeks."


class TropicalStrategy(WateringStrategy):
    def calculate_schedule(self, plant_data) -> str:
        return "Water daily and mist leaves."


class PlantService:
    def __init__(
        self,
        repository: IPlantRepository,
        summarizer: IPlantSummarizer,  # Injected Abstraction
        wiki_provider: WikipediaProvider,  # Injected Abstraction
        image_downloader: ImageDownloaderProtocol,
        storage_repo: ImageStorageProtocol,
        image_validator: ImageValidatorProtocol,  # Injected Abstraction
        identifier: IPlantIdentifier | None = None,
        image_processor: ImageProcessorProtocol | None = None,
    ):
        self.repository = repository
        self.summarizer = summarizer
        self.wiki_provider = wiki_provider
        self.image_downloader = image_downloader
        self.storage_repo = storage_repo
        self.image_validator = image_validator
        self.identifier = identifier
        self.image_processor = image_processor

    def identify_from_image(self, file_bytes: bytes, filename: str, mime_type: str, user_id: int) -> AiPlantIdentificationResponse:
        if not self.image_validator.validate_image(file_bytes):
            raise ValueError("Invalid image file format")
            
        if not self.identifier or not self.image_processor:
            raise RuntimeError("Plant identifier or image processor is not configured")

        # 1. Optimize image (decrease size & normalize to JPEG)
        optimized_bytes = self.image_processor.optimize_image(file_bytes)
        optimized_mime_type = "image/jpeg"
        # Since we convert to JPEG, let's force the stored filename extension to be .jpg
        optimized_filename = filename.rsplit(".", 1)[0] + ".jpg" if "." in filename else filename + ".jpg"

        # 2. Save the local image copy
        local_image_url = self.storage_repo.save_image(optimized_filename, optimized_bytes)

        # 3. Ask Gemini to identify the plant from the optimized image
        proposals_dto = self.identifier.identify_plant(optimized_bytes, optimized_mime_type)

        return AiPlantIdentificationResponse(
            image_url=local_image_url,
            proposals=proposals_dto.proposals
        )

    def create_from_wiki(self, article_title: str, user_id: int) -> Plant:
        # 1. Fetch raw data from Wikipedia
        raw_content = self.wiki_provider.get_article(article_title)

        # 2. Fetch image url
        image_url_wiki = self.wiki_provider.get_article_image_url(article_title)

        # 3. Download and store image if available
        local_image_url = None
        if image_url_wiki:
            try:
                image_bytes = self.image_downloader.download_image(image_url_wiki)
                local_image_url = self.storage_repo.save_image(
                    image_url_wiki, image_bytes
                )
            except Exception as e:
                print(f"Failed to download/store image: {e}")

        # 4 & 5. Summarize AND Validate in one go
        # We get a full PlantCreate object back, guaranteed valid!
        plant_dto = self.summarizer.summarize_plant_data(
            raw_content, article_title=article_title
        )

        # 6. Save
        plant_data = plant_dto.model_dump()
        plant_data["image_url"] = local_image_url
        new_plant_model = Plant(**plant_data, user_id=user_id)
        return self.repository.save(new_plant_model)

    def create_manual(self, plant_data: PlantCreate, user_id: int) -> Plant:
        new_plant_model = Plant(**plant_data.model_dump(), user_id=user_id)
        return self.repository.save(new_plant_model)

    def get_all_for_user(self, user_id: int) -> list[Plant]:
        return self.repository.get_all_by_user_id(user_id)

    def get_one_for_user(self, plant_id: int, user_id: int) -> Plant | None:
        return self.repository.get_by_id_and_user_id(plant_id, user_id)

    def update_plant(
        self, plant_id: int, user_id: int, update_data: PlantUpdate
    ) -> Plant:
        plant = self.get_one_for_user(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")
        for key, value in update_data.model_dump(exclude_unset=True).items():
            setattr(plant, key, value)
        return self.repository.save(plant)

    def update_plant_image(
        self, plant_id: int, user_id: int, image_bytes: bytes, filename: str
    ) -> Plant:
        if not self.image_validator.validate_image(image_bytes):
            raise ValueError("Invalid image file format")

        plant = self.get_one_for_user(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")

        # Delete old image if it exists
        if plant.image_url:
            self.storage_repo.delete_image(plant.image_url)

        local_image_url = self.storage_repo.save_image(filename, image_bytes)
        plant.image_url = local_image_url
        return self.repository.save(plant)

    def delete_plant(self, plant_id: int, user_id: int) -> None:
        plant = self.get_one_for_user(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")

        # Delete the associated image when deleting the plant
        if plant.image_url:
            self.storage_repo.delete_image(plant.image_url)

        self.repository.delete(plant)


# --- ABSTRACTION (DIP) ---


class WikipediaProvider(Protocol):
    """
    Protocol defining what a Wikipedia service must do.
    This is our 'Abstraction' layer.
    """

    def search_articles(self, term: str) -> list[WikipediaSearch]: ...
    def get_article(self, title: str) -> str: ...
    def get_article_image_url(self, title: str) -> str | None: ...


class ImageDownloaderProtocol(Protocol):
    def download_image(self, url: str) -> bytes: ...


class ImageValidatorProtocol(Protocol):
    def validate_image(self, file_bytes: bytes) -> bool: ...


class ImageProcessorProtocol(Protocol):
    def optimize_image(self, image_bytes: bytes) -> bytes: ...


class IPlantIdentifier(Protocol):
    def identify_plant(self, image_bytes: bytes, mime_type: str) -> AiPlantProposals: ...


class AuthProvider(Protocol):
    async def authorize_redirect(
        self, request: Request, redirect_uri: str
    ) -> RedirectResponse: ...
    async def authorize_access_token(self, request: Request) -> AuthUserInfo: ...


# S - Single Responsibility Principle (SRP): The WikipediaService has one job: communicating with the Wikipedia API. The FastAPI route has one job: handling the HTTP request/response. The Pydantic model has one job: validating data.
# O - Open/Closed Principle (OCP): The system is open for extension. If you wanted to switch to a different search engine (like DuckDuckGo), you could create a new class that follows the WikipediaProvider protocol without changing a single line of code in your FastAPI route.
# L - Liskov Substitution Principle (LSP): Because we use a Protocol, any class that implements search_articles(self, term: str) -> List[str] can be substituted for the WikipediaService. The router doesn't care about the implementation details; it only cares that the "contract" is fulfilled.
# I - Interface Segregation Principle (ISP): The WikipediaProvider protocol is lean. We didn't force it to include methods for "editing" or "deleting" articles if we only needed "searching." Clients (the route) aren't forced to depend on methods they don't use.
# D - Dependency Inversion Principle (DIP): The FastAPI route depends on the Protocol (WikipediaProvider), not the Concrete Class (WikipediaService). The "dependency is inverted" because both the high-level module (the route) and the low-level module (the service) depend on the abstraction (the protocol).


class WikipediaService:
    """
    Concrete implementation using the wikipedia-api library.
    """

    def __init__(
        self, browser: curl_cffi.requests.BrowserTypeLiteral, language: str = "pl"
    ):
        self.browser = browser
        self.language = language
        self.base_url = f"https://{language}.wikipedia.org/w/api.php"

    def search_articles(self, term: str) -> list[WikipediaSearch]:
        params = {
            "action": "query",
            "generator": "search",
            "gsrsearch": f"{term} incategory:Rośliny_pokojowe",
            "gsrlimit": 10,
            "prop": "pageimages|pageterms",  # to get both the image and the Wikidata description
            "piprop": "thumbnail",
            "pithumbsize": 120,  # to hit the Varnish cache
            "pilimit": 10,
            "wbptterms": "description",
            "format": "json",
            "formatversion": 2
        }
        try:
            response = curl_cffi.get(
                self.base_url,
                params=params,
                impersonate=cast(curl_cffi.requests.BrowserTypeLiteral, self.browser),
            )
            response.raise_for_status()
            data = response.json()
            pages = data.get("query", {}).get("pages", [])
            results = []
            for page in pages:
                title = page.get("title", "")
                
                snippet = ""
                if (terms := page.get("terms")) and (descriptions := terms.get("description")):
                    snippet = descriptions[0]
                
                thumbnail_source = None
                if thumbnail_info := page.get("thumbnail"):
                    thumbnail_source = thumbnail_info.get("source")
                
                results.append(
                    WikipediaSearch(
                        title=title, 
                        snippet=snippet, 
                        thumbnail=thumbnail_source
                    )
                )
            return results
        except Exception as e:
            print(f"Error fetching Wikipedia articles: {e}")
            return []

    def get_article(self, title: str) -> str:
        params = {
            "action": "query",
            "prop": "extracts",
            "explaintext": 1,
            "titles": title,
            "format": "json",
        }

        try:
            response = curl_cffi.get(
                self.base_url,
                params=params,
                impersonate=cast(curl_cffi.requests.BrowserTypeLiteral, self.browser),
            )
            response.raise_for_status()
            data = response.json()
            pages = data.get("query", {}).get("pages", {})
            if not pages:
                return ""
            page = next(iter(pages.values()))
            return page.get("extract", "")
        except Exception as e:
            print(f"Error fetching Wikipedia article: {e}")
            return ""

    def get_article_image_url(self, title: str) -> str | None:
        params = {
            "action": "query",
            "prop": "pageimages",
            "titles": title,
            "format": "json",
            "pithumbsize": 500,
        }
        try:
            response = curl_cffi.get(
                self.base_url,
                params=params,
                impersonate=cast(curl_cffi.requests.BrowserTypeLiteral, self.browser),
            )
            response.raise_for_status()
            data = response.json()
            pages = data.get("query", {}).get("pages", {})
            if not pages:
                return None
            page = next(iter(pages.values()))
            return page.get("thumbnail", {}).get("source")
        except Exception as e:
            print(f"Error fetching Wikipedia image URL: {e}")
            return None


class CurlImageDownloader(ImageDownloaderProtocol):
    def __init__(self, browser: curl_cffi.requests.BrowserTypeLiteral):
        self.browser = browser

    def download_image(self, url: str) -> bytes:
        response = curl_cffi.get(
            url,
            impersonate=cast(curl_cffi.requests.BrowserTypeLiteral, self.browser),
        )
        response.raise_for_status()
        return response.content


class PillowImageValidator(ImageValidatorProtocol):
    def validate_image(self, file_bytes: bytes) -> bool:
        try:
            with Image.open(BytesIO(file_bytes)) as img:
                img.verify()  # Verifies that it is, in fact, an image
            return True
        except (UnidentifiedImageError, IOError):
            return False


class PillowImageProcessor(ImageProcessorProtocol):
    def __init__(self, max_size: tuple[int, int] = (1024, 1024), quality: int = 85):
        self.max_size = max_size
        self.quality = quality

    def optimize_image(self, image_bytes: bytes) -> bytes:
        with Image.open(BytesIO(image_bytes)) as img:
            # Convert to RGB if necessary (e.g. for RGBA/PNG to JPEG)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            
            # thumbnail performs an in-place resize, preserving aspect ratio
            img.thumbnail(self.max_size, Image.Resampling.LANCZOS)
            
            out_bytes = BytesIO()
            img.save(out_bytes, format="JPEG", quality=self.quality)
            return out_bytes.getvalue()


class IPlantSummarizer(Protocol):
    def summarize_plant_data(self, raw_text: str, article_title: str) -> PlantCreate:
        """
        Takes raw text and returns a PlantCreate object with the fields: 'name', 'latin_name',
        'description', 'watering', and 'light'.
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
                prompt
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


class GoogleAuthProvider:
    def __init__(self, client_id: str, client_secret: str):
        self.oauth = OAuth()
        self.oauth.register(
            name="google",
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_id=client_id,
            client_secret=client_secret,
            client_kwargs={
                "scope": "openid email profile",
                "code_challenge_method": "S256",  # Enables PKCE for extra security
            },
        )

    async def authorize_redirect(
        self, request: Request, redirect_uri: str
    ) -> RedirectResponse:
        return await self.oauth.google.authorize_redirect(request, redirect_uri)

    async def authorize_access_token(self, request: Request) -> AuthUserInfo:
        try:
            token = await self.oauth.google.authorize_access_token(request)
            user_data = token.get("userinfo", {})
            return AuthUserInfo(
                id=user_data.get("sub"),
                email=user_data.get("email"),
                name=user_data.get("name"),
                picture=user_data.get("picture"),
                provider="google",
            )
        except Exception as exc:
            raise ValueError(f"Google OAuth verification failed: {exc}") from exc


class ITokenProvider(Protocol):
    def create_access_token(self, subject: str) -> str: ...
    def verify_token(self, token: str) -> str | None: ...


class JWTTokenProvider:
    def __init__(self, secret_key: str, algorithm: str, expire_minutes: int):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.expire_minutes = expire_minutes

    def create_access_token(self, subject: str) -> str:
        expire = datetime.now(timezone.utc) + timedelta(minutes=self.expire_minutes)
        to_encode = {"exp": int(expire.timestamp()), "sub": str(subject)}
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)

    def verify_token(self, token: str) -> str | None:
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload.get("sub")
        except jwt.InvalidTokenError:
            return None


class AuthBusinessService:
    def __init__(
        self,
        user_repo: IUserRepository,
        token_provider: ITokenProvider,
        admin_email: str = "",
    ):
        self.user_repo = user_repo
        self.token_provider = token_provider
        self.admin_email = admin_email

    def process_google_user(self, user_info: AuthUserInfo) -> dict:
        from .models import User

        if not user_info.email:
            raise ValueError("No email found in user_info")

        user = self.user_repo.get_by_email(user_info.email)
        is_admin = bool(self.admin_email and user_info.email == self.admin_email)

        if not user:
            new_user = User(
                email=user_info.email,
                name=user_info.name or "Unknown",
                picture=user_info.picture,
                provider=user_info.provider or "google",
                is_active=is_admin,  # Admin is active by default, others need approval
            )
            user = self.user_repo.create(new_user)

        if not user.is_active:
            raise PermissionError("User is inactive")

        token = self.token_provider.create_access_token(user.email)
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {"email": user.email},
        }

    def activate_user(self, user_email: str) -> bool:
        user = self.user_repo.get_by_email(user_email)
        if not user:
            raise ValueError(f"User {user_email} not found.")

        user.is_active = True
        self.user_repo.update(user)
        return True

    def deactivate_user(self, user_email: str) -> bool:
        user = self.user_repo.get_by_email(user_email)
        if not user:
            raise ValueError(f"User {user_email} not found.")

        if self.admin_email and user.email == self.admin_email:
            raise ValueError("Cannot deactivate the admin user.")

        user.is_active = False
        self.user_repo.update(user)
        return True

    def get_all_users(self) -> list:
        return self.user_repo.get_all()
