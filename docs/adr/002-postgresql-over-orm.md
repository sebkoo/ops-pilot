# ADR-002: PostgreSQL everywhere, plain SQL instead of an ORM
Date: 2026-09-03
## Status
Accepted
## Context
Relational data (users, issues, events), ad-hoc dashboard queries and transactions; query plans, indexes and locking must stay visible in the code rather than behind a query builder.
## Decision
PostgreSQL 17 in Docker locally and Neon for the demo; hand-written SQL behind repository modules; numbered migration files applied by scripts/migrate.ts.
## Consequences
- (+) Query plans stay visible; one dialect everywhere; the repository layer is the seam, so an ORM is a one-file adoption.
- (-) Row types are hand-written copies of the tables; a test compares each against the live schema (OP-4.8).