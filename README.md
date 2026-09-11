# OpsPilot

Offline-first field-operations app for store staff: report an issue on the floor, move it through a state machine, keep working without network.

![Demo](docs/demo.gif)

**Stack** SwiftUI · SwiftData · Node/TypeScript · PostgreSQL — **Live** runs locally today (public API lands in Phase 7) — **Contact** seb.m.koo@gmail.com · [LinkedIn](https://linkedin.com/in/REPLACE-ME)

<details><summary><b>Architecture (today)</b></summary>

iPhone (SwiftUI · SwiftData) --HTTPS/JSON--> API (Node 24 · TypeScript · Hono) --SQL--> PostgreSQL 17

The app reaches storage only through an `IssueRepository` protocol, so no view knows where data lives. Today that port is `SyncingIssueRepository`: it writes to SwiftData first and returns, then a `SyncEngine` drains a `PendingOperation` outbox to the API and pulls deltas back. The UI never waits on the network, and the same port was previously satisfied by in-memory, SwiftData-only and HTTP-only implementations without touching a screen.

</details>

<details><summary><b>Engineering notes</b></summary>

- Keyset pagination on `(created_at, id)` — no OFFSET, stable while rows are inserted
- Optimistic locking (`WHERE version = $n` → 409) and a server-enforced state machine (422 on illegal transitions)
- One error envelope `{ error: { code, message, details } }` so clients branch on codes, not prose
- Integration tests hit a real PostgreSQL through `app.request()` — no port, no mocks
- Domain model separated from the persistence model on iOS; the repository was swapped without touching a view
- Account deletion is a soft delete: the row is anonymized and kept so audit history survives, with a partial unique index (`WHERE deleted_at IS NULL`) so the same email can register again — App Store 5.1.1(v) requires in-app deletion
- Short-lived access tokens with refresh rotation; `/auth/refresh` re-checks that the user still exists, so a deleted account is cut off at the next refresh instead of needing a token blocklist
- Writes are queued as an outbox row in the same local transaction as the change, so a crash between "saved" and "sent" cannot lose an edit
- Each queued write carries an idempotency key the server stores and replays, so a retry after a timeout returns the first result instead of creating a duplicate
- Delta pull uses a composite `(updated_at, id)` cursor — a plain timestamp cursor drops or repeats rows that share a millisecond
- Conflicts resolve server-wins on `version`, and the loser is surfaced in the UI rather than silently discarded
- Networking sits behind an `HTTPTransport` protocol, so the whole client stack is tested against a stubbed transport with no server running
- Next: Phase 6 production hardening (structured logs, rate limiting, `/ready`, graceful shutdown) → Phase 7 deploy (Lambda + CDK + Neon) inside always-free limits

</details>

<details><summary><b>Why not X?</b></summary>

See [docs/decisions.md](docs/decisions.md): SwiftData vs Core Data/Realm, Hono vs Express, SQL vs an ORM, PostgreSQL vs DynamoDB/Firebase, hand-rolled JWT vs Cognito/Auth0, Lambda vs ECS/Vercel/Render.

</details>

<details><summary><b>Run locally</b></summary>

```sh
cd api && npm install && npm run db:up && cp .env.example .env && npm run migrate && npm run dev
open ios/OpsPilot/OpsPilot.xcodeproj    # then ⌘R
```

</details>

**Status** — the numbered track is required and in order; lettered tracks are built only when a job posting asks for them.

`[x] 1 iOS MVP` · `[x] 2 SwiftData persistence` · `[x] 3 REST API + PostgreSQL + tests` · `[x] 4 Auth (JWT/RBAC)` · `[x] 5 Offline sync (outbox · idempotency keys · delta cursors)` · `[ ] 6 Production hardening` · `[ ] 7 Deploy — Lambda · CDK · Neon (public URL)` · `[ ] 8 System-design write-up`

Lettered: `N` native UIKit↔SwiftUI · `T` AI triage · `F` React dashboard · `U` photo upload (S3) · `W` realtime (WebSocket) · `P` payments · `L` fastlane.
