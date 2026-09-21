# OpsPilot

Offline-first field-operations app for store staff: report an issue on the floor, move it through a state machine, keep working without network.

![Demo](docs/demo.gif)

**Stack** SwiftUI · SwiftData · Node/TypeScript · PostgreSQL — **Live** runs locally today (public API after Phase 7) — **Contact** <seb.m.koo@gmail.com> · [LinkedIn](https://linkedin.com/in/koo-ben)

<details><summary><b>Architecture (today)</b></summary>

iPhone (SwiftUI · SwiftData) --HTTPS/JSON--> API (Node 24 · TypeScript · Hono) --SQL--> PostgreSQL 17
The app reaches storage only through an `IssueRepository` protocol, so no view knows where data lives. Today that port is `SyncingIssueRepository`: it writes to SwiftData first and returns, then a `SyncEngine` drains a `PendingOperation` outbox to the API and pulls deltas back. The UI never waits on the network, and the same port was previously satisfied by in-memory, SwiftData-only and HTTP-only implementations without touching a screen.

</details>

<details><summary><b>Engineering notes</b></summary>

- **Keyset pagination**: `(created_at, id)` cursor instead of OFFSET - pages stay stable while rows are inserted
- **Optimistic locking + state machine**: `WHERE version = $n` turns a stable write into 409; a server-enforced state machine turns an illegal transition into 422
- **One error envelope**: `{ error: { code, message, details } }` on every failure, so clients branch on codes, not prose
- **Integration tests on real PostgreSQL**: requests go through `app.request()` — no port, no mocks
- **Domain vs. persistence model (iOS)**: separate the two, so the repository was swapped without touching a view
- **Soft-delete account**: anonymize the row and kept so audit history survives, a partial unique index (`WHERE deleted_at IS NULL`) lets the same email register again: App Store 5.1.1(v) requires in-app deletion
- **Short-lived tokens**: 15-minute access and 30-day refresh; `/auth/refresh` re-checks that the user still exists, so cut off a deleted account at the next refresh. Document rotation and reuse detection as not implemented (ADR-007)
- **Schema drift test**: row types are zod objects, and a test compares each with `information_schema` on every run - the core of what an ORM buys, without one (ADR-002)
- **Outbox**: queue a write in the same local transaction as the change, so a crash between "saved" and "sent" cannot lose an edit
- **Idempotent replay**: each queued write carries a key the server stores and replays, so a retry after a timeout returns the first result instead of creating a duplicate (ADR-005)
- **Composite sync cursor**: delta pull uses `(updated_at, id)` - a plain timestamp cursor drops or repeats rows that share a millisecond (ADR-004)
- **Server-wins conflicts**: resolved on `version`, and the loser is surfaced in the UI rather than silently discarded (ADR-003)
- **Dead-letter row**: operations the server rejects for good (400 · 403 · 404 · 422) leave the queue for a row the user can inspect and clear, so one bad edit never blocks the rest
- **Transport protocol (iOS)**: networking sits behind `HTTPTransport` to test the whole client stack against a stub with no server running
- **Invoice lines, not a single total**: partial refunds and tax categories need line-level attribution; a one-line invoice behaves exactly as before (ADR-008)
- **Floor and largest remainder, not round-half-up**: over-allocation becomes impossible by construction; the customer loses at most one cent; the rule lives in one function (ADR-009)
- **Next**: production hardening (structured logs, rate limiting, `/ready`, graceful shutdown) → Lambda + CDK + Neon inside always-free limits

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

**Status** — the numbered track is required and in order; lettered tracks are optional and built on demand.

`[x] 1 iOS MVP` · `[x] 2 SwiftData persistence` · `[x] 3 REST API + PostgreSQL + tests` · `[x] 4 Auth (JWT/RBAC)` · `[x] 5 Offline sync (outbox · idempotency keys · delta cursors)` · `[ ] 6 Production hardening` · `[ ] 7 Deploy — Lambda · CDK · Neon (public URL)` · `[ ] 8 System-design write-up`

Lettered: `N` native UIKit↔SwiftUI · `L` fastlane · `E` measurement · `W` realtime (WebSocket) · `U` photo upload (S3) · `P` payments · `G` location (geofence · map · background) · `S` subscriptions (StoreKit 2) · `T` AI triage · `F` React dashboard · `K` KMP · `M`/`R` manager phone
