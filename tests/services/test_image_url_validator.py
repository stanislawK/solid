from __future__ import annotations

import asyncio
import socket

import pytest

from app.services.image import SsrfSafeImageUrlValidator, UnsafeImageUrlError


def _fake_getaddrinfo(*ip_addresses: str):
    async def getaddrinfo(host, port, *args, **kwargs):
        return [
            (
                socket.AF_INET6 if ":" in ip else socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                (ip, port),
            )
            for ip in ip_addresses
        ]

    return getaddrinfo


@pytest.fixture
def validator() -> SsrfSafeImageUrlValidator:
    return SsrfSafeImageUrlValidator()


@pytest.mark.parametrize("scheme", ["file", "gopher", "ftp", "javascript"])
async def test_rejects_disallowed_schemes(validator, scheme):
    with pytest.raises(UnsafeImageUrlError):
        await validator.validate_url(f"{scheme}://example.com/a.jpg")


@pytest.mark.parametrize("hostname", ["service.internal", "foo.svc.cluster.local"])
async def test_rejects_internal_hostname_suffixes(validator, hostname):
    with pytest.raises(UnsafeImageUrlError):
        await validator.validate_url(f"http://{hostname}/a.jpg")


@pytest.mark.parametrize(
    "resolved_ip",
    [
        "169.254.169.254",  # cloud metadata
        "10.0.0.1",
        "172.16.0.1",
        "192.168.1.1",
        "127.0.0.1",
        "169.254.1.1",
        "0.0.0.0",
        "100.64.0.1",  # CGNAT / shared address space (RFC 6598)
        "fd00::1",
        "fe80::1",
        "::1",
    ],
)
async def test_rejects_unsafe_resolved_addresses(validator, monkeypatch, resolved_ip):
    loop = asyncio.get_running_loop()
    monkeypatch.setattr(loop, "getaddrinfo", _fake_getaddrinfo(resolved_ip))
    with pytest.raises(UnsafeImageUrlError):
        await validator.validate_url("http://attacker-controlled.example.com/a.jpg")


async def test_rejects_if_any_resolved_address_is_unsafe(validator, monkeypatch):
    loop = asyncio.get_running_loop()
    monkeypatch.setattr(
        loop, "getaddrinfo", _fake_getaddrinfo("93.184.216.34", "10.0.0.1")
    )
    with pytest.raises(UnsafeImageUrlError):
        await validator.validate_url("http://rebinding.example.com/a.jpg")


async def test_accepts_public_ip_and_pins_it(validator, monkeypatch):
    loop = asyncio.get_running_loop()
    monkeypatch.setattr(loop, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
    url, hostname, resolved_ip = await validator.validate_url(
        "http://example.com/a.jpg"
    )
    assert url == "http://example.com/a.jpg"
    assert hostname == "example.com"
    assert resolved_ip == "93.184.216.34"


async def test_rejects_unresolvable_host(validator, monkeypatch):
    loop = asyncio.get_running_loop()

    async def raise_gaierror(*args, **kwargs):
        raise socket.gaierror("nope")

    monkeypatch.setattr(loop, "getaddrinfo", raise_gaierror)
    with pytest.raises(UnsafeImageUrlError):
        await validator.validate_url("http://does-not-resolve.example.com/a.jpg")
