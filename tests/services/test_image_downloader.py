from __future__ import annotations

import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app.services.image import CurlImageDownloader, UnsafeImageUrlError


def _run_server(handler_cls) -> tuple[ThreadingHTTPServer, threading.Thread]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler_cls)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


@pytest.fixture
def downloader() -> CurlImageDownloader:
    return CurlImageDownloader(browser="chrome", timeout=5.0, max_bytes=1024)


async def _download(downloader: CurlImageDownloader, server: ThreadingHTTPServer):
    port = server.server_address[1]
    url = f"http://localhost:{port}/image.jpg"
    return await downloader.download_image(url, "localhost", "127.0.0.1")


async def test_rejects_non_image_content_type(downloader):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = b"<html>not an image</html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server, thread = _run_server(Handler)
    try:
        with pytest.raises(UnsafeImageUrlError, match="content-type"):
            await _download(downloader, server)
    finally:
        server.shutdown()


async def test_rejects_oversized_response(downloader):
    oversized_body = b"x" * (downloader.max_bytes + 1)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(oversized_body)))
            self.end_headers()
            self.wfile.write(oversized_body)

        def log_message(self, *args):
            pass

    server, thread = _run_server(Handler)
    try:
        with pytest.raises(UnsafeImageUrlError, match="exceeds max size"):
            await _download(downloader, server)
    finally:
        server.shutdown()


async def test_rejects_redirect(downloader):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(302)
            self.send_header("Location", "http://internal.example.com/a.jpg")
            self.end_headers()

        def log_message(self, *args):
            pass

    server, thread = _run_server(Handler)
    try:
        with pytest.raises(UnsafeImageUrlError, match="Redirect"):
            await _download(downloader, server)
    finally:
        server.shutdown()


async def test_downloads_valid_image(downloader):
    body = b"\xff\xd8\xff-fake-jpeg-bytes"

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server, thread = _run_server(Handler)
    try:
        result = await _download(downloader, server)
        assert result == body
    finally:
        server.shutdown()


async def test_enforces_timeout():
    slow_downloader = CurlImageDownloader(browser="chrome", timeout=0.2, max_bytes=1024)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            time.sleep(1.0)
            body = b"\xff\xd8\xff-too-slow"
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server, thread = _run_server(Handler)
    try:
        with pytest.raises(Exception):
            await _download(slow_downloader, server)
    finally:
        server.shutdown()
