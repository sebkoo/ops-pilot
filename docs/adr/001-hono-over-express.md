# ADR-001: Hono over Express for the API
Date: 2026-09-03
## Status
Accepted
## Context
The API must run locally (Node), on AWS Lambda (Phase 7) and possibly on Cloudflare Workers, with one codebase.
## Decision
Use Hono (Web-standard Request/Response) with a per-platform entry file of about ten lines each.
## Consequences
- (+) Portability is enforced by code, not by documentation. Small, typed, fast.
- (-) Smaller ecosystem than Express: no express-rate-limit or helmet, so the rate limiter is written by hand (Phase 6; on Lambda it needs a shared store in either framework, 7.5b).
- Idempotency is not a cost of this choice: no framework ships it, so the claim-first middleware (Phase 5) is hand-written either way.