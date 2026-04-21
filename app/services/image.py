from __future__ import annotations

from io import BytesIO
from typing import Protocol, cast

import curl_cffi
from curl_cffi import requests
from PIL import Image, ImageOps, UnidentifiedImageError


class ImageDownloaderProtocol(Protocol):
    async def download_image(self, url: str) -> bytes: ...


class ImageValidatorProtocol(Protocol):
    def validate_image(self, file_bytes: bytes) -> bool: ...


class ImageProcessorProtocol(Protocol):
    def optimize_image(self, image_bytes: bytes) -> bytes: ...


class CurlImageDownloader(ImageDownloaderProtocol):
    def __init__(self, browser: curl_cffi.requests.BrowserTypeLiteral):
        self.browser = browser

    async def download_image(self, url: str) -> bytes:
        async with requests.AsyncSession(
            impersonate=cast(curl_cffi.requests.BrowserTypeLiteral, self.browser)
        ) as session:
            response = await session.get(url)
            response.raise_for_status()
            return response.content


class PillowImageValidator(ImageValidatorProtocol):
    def validate_image(self, file_bytes: bytes) -> bool:
        try:
            with Image.open(BytesIO(file_bytes)) as img:
                img.verify()
            return True
        except (UnidentifiedImageError, IOError):
            return False


class PillowImageProcessor(ImageProcessorProtocol):
    def __init__(self, max_size: tuple[int, int] = (1024, 1024), quality: int = 85):
        self.max_size = max_size
        self.quality = quality

    def optimize_image(self, image_bytes: bytes) -> bytes:
        with Image.open(BytesIO(image_bytes)) as img:
            img = ImageOps.exif_transpose(img)

            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            img.thumbnail(self.max_size, Image.Resampling.LANCZOS)

            out_bytes = BytesIO()
            img.save(out_bytes, format="JPEG", quality=self.quality)
            return out_bytes.getvalue()
