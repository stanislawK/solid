# Security Audit & Remediation Plan

**Scope:** FastAPI backend (`app/`), React frontend (`frontend/`), Helm/K8s manifests (`k8s/`), and local config.
**Date:** 2026-07-03
**Overall posture:** Solid foundations — OAuth + rotating refresh tokens, hashed refresh tokens, CSRF double-submit, per-user data scoping, security headers, TrustedHost, non-root container, secrets via `existingSecret` in prod. The findings below are the gaps that remain.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## 🔴 1. Server-Side Request Forgery (SSRF) via user-supplied image URLs

**Where:**
- `app/services/plants.py` → `_download_and_store_image()` / `update_plant_image_from_url()` / `create_from_wiki(preferred_image_url=...)` / `create_from_name_ai(preferred_image_url=...)`
- `app/services/image.py` → `CurlImageDownloader.download_image()`
- Reached from `PUT /plants/{id}/image/from-url` and `POST /plants/wiki` / `POST /plants/from-name-ai` (`PlantImageUrlUpdate.image_url`, `WikipediaRequest.preferred_image_url`).

**Problem:** An authenticated user supplies an arbitrary URL that the server fetches directly, with no scheme/host validation. In the K8s cluster this can reach internal services and cloud metadata endpoints (e.g. `http://169.254.169.254/`, `http://*.svc.cluster.local`, `http://localhost:8000/`), and can use `file://`/`gopher://` depending on curl backend behavior. There is also no timeout or response-size cap, so a single request can hang or exhaust memory.

**Fix:**
1. Add an `ImageUrlValidator` used before every outbound fetch:
   - Allow only `http`/`https` schemes.
   - Resolve the hostname and **reject** loopback, link-local (`169.254.0.0/16`, `fd00::/8`, `fe80::/10`), private ranges (`10/8`, `172.16/12`, `192.168/16`), and `.svc.cluster.local` / `.internal`. Re-check after DNS resolution to block DNS-rebinding.
   - Optionally restrict to an allowlist of hosts (e.g. `upload.wikimedia.org`, `commons.wikimedia.org`) since image sourcing is Wikipedia-centric.
2. In `download_image`, set an explicit `timeout=` and stream with a hard byte cap (e.g. reject > 10 MB); enforce `Content-Type: image/*`.
3. Validate `PlantImageUrlUpdate.image_url` and `preferred_image_url` as `pydantic.AnyHttpUrl` (currently plain `str`).

---

## 🟠 2. Path traversal / arbitrary file write in image storage

**Where:** `app/repositories.py` → `LocalVolumeStorage.save_image()`

```python
ext = filename.split(".")[-1] if "." in filename else "jpg"
unique_name = f"{uuid.uuid4().hex}.{ext}"
filepath = os.path.join(self.storage_dir, unique_name)
```

**Problem:** `ext` is taken verbatim from attacker-controlled input — the uploaded `file.filename` **and**, in the from-URL flow, the full remote URL is passed as `filename` (`_download_and_store_image` → `_store_image_bytes(image_url, ...)`). Because `ext` can contain `/` and `..` (e.g. a URL/filename whose last dotted segment is `co/m/../../evil`), `os.path.join` can escape `storage_dir` and write the file to an arbitrary location. The UUID protects the base name but not the extension.

**Fix:**
- Never derive the on-disk name from user input. Whitelist the extension against `{jpg, jpeg, png, webp}`; default to `jpg` otherwise. Since the pipeline already re-encodes uploads to JPEG, just hardcode `.jpg`.
- Sanitize: strip any character that isn't `[a-z0-9]` from `ext`, and assert the resolved `os.path.realpath(filepath)` stays within `os.path.realpath(storage_dir)` before writing.

---

## 🟠 3. Logout / OAuth-error paths do not clear refresh & CSRF cookies (dead code)

**Where:** `app/routers/auth.py` → `_clear_auth_cookies()` (lines ~105–165)

**Problem:** `_clear_auth_cookies()` deletes only the **access** cookie and returns. The `delete_cookie` calls for the refresh and CSRF cookies were accidentally placed *after* the `return` statement inside `_build_frontend_redirect_url()`, making them **unreachable dead code**. As a result:
- On the `/auth/callback` `inactive`/`server_error` paths, the refresh cookie is left in the browser (and is not revoked server-side on those paths).
- After `POST /auth/logout` the refresh & CSRF cookies remain set client-side (the DB session is revoked, so it's mostly cosmetic, but it's incorrect and confusing).

**Fix:** Move the refresh-cookie and CSRF-cookie `delete_cookie` calls back into `_clear_auth_cookies()` so all three cookies are cleared, and remove the stray unreachable block from `_build_frontend_redirect_url()`. Add a regression test asserting all three `Set-Cookie` deletions are present on logout.

---

## 🟠 4. Real credentials sitting in `solid.env` — rotate them

**Where:** `solid.env` (gitignored, **not** committed — confirmed no secrets in git history)

**Problem:** The working-tree file contains what appear to be **live** secrets in plaintext: a Google OAuth client secret (`GCP_CLIENT_SECRET=GOCSPX-…`), a Google API/Gemini key (`GEM_API_KEY=AIzaSy…`), and a real GlitchTip DSN. Even though `.gitignore` excludes `*.env`, these values are exposed on disk (and were read during this audit). Weak placeholder JWT/session secrets (`your-…-1234567890`) are also present.

**Fix:**
1. **Rotate now:** revoke/regenerate the Google OAuth client secret, the Gemini API key, and the GlitchTip DSN in their respective consoles.
2. Generate strong random `JWT_SECRET_KEY` / `SESSION_SECRET_KEY` (`python -c "import secrets; print(secrets.token_urlsafe(48))"`).
3. Keep prod secrets only in K8s `existingSecret` (already the pattern in `values-production.yaml`) — never in a repo file.
4. Consider `git-secrets`/`gitleaks` as a pre-commit hook to prevent accidental commits.

---

## 🟡 5. Long-lived access tokens + session-revocation bypass for `sid`-less tokens

**Where:** `solid.env` `JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440`; `app/routers/auth.py` → `get_current_user`

**Problem:**
- The access token lifetime is set to **24 h** (config default is 15 min). A 24 h bearer token cannot be revoked server-side and stays valid across logout.
- `get_current_user` only checks the session table `if claims.session_id is not None`. `verify_access_token` accepts tokens with `typ` of `None` and `sid` of `None`, so any validly-signed token **without** a `sid` skips the session-active/revocation check entirely (subject to signature + active user). This weakens the revocation guarantee.

**Fix:**
- Set `JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15` (or ≤ 30) in every env; rely on the refresh flow.
- Require `sid` on all access tokens: treat a missing `sid` as invalid in `get_current_user`, and drop the `typ in (None, "access")` legacy acceptance once no legacy tokens remain.

---

## 🟡 6. Internal exception messages leaked to clients

**Where:** `app/routers/plants.py` (`detail=f"Could not process plant data: {str(e)}"`, image/URL handlers) and `app/routers/auth.py` (`detail=f"OAuth verification error: {str(exc)}"`).

**Problem:** Raw exception text is returned in HTTP responses, potentially disclosing internal URLs, library internals, file paths, or upstream error detail useful to an attacker (and it also surfaces SSRF/connection errors that aid probing of the internal network).

**Fix:** Return generic, stable messages to clients; log the full exception server-side (with `logging`, not `print`). Map known domain errors (`ValueError`) to specific 4xx messages, everything else to a generic 422/500.

---

## 🟡 7. No rate limiting on auth, AI, and outbound-fetch endpoints

**Where:** all routers; especially `POST /plants/identify`, `/plants/wiki`, `/plants/from-name-ai` (call the paid Gemini API and/or fetch remote URLs), `/auth/refresh`, `/auth/callback`.

**Problem:** No throttling → cost-amplification (Gemini calls), SSRF-fetch amplification, and brute-force/DoS surface.

**Fix:** Add per-user / per-IP rate limiting (e.g. `slowapi`, or at the Traefik/ingress layer with a middleware). Apply stricter limits to the AI and URL-fetch routes. Enforce an upload size limit on `UploadFile` endpoints (`/plants/identify`, `/plants/{id}/image`).

---

## 🟡 8. Unauthenticated Wikipedia endpoints

**Where:** `app/routers/wiki.py` → `GET /wiki/get_wikipedia_articles`, `GET /wiki/wikimedia-image`

**Problem:** These have no auth dependency, so any anonymous caller can drive server-side outbound requests to Wikipedia/Wikimedia with arbitrary search terms (resource use, potential abuse as a proxy/amplifier). Lower risk than #1 because destinations are fixed hosts, but still an unauthenticated outbound-request surface with no rate limit.

**Fix:** Require `Depends(get_current_user)` (as the plant router does), or at minimum apply rate limiting and input length caps.

---

## 🟢 9. API docs enabled by default

**Where:** `app/config.py` `docs_enabled: bool = True`; `app/main.py`

**Problem:** `/docs`, `/redoc`, `/openapi.json` are served unless explicitly disabled. In production this discloses the full API surface.

**Fix:** Default `docs_enabled=False`, or force it off when `environment == "production"` in `validate_security_posture`.

---

## 🟢 10. `print()` used for error handling

**Where:** `app/services/wiki.py`, `app/services/plants.py` (`print(f"Failed to download/store image: {e}")`, etc.)

**Problem:** Errors go to stdout with no levels/structure, can leak detail into logs, and are invisible to the observability stack (OTel/Sentry are configured but bypassed).

**Fix:** Replace with the `logging` module at appropriate levels; let Sentry/OTel capture exceptions.

---

## 🟢 11. Hardening nitpicks

- **CSRF cookie lifetime:** `solid_csrf_token` is set with the refresh-token max-age but is only cleared via the (currently broken, see #3) logout path. Ensure it's cleared alongside the others.
- **`session_same_site="none"`** is permitted by the `Literal`; make sure it's only ever paired with `session_https_only=True` (already enforced for prod env, but not for `same_site="none"` specifically).
- **DB URL rewrite in `app/db.py`** only handles `postgresql://` and `sqlite:///`; a misconfigured URL silently falls through to a sync driver. Validate the driver explicitly.
- **`.env.example` / `scripts/prod-secrets.env.example`** — confirm they contain only placeholders (they do), and document the rotation procedure.

---

## Suggested remediation order

| Step | Finding | Effort | Priority |
|------|---------|--------|----------|
| 1 | #4 Rotate live credentials | Low | Immediate |
| 2 | #1 SSRF URL validation + fetch limits | Medium | Immediate |
| 3 | #2 Path-traversal in `save_image` | Low | High |
| 4 | #3 Fix cookie-clearing dead code | Low | High |
| 5 | #5 Shorten token TTL + require `sid` | Low | High |
| 6 | #6 Stop leaking exception detail | Low | Medium |
| 7 | #7 Rate limiting + upload size caps | Medium | Medium |
| 8 | #8 Auth on wiki endpoints | Low | Medium |
| 9 | #9–#11 Docs off, logging, nitpicks | Low | Low |

## Validation

- Add tests: SSRF rejection (metadata IP, private IP, non-http scheme), path-traversal filename/URL rejection, logout clears all three cookies, `sid`-less token rejected, oversized upload rejected.
- Run `make format` and existing test suite after each change; regenerate `openapi.json` (`make openapi`) if request schemas change (e.g. `AnyHttpUrl`).
