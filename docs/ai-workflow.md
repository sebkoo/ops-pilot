# AI in this codebase

A policy, not enthusiasm. Claude and Copilot are used here every day; this file
says **where they earn their keep, where they are kept out, and how anything they
produce is verified** before it becomes a commit.

The short version: *AI output is a draft under review. It is never a merge.*

## Where I use them

| Task | Tool | Why it fits | How I verify |
|---|---|---|---|
| Scaffolding and config (Dockerfile, CI YAML, tsconfig, CDK boilerplate) | Claude | No design decisions, high typing cost | The pipeline has to actually run green |
| Enumerating test cases ("what else breaks?") | Claude | Good at the cases I stop thinking of | Every case must **fail first**, then pass |
| Mechanical refactors across many files | Claude | Wide and repetitive, easy to review as a diff | `git diff` hunk by hunk + full suite |
| Triaging an unfamiliar error | Claude | Faster than doc search | I reproduce the fix locally before keeping it |
| Explaining an API I have not used | Claude | Gets me to the right doc page | I read the primary doc before relying on it |
| Line completion while typing | Copilot | Cheap, local, low stakes | The compiler |
| First draft of ADRs and commit messages | Claude | It drafts context, I make the decision | I rewrite the decision sentence myself |

## Where I keep them out

- **Schema and API contract decisions.** A wrong column type is a migration later.
- **Auth, token lifetime, and anything touching credentials.** Read line by line, by me.
- **SQL on a hot path.** I write the query and read `EXPLAIN` myself.
- **Dependency choices.** An added package is a permanent liability; that is a judgment call.
- **User-facing copy.** Generated English drifts in tone; the product voice stays mine.

## Five rules I hold to

1. **Nothing merges without a test that failed first.** A green test written after the
   code is a green test that proves nothing.
2. **If I cannot explain a generated line out loud, it does not go in.** This is the
   cheapest filter I know, and it is the same bar an interviewer uses.
3. **Generated code gets a junior-PR review**, including the most useful review comment
   there is: *delete this, it is not needed.*
4. **No secrets, customer data, or proprietary source in prompts.** Ever.
5. **The model does not get to choose the architecture.** Boundaries here
   (`IssueRepository`, the error envelope, the state machine) were decided first and
   then held; the assistant fills them in, it does not redraw them.

## What this actually looked like on this project

Real defects from this build, each triaged with AI assistance and then reproduced and
fixed by hand before committing:

- `https://localhost:8787` against a plaintext dev server — TLS handshake failed before
  the request ever reached the API, so the server log stayed silent and the app only
  said "network error".
- A SwiftUI `.task`/`.refreshable` pair attached to a toolbar `Button` instead of the
  `List` — pull-to-refresh silently did nothing, and the in-flight load cancelled itself
  every time `isLoading` changed.
- A client/server enum spelling mismatch (`in-progress` vs `in_progress`) that passed the
  first state transition and failed the second with a 400.

None of these were found by generation. They were found by **running the thing and
reading the error**, which is still the job. What the assistant shortened was the
distance between the error message and the hypothesis.

## Why this file exists

Teams are right to be wary of "AI-assisted" on a résumé — it can mean *I paste and pray*.
This is the alternative claim: a written policy, a verification step attached to every
use, and a list of places the tool is not allowed. That is the version worth hiring.
