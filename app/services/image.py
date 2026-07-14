from __future__ import annotations

import asyncio
import ipaddress
import socket
from io import BytesIO
from typing import Protocol, cast
from urllib.parse import urlsplit

import curl_cffi
from curl_cffi import requests
from curl_cffi.const import CurlOpt
from PIL import Image, ImageOps, UnidentifiedImageError


class UnsafeImageUrlError(ValueError):
    """Raised when a user-supplied image URL fails SSRF safety checks."""


class ImageDownloaderProtocol(Protocol):
    async def download_image(
        self, url: str, hostname: str, resolved_ip: str
    ) -> bytes: ...


class ImageUrlValidatorProtocol(Protocol):
    async def validate_url(self, url: str) -> tuple[str, str, str]:
        """Validate a user-supplied URL, returning (url, hostname, resolved_ip)."""
        ...


class ImageValidatorProtocol(Protocol):
    def validate_image(self, file_bytes: bytes) -> bool: ...


class ImageProcessorProtocol(Protocol):
    def optimize_image(self, image_bytes: bytes) -> bytes: ...


class SsrfSafeImageUrlValidator(ImageUrlValidatorProtocol):
    """Blocks outbound image fetches to loopback/private/link-local/reserved
    destinations (including cloud metadata IPs) to prevent SSRF."""

    _ALLOWED_SCHEMES = frozenset({"http", "https"})
    _BLOCKED_HOSTNAME_SUFFIXES = (".internal", ".svc.cluster.local")
    _CGNAT_NETWORK = ipaddress.ip_network("100.64.0.0/10")

    async def validate_url(self, url: str) -> tuple[str, str, str]:
        parsed = urlsplit(url)
        if parsed.scheme not in self._ALLOWED_SCHEMES:
            raise UnsafeImageUrlError(f"URL scheme '{parsed.scheme}' is not allowed")
        if not parsed.hostname:
            raise UnsafeImageUrlError("URL has no hostname")

        hostname = parsed.hostname
        if hostname.lower().endswith(self._BLOCKED_HOSTNAME_SUFFIXES):
            raise UnsafeImageUrlError(f"Hostname '{hostname}' is not allowed")

        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        loop = asyncio.get_running_loop()
        try:
            addr_infos = await loop.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        except socket.gaierror as e:
            raise UnsafeImageUrlError(f"Could not resolve host '{hostname}': {e}")

        resolved_ip: str | None = None
        for _family, _type, _proto, _canonname, sockaddr in addr_infos:
            ip = ipaddress.ip_address(sockaddr[0])
            self._reject_if_unsafe(ip)
            if resolved_ip is None:
                resolved_ip = sockaddr[0]

        if resolved_ip is None:
            raise UnsafeImageUrlError(f"No addresses resolved for '{hostname}'")

        return url, hostname, resolved_ip

    def _reject_if_unsafe(
        self, ip: ipaddress.IPv4Address | ipaddress.IPv6Address
    ) -> None:
        mapped = ip.ipv4_mapped if isinstance(ip, ipaddress.IPv6Address) else None
        check_ip = mapped if mapped is not None else ip
        is_cgnat = (
            isinstance(check_ip, ipaddress.IPv4Address)
            and check_ip in self._CGNAT_NETWORK
        )
        if (
            check_ip.is_private
            or check_ip.is_loopback
            or check_ip.is_link_local
            or check_ip.is_reserved
            or check_ip.is_multicast
            or check_ip.is_unspecified
            or is_cgnat
        ):
            raise UnsafeImageUrlError(
                f"Resolved address '{check_ip}' is not a public address"
            )


class CurlImageDownloader(ImageDownloaderProtocol):
    def __init__(
        self,
        browser: curl_cffi.requests.BrowserTypeLiteral,
        timeout: float,
        max_bytes: int,
    ):
        self.browser = browser
        self.timeout = timeout
        self.max_bytes = max_bytes

    async def download_image(self, url: str, hostname: str, resolved_ip: str) -> bytes:
        parsed = urlsplit(url)
        port = parsed.port or (443 if parsed.scheme == "https" else 80)

        async with requests.AsyncSession(
            impersonate=cast(curl_cffi.requests.BrowserTypeLiteral, self.browser),
            curl_options={CurlOpt.RESOLVE: [f"{hostname}:{port}:{resolved_ip}"]},
        ) as session:
            async with session.stream(
                "GET", url, timeout=self.timeout, allow_redirects=False
            ) as response:
                if response.status_code in (301, 302, 303, 307, 308):
                    raise UnsafeImageUrlError(
                        "Redirects are not allowed for remote image URLs"
                    )
                response.raise_for_status()

                content_type = response.headers.get("content-type", "")
                if not content_type.split(";")[0].strip().lower().startswith("image/"):
                    raise UnsafeImageUrlError(
                        f"Unexpected content-type '{content_type}'"
                    )

                buffer = bytearray()
                async for chunk in response.aiter_content():
                    buffer += chunk
                    if len(buffer) > self.max_bytes:
                        raise UnsafeImageUrlError(
                            f"Image exceeds max size of {self.max_bytes} bytes"
                        )
                return bytes(buffer)


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
