# ADR-003: Offline sync resolves conflicts server-wins
Date: 2026-09-03
## Status
Accepted
## Context
Two phones can edit the same issue while offline; a status transition is the latest physical truth on the floor.
## Decision
Every issue carries a version; the server rejects a stale write with 409; the client re-reads and re-applies, and the user is told what was discarded.
## Consequences
- (+) No merge engine; the rule fits in one sentence.
- (-) A user can lose an edit — surfaced, never silent. Field-level merge is deferred until a real case demands it.