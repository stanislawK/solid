import curl_cffi
from .schemas import AuthUserInfo, PlantCreate
from .repositories import IPlantRepository, IUserRepository
from .models import Plant
from google import genai

from abc import ABC, abstractmethod
from typing import Protocol, cast
from fastapi import Request
from fastapi.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth
import jwt
from datetime import datetime, timezone, timedelta

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
    ):
        self.repository = repository
        self.summarizer = summarizer
        self.wiki_provider = wiki_provider

    def create_from_wiki(self, article_title: str) -> Plant:
        # 1. Fetch raw data from Wikipedia
        raw_content = self.wiki_provider.get_article(article_title)

        # 2 & 3. Summarize AND Validate in one go
        # We get a full PlantCreate object back, guaranteed valid!
        plant_dto = self.summarizer.summarize_plant_data(
            raw_content, article_title=article_title
        )

        # 4. Save
        new_plant_model = Plant(**plant_dto.model_dump())
        return self.repository.save(new_plant_model)

    def create_manual(self, plant_data: PlantCreate) -> Plant:
        new_plant_model = Plant(**plant_data.model_dump())
        return self.repository.save(new_plant_model)


# --- ABSTRACTION (DIP) ---


class WikipediaProvider(Protocol):
    """
    Protocol defining what a Wikipedia service must do.
    This is our 'Abstraction' layer.
    """

    def search_articles(self, term: str) -> list[str]: ...
    def get_article(self, title: str) -> str: ...


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

    def search_articles(self, term: str) -> list[str]:
        # Using the library to find related pages (simplified for example)
        params = {
            "action": "opensearch",
            "search": term,
            "limit": 10,
            "namespace": 0,
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
            titles = data[1]  # The second item contains the list of titles
            return titles
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
