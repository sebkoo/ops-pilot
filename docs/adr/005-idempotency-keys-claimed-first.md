# ADR-005: Idempotency keys are claimed with a unique constraint before the handler runs

Date: 2026-09-03

## Status

Accepted

## Context

Retries after a timeout must return the first result instead of creating a duplicate, even when two retries arrive at the same moment.

## Decision

INSERT the key into idempotency_keys (PRIMARY KEY (user_id, key)) before running the handler; the loser of the race gets the stored response or a 409 while the first is still processing.

## Consequences

- (+) Exactly one execution per key, guaranteed by the database.
- (-) Keys must be cleaned up (24 h) and the request hash must be stored to reject key reuse with a different body.
