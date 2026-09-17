# ADR-007: MVP auth is self-signed JWT; production auth is opaque refresh tokens with rotation
Date: 2026-09-03
## Status
Accepted (MVP Scope): 2026-09-05
## Context
A free Apple ID cannot use Sign in with Apple; auth is one middleware, so managed auth (Cognito, Auth0) is a swap later.
## Decision
15-minute access token and 30-day refresh token, both self-signed HS256; role and per-resource ownership checks in one middleware.
## Consequences
- (+) Auth is one middleware, so managed auth (Cognito, Auth0) is a swap in one file, not a rewrite.
- (+) No session table and no extra round trip: a request carries its own proof.
- (-) Logout is client-side only; the server cannot end a live session before the access token expires (15 minutes).
- (-) Rotating `JWT_SECRET` signs every user out at once - that is the only revocation this design has.
## Not implemented
Refresh-token roation, reuse detection, server-side revocation. A stolen refresh token is valid until it expires.
## Trigger to change
Staged, because the two steps cost an hour and a day.
1. A lost or shared device, or any request to sign one user out: add `users.token_version`, carry it as a claim, and compare it **at refresh time only**. Per-user revocation, one column, no new table; revocation takes effect within one access-token lifetime (15 minutes) and costs no per-request read.
2. Any real user data, a client we do not control, or a security review: opaque tokens in a table, family id, rotation on use, reuse detection revokes the family.