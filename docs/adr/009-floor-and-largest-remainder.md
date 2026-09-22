# ADR-009: Allocation rounds down and hands out remainders by largest remainder, in one function

Date: 2026-09-16

## Status

Accepted

## Context

Allocating a refund across lines in integer cents can over-allocate by rounding; three candidates: floor, round-half-up, banker's rounding.

## Decision

Floor every share, then give the leftover cents one at a time to the largest remainders; the rule lives in a single function that both server and app call.

## Consequences

- (+) Over-allocation is impossible by construction; integer division is the default operation, so the code is short.
- (-) The customer may lose at most one cent per allocation; if the accounting system ever mandates banker's rounding, follow it there and re-decide here.
