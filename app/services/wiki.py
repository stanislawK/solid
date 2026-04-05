from __future__ import annotations

from typing import Protocol, cast

import curl_cffi
from curl_cffi import requests

from app.schemas.wiki import WikipediaSearch


class WikipediaProvider(Protocol):
    async def search_articles(self, term: str) -> list[WikipediaSearch]: ...
    async def get_article(self, title: str) -> str: ...
    async def get_article_image_url(self, title: str) -> str | None: ...
    async def get_wikimedia_image_url(self, latin_name: str) -> str | None: ...


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
        self.commons_base_url = "https://commons.wikimedia.org/w/api.php"

    async def search_articles(self, term: str) -> list[WikipediaSearch]:
        params = {
            "action": "query",
            "generator": "search",
            "gsrsearch": f"{term} incategory:Rośliny_pokojowe",
            "gsrlimit": 10,
            "prop": "pageimages|pageterms",
            "piprop": "thumbnail",
            "pithumbsize": 120,
            "pilimit": 10,
            "wbptterms": "description",
            "format": "json",
            "formatversion": 2,
        }
        try:
            async with requests.AsyncSession(
                impersonate=cast(curl_cffi.requests.BrowserTypeLiteral, self.browser)
            ) as session:
                response = await session.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                pages = data.get("query", {}).get("pages", [])
                results = []
                for page in pages:
                    title = page.get("title", "")

                    snippet = ""
                    if (terms := page.get("terms")) and (
                        descriptions := terms.get("description")
                    ):
                        snippet = descriptions[0]

                    thumbnail_source = None
                    if thumbnail_info := page.get("thumbnail"):
                        thumbnail_source = thumbnail_info.get("source")

                    results.append(
                        WikipediaSearch(
                            title=title,
                            snippet=snippet,
                            thumbnail=thumbnail_source,
                        )
                    )
                return results
        except Exception as e:
            print(f"Error fetching Wikipedia articles: {e}")
            return []

    async def get_article(self, title: str) -> str:
        params = {
            "action": "query",
            "prop": "extracts",
            "explaintext": 1,
            "titles": title,
            "format": "json",
        }

        try:
            async with requests.AsyncSession(
                impersonate=cast(curl_cffi.requests.BrowserTypeLiteral, self.browser)
            ) as session:
                response = await session.get(self.base_url, params=params)
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

    async def get_article_image_url(self, title: str) -> str | None:
        params = {
            "action": "query",
            "prop": "pageimages",
            "titles": title,
            "format": "json",
            "pithumbsize": 500,
        }
        try:
            async with requests.AsyncSession(
                impersonate=cast(curl_cffi.requests.BrowserTypeLiteral, self.browser)
            ) as session:
                response = await session.get(self.base_url, params=params)
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

    async def get_wikimedia_image_url(self, latin_name: str) -> str | None:
        if not latin_name.strip():
            return None

        search_queries = [
            f'"{latin_name}" filetype:bitmap',
            f'"{latin_name}" plant filetype:bitmap',
        ]

        for search_query in search_queries:
            params = {
                "action": "query",
                "format": "json",
                "generator": "search",
                "gsrsearch": search_query,
                "gsrnamespace": 6,
                "gsrlimit": 1,
                "prop": "imageinfo",
                "iiprop": "url",
            }
            try:
                async with requests.AsyncSession(
                    impersonate=cast(
                        curl_cffi.requests.BrowserTypeLiteral, self.browser
                    )
                ) as session:
                    response = await session.get(self.commons_base_url, params=params)
                    response.raise_for_status()
                    data = response.json()
                    pages = data.get("query", {}).get("pages", {})
                    if not pages:
                        continue

                    page = next(iter(pages.values()))
                    image_info = page.get("imageinfo", [])
                    if image_info:
                        return image_info[0].get("url")
            except Exception as e:
                print(f"Error fetching Wikimedia image URL: {e}")
                return None

        return None
