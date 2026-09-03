# Decisions - why not X?

Short answers first; the longer reasoning lives in `docs/adr/`.

- **SWiftData, not CoreData** - new code, iOS 18+ target, far less boilerplate; hidden behind `IssueRepository`, so swapping back is one file.
- **Hono, not Express** - Web-standard Reqeust/Response, so the same app runs on Node, Lambda and Workers; only the entry file changes.
- **PostgreSQL, not DynamoDB** - relational data (stores, users, issues, events), ad-hoc dashboard queries, transanctions; writes stay in the hundreds of QPS even at scale.
- **Own API, not Firebase/Supabase** - the backend design is the portfolio: idempotency, state machine, cursors; a BaaS would hide exactly what interviews ask about.
- **Hand-rolled JWT, not Cognito/Auth0/Sign in with Apple** - a free Apple ID cannot use Sign in with Apple; auth is one middleware, so managed auth is a swap; refresh rotation and reuse detection are documented as not implemented yet.
- **Lambda + Function URL, not ECS/EC2** - demo traffic, always-free limits, nothing to patch; pool and cold-start limits are knwon and the ECS Fargate + RDS migraiton is designed (ADR-006).
- **Neon, not RDS** - RDS bills by the hour; Neon is Postgres-compatible with no card; production is a `DATABASE_URL` change.
- **Own sync engine, not CloudKit/Firebase offline** - the web dashboard must see the same data, and the engine is where the interesting decisions live (rotating idempotency keys, sever-wins, composite cursors).
- **On-device AI as a fallback tier, not API-only** - $0, private, offline; quality is lower, so every suggestion is assitive and a human applies it.
- **Monorepo** - one PR changes client, API and infra atomically; CODEOWNERS and path-filtered CI once a team grows.
- **Plain SQL, not an ORM** - interviews ask about query plans, indexes and locking, which an ORM hides; the repository layer is the seam, so Prisma/Drizzle is a one-file adoption.
- **Not Realm** - MongoDB ended Atlas Device SDK (Realm) support on 2025-09-30; nothing new should start on it.
- **Lambda, not Vercel/Render** - Render's free tier sleeps ater 15 min and takes about a minute to wak; Vercel Hobby is free but still serverless (cold starts reduced, not removed) and the database auto-suspend is the same; the target roles ask for AWS. The same Hono app deploys to Vercel with zero config if you prefer it.
