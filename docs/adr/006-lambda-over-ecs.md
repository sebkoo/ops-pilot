# ADR-006: Lambda + Function URL now; ECS Fargate + RDS is the designed exit
Date: 2026-09-03
## Status
Proposed - becomes Accepted in Phase 7
## Context
Demo traffic, no fixed monthly cost at pilot scale, nothing to patch; the same Hono app must move to containers without a rewrite if traffic or connection limits demand it.
## Decision
Deploy the API as one Lambda behind a Function URL (CDK), secrets in SSM, Postgres on Neon; document the ECS Fargate + RDS target and the trigger to move.
## Consequences
- (+) INside always-free limits; infrastructure as TypeScript; teardown is one command.
- (-) Cold starts and a small connection pool; measured and written down, not hidden (docs/metrics.md)