# OpsPilot
Offline-first field-operations app for store staff: report an issue on the floor, move it through a state machine, keep working without network.

![Demo](docs/demo.gif)

**Stack** SwiftUI · SwiftData · Node/TypeScript · PostgreSQL — **Live** runs locally today (public API after Phase 7) — **Contact** seb.m.koo@gmail.com · [LinkedIn](https://linkedin.com/in/koo-ben)

<details><summary><b>Architecture (today)</b></summary>

iPhone (SwiftUI · SwiftData) --HTTPS/JSON--> API (Node 24 · TypeScript · Hono) --SQL--> PostgreSQL 17
The app reaches storage only through an `IssueRepository` protocol; today that is SwiftData, next it is the API behind an offline outbox.

</details>

<details><summary><b>Engineering notes</b></summary>

- Keyset pagination on `(created_at, id)` — no OFFSET, stable while rows are inserted
- Optimistic locking (`WHERE version = $n` → 409) and a server-enforced state machine (422 on illegal transitions)
- One error envelope `{ error: { code, message, details } }` so clients branch on codes, not prose
- Integration tests hit a real PostgreSQL through `app.request()` — no port, no mocks
- Domain model separated from the persistence model on iOS; the repository was swapped without touching a view
- Account deletion is a soft delete: the row is anonymized and kept so audit history survives, with a partial unique index (`WHERE deleted_at IS NULL`) so the same email can register again - App Store 5.1.1(v) requires in-app deletion
- 15-minute access tokens and a 30-day refresh token; `/auth/refresh` re-checks that the user still exists, so a deleted account is cut off at the next refresh. Rotation and reuse detection are documented as not implemented (ADR-007)
- Row types are zod objects and a test compares each with `information_schema` on every run - the core of what an ORM buys, without one (ADR-002) 
- Next: outbox sync with rotating idempotency keys and `(updated_at, id)` delta cursors → production hardening → Lambda + CDK inside always-free limits

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

`[x] 1 iOS MVP` · `[x] 2 SwiftData persistence` · `[x] 3 REST API + PostgreSQL + tests` · `[x] 4 Auth (JWT/RBAC)` · `[ ] 5 Offline sync (outbox · idempotency keys · delta cursors)` · `[ ] 6 Production hardening` · `[ ] 7 Deploy — Lambda · CDK · Neon (public URL)` · `[ ] 8 System-design write-up`

Lettered: `N` native UIKit↔SwiftUI · `L` fastlane · `E` measurement · `W` realtime (WebSocket) · `U` photo upload (S3) · `P` payments · `G` location (geofence · map · background) · `S` subscriptions (StoreKit 2) · `T` AI triage · `F` React dashboard · `K` KMP · `M`/`R` manager phone
