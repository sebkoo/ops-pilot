# ADR-008: Invoices are split into lines

Date: 2026-09-16

## Status

Accepted

## Context

A partial refund must be attributable to something, and tax categories differ by line (parts, labor, trip); a single total cannot express either.

## Decision

Add invoice_lines (position, kind, amount_cents) with UNIQUE (invoice_id, position); the invoice total is the sum of its lines.

## Consequences

- (+) Refunds and taxes have a home; a one-line invoice behaves exactly as before (reversible door).
- (-) One more table and one more join on the invoice screen.
