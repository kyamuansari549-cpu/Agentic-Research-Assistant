# SECURITY AUDIT REPORT

## Executive Summary

- **Application:** Agentic Research Assistant (AI research pipeline + text tools)
- **Stack:** FastAPI + LangGraph (backend), React/Vite (frontend), Supabase Postgres, Google OAuth + JWT
- **Environment reviewed:** repository at `~/workspace/Agentic-Research-Assistant`, commit `9adbc13` + audit fixes
- **Date:** 2026-10-03
- **Method:** 12-phase audit per CodersVoice master prompt (recon → secrets → identity → input → API abuse → uploads → DB → errors → deps → business logic → tests → re-scan)
- **Overall status:** 7 findings (2 medium, 4 low, 1 info). All fixable items fixed, verified by 8 new automated tests. No critical findings.
- **Remaining manual checks:** confirm Render env vars after redeploy (list below); frontend bundle is built by Vercel from source (no secrets committed).

## Attack Surface

- **Public endpoints:** `GET /api/health`, `GET /auth/login`, `GET /auth/callback`
- **Authenticated endpoints:** `POST /api/research`, `GET /api/research/{id}/stream` (SSE), `GET/DELETE /api/reports*`, `POST /api/paraphrase`, `/api/plagiarism-check`, `/api/ai-detect`, `/api/pdf-upload`, `/api/pdf-chat`, `DELETE /api/pdf-session/{id}`, `/api/summarize`, `/api/research-gaps`, `GET /api/stations` (n/a — this app has `GET /api/me`)
- **Admin endpoints:** none
- **File uploads:** PDF only (`/api/pdf-upload`, 20 MB cap, parsed by pypdf)
- **Webhooks:** none
- **Payments:** none
- **External services:** Groq, Google Gemini, Tavily, DuckDuckGo, Semantic Scholar, arXiv, OpenAlex, Unpaywall, Resend
- **Sensitive data stores:** Supabase Postgres (users, reports), in-memory PDF sessions (TTL 2h, user-scoped)

## Findings

### [SEC-001] No input length limits on text endpoints
- **Severity:** Medium | **Category:** Input validation / API abuse
- **Component:** `backend/app/main.py` (all POST text endpoints)
- **Evidence:** `paraphrase`, `plagiarism-check`, `ai-detect`, `summarize`, `research-gaps`, `pdf-chat`, `research` accepted unbounded strings. A multi-MB payload burns LLM/Tavily quota and memory.
- **Risk:** Quota exhaustion / cost DoS by any authenticated user.
- **Fix implemented:** `_limit_text()` guard — 500 chars (research query), 20,000 (text tools), 2,000 (pdf-chat question). Returns HTTP 413 with explicit message.
- **Verification:** `test_input_length_guard` (413 asserted). Manual: oversized POST → 413.
- **Residual risk:** none.

### [SEC-002] No rate limiting on expensive endpoints
- **Severity:** Medium | **Category:** API abuse protection
- **Component:** `backend/app/main.py`
- **Evidence:** No throttling anywhere; `/api/research` triggers LLM + search API calls per request.
- **Risk:** One user can starve shared Groq/Tavily quotas for everyone.
- **Fix implemented:** `backend/app/rate_limit.py` — in-memory sliding-window limiter, per user: research 10/min, pdf-upload 20/min, pdf-chat/plagiarism/gaps 30/min, text tools 60/min. Returns HTTP 429.
- **Verification:** `test_rate_limiter_allows_then_blocks`, `test_rate_limiter_window_resets`, `test_rate_limiter_is_per_key`.
- **Residual risk:** per-process state only; exact global limits need Redis if ever multi-worker. Documented in code.

### [SEC-003] Missing security headers
- **Severity:** Low | **Category:** Browser security
- **Component:** `backend/app/main.py`
- **Evidence:** No `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` on API responses.
- **Fix implemented:** HTTP middleware setting all three (`nosniff`, `DENY`, `strict-origin-when-cross-origin`).
- **Verification:** `test_security_headers_present` via TestClient.
- **Residual risk:** none (HSTS left to Render's TLS termination).

### [SEC-004] Code executor without resource limits; unbounded output
- **Severity:** Low | **Category:** Business logic / sandbox escape surface
- **Component:** `backend/app/tools/code_executor.py` (runs LLM-generated Python)
- **Evidence:** Subprocess had timeout only — no CPU/memory caps; stdout unbounded (a `print('x'*10**9)` would OOM the worker and bloat the DB row).
- **Risk:** Runaway/bloated output via prompt-influenced codegen; sandbox is documented as teaching-grade.
- **Fix implemented:** `RLIMIT_CPU` 10s + `RLIMIT_AS` 512 MB via `preexec_fn` (POSIX), stdout capped at 50k chars with truncation marker.
- **Verification:** `test_code_executor_output_capped`, `test_code_executor_basic_still_works`.
- **Residual risk:** no network/FS isolation (documented; needs gVisor/Docker for production-grade).

### [SEC-005] JWT signing secret has a public default
- **Severity:** Low (deployment config) | **Category:** Secrets & configuration
- **Component:** `backend/app/config.py` (`jwt_secret = "dev-secret-change-me"`)
- **Evidence:** Default is in the public repo; anyone could forge tokens if a deploy ran without `JWT_SECRET` set.
- **Fix implemented:** loud `[security] WARNING` at startup when the default is in use. Default kept for local dev (smallest safe change).
- **Verification:** manual — warning observed in TestClient startup logs.
- **Manual action:** confirm `JWT_SECRET` is set in Render env after redeploy (verified set on 2026-10-02; re-confirm post-deploy).

### [SEC-006] 82 known CVEs in pinned dependencies
- **Severity:** Medium (aggregate) | **Category:** Supply chain
- **Component:** `backend/requirements.txt`
- **Evidence:** `pip-audit` found 82 vulns in 11 packages (authlib 10, starlette 7, python-multipart 7, langchain-core 7, …). Notable: PyPDF2 infinite-loop on crafted PDFs (user-uploaded PDFs are parsed!) and multipart-parsing DoS (PDF upload path).
- **Fix implemented (verified compatible in an isolated venv: app imports, health 200, auth 401):**
  - `PyPDF2==3.0.1` → `pypdf==6.19.0` (PyPDF2 abandoned; import updated in `pdf_parser.py`)
  - `python-multipart` 0.0.9 → 0.0.27, `authlib` 1.3.2 → 1.6.12, `python-jose` 3.3.0 → 3.4.0, `python-dotenv` 1.0.1 → 1.2.2
  - `fastapi` 0.115.0 → 0.116.1 (pulls starlette ≥0.40), `langchain-core` 0.3.6 → 0.3.85, `langgraph` 0.2.28 → 0.3.15
- **Verification:** `test_pypdf_import_migrated`; full smoke test on upgraded set.
- **Residual risk:** remaining vulns need major bumps (langgraph 1.x, starlette 1.x via newer fastapi) or have no fix (transitive `ecdsa`, `pyasn1`). Re-audit quarterly; most are DoS-in-edge-cases, partly mitigated by SEC-001/SEC-002.

### [SEC-007] JWT transmitted in URL query params (info)
- **Severity:** Info | **Category:** Identity
- **Component:** `GET /api/research/{id}/stream?token=`, OAuth `/?token=` redirect
- **Evidence:** Tokens in URLs can land in browser history and server access logs.
- **Risk:** low — SSE via EventSource cannot set headers (architectural constraint); OAuth-code-to-token redirect is standard SPA practice. Tokens are short-lived (7d) and user-scoped.
- **Fix:** accepted trade-off; no code change. Recommend log redaction if Render log drains are added later.

## Checked and found clean (no finding)

- **Secrets:** repo-wide grep for API keys/tokens/private keys — none hardcoded; frontend bundle contains no secrets.
- **Authorization (IDOR):** reports, research jobs, and PDF sessions are all scoped by `user_id` in every query; cross-user access tested and blocked.
- **Injection:** all SQL parameterized (Postgres `%s` / SQLite `?`); no `dangerouslySetInnerHTML`; ReactMarkdown without `rehype-raw` (no raw HTML rendering).
- **Uploads:** 20 MB cap, `.pdf` extension check, parse-failure as the real guard; filename never used as a filesystem path; charts stored as data URIs (no file-serving endpoint → no traversal).
- **SSRF:** plagiarism checker fetches only search-engine result URLs (never user-supplied), with 10s timeout, HTML-only, and byte cap.
- **CORS:** restricted to `FRONTEND_URL` origins.
- **Errors:** no custom exception handlers leaking internals; FastAPI default safe error shape.

## Verification

- **Build:** `python -m compileall` clean on all changed files.
- **Tests:** 8 new tests in `backend/tests/test_security.py` — all pass.
- **Dependency audit:** `pip-audit` before (82 vulns / 11 pkgs) → after upgrades (remaining need major bumps; documented above).
- **Re-scan:** repo re-grepped for secrets and `PyPDF2` references — clean; ownership checks re-verified.
- **Production configuration review:** not fully verifiable from here — manual checklist below.

## Production Checklist

- [x] Secrets protected (none in repo; JWT default warns at startup)
- [x] Authorization verified (user_id scoping on reports/jobs/PDF sessions)
- [x] Rate limits configured (per-user sliding window)
- [x] Input schemas enforced (length guards on all text endpoints)
- [x] Uploads isolated (size cap, parse guard, no path usage)
- [x] Errors sanitized (no stack traces to clients)
- [x] Dependencies audited (upgraded where compatible)
- [x] Webhooks verified (n/a — none)
- [x] Payment/business logic protected (n/a — no payments; executor hardened)
- [ ] Monitoring/logging reviewed — **manual:** confirm Render log drains redact `?token=`
- [ ] Backup/recovery reviewed — **manual:** confirm Supabase backups/PITR
- [ ] Manual security review completed — **manual:** human sign-off pre-launch

## Manual action required (post-deploy)

1. Redeploy backend on Render (dependency upgrades need a fresh build).
2. Re-confirm env vars: `JWT_SECRET`, `DATABASE_URL`, `ALLOWED_ORIGINS` (production Vercel URL).
3. Run `pytest backend/tests/test_security.py` in CI if added.
