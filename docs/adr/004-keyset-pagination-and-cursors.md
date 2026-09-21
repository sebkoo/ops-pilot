# ADR-004: Keyset pagination and composite (updated_at, id) sync cursors

Date: 2026-09-03

## Status

Accepted

## Context

OFFSET pagination skips or repeats rows while rows are inserted; a plain timestamp cursor drops or repeats rows that share a millisecond.

## Decision

Lists page on (created_at, id) with row-value comparison; sync pulls deltas on (updated_at, id) with an opaque base64url cursor.

## Consequences

- (+) Stable pages under concurrent inserts; the index matches the query shape exactly.
- (-) No "jump to page N"; the client must carry the cursor.
