from typing_extensions import Annotated
from fastapi import APIRouter, Query, Depends
from app.config import settings
from app.schemas import WikipediaResponse
from app.services import WikipediaProvider, WikipediaService

router = APIRouter(prefix="/wiki", tags=["wiki"])


# --- DEPENDENCY INJECTION SETUP ---
def get_wiki_service() -> WikipediaProvider:
    return WikipediaService(browser=settings.browser)


@router.get("/get_wikipedia_articles", response_model=WikipediaResponse)
async def get_wikipedia_articles(
    search_term: Annotated[str, Query(description="The term to search for")],
    service: Annotated[WikipediaProvider, Depends(get_wiki_service)],
):
    titles = service.search_articles(search_term)
    return WikipediaResponse(search_term=search_term, results=titles)
