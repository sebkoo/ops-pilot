# ADR-006: Lambda + Function URL now; ECS Fargate + RDS is the designed exit

Date: 2026-09-11

## Status

Accepted - decided, not yet implemented. The deploy itself is Phase 7; `infra/` is still empty
and there is no `lambda.ts` entry yet. This record exists so the choice and its exit are written
down before the code, not after.

## Context

- The load is demo load: reviewers, interviewers, and one developer. It is not sustained traffic.
- The project has a hard $0 constraint - no hourly-billed resources and no card on file.
- The target roles ask for AWS, so the platform is AWS-first. That is a positioning decision, not
  a technical one, and it is the reason equally free options elsewhere (Vercel, Render, Cloudflare)
  lose on a tie.
- Two costs of the serverless choice are known in advance rather than discovered later: a cold
  start on the first request after idle, and one connection pool per Lambda instance, so
  concurrency multiplies database connections.

## Decision

1. Run the API as a single Lambda behind a **Function URL**. No API Gateway, no ALB, no VPC -
   each of those adds hourly cost, cold-start latency, or both.
2. Keep Postgres on **Neon**, not RDS: RDS bills by the hour, and moving is a `DATABASE_URL` change.
3. Stay **AWS-first**. Cheaper or simpler equivalents elsewhere are rejected on that basis alone,
   and the rejection is recorded rather than argued each time it comes up.
4. **Do not build the ECS path now.** Write down its trigger and its shape here, so that migrating
   is a known quantity instead of a research project.

## The designed exit

Move to ECS Fargate + RDS when any one of these is true:

- Cold starts become a user complaint rather than a first-request quirk.
- Lambda concurrency pushes the database connection count past what a pooler absorbs.
- A feature needs to hold a connection open or keep state in the process - a Lambda cannot.
- The project gets a budget, so hourly billing stops being disqualifying.

Shape of the move: `api/src/app.ts` does not change. The Lambda entry file is replaced by the
existing `server.ts` in a container; the CDK stack swaps the Function URL for ALB + ECS Fargate;
`DATABASE_URL` points at RDS. Anything already behind a port (the repository layer today, rate
limiting and object storage later) moves without touching routes.

Cost boundary: ECS Fargate, ALB and RDS are all hourly-billed. That migration is the moment this
project stops being $0, which is why the trigger list is written before the bill exists.

## Consequences

- The first request after idle is slow. The README says so instead of hiding it.
- Anything that needs a held-open connection (realtime push, for example) cannot run on this
  deployment. That is an honest limit of this decision, not a defect to fix later.
- Nothing under `api/src` is Lambda-specific, so the exit cost is one entry file and one infra
  stack - not a rewrite. Keeping it that way is a constraint on every future change.
