# AGENTS.md

## Project-Wide Delivery Contract

## 1. Priorities and Scope

* Priority order: **Correctness > Security > Maintainability > Performance > Speed**
* Make the smallest necessary change and keep it consistent with the existing architecture.
* Read the relevant code before making changes. Do not infer behavior from file names or function names.
* Do not modify files outside the task scope, rewrite code unnecessarily, or revert existing user changes.
* UI/style work must not change business logic unless explicitly instructed.

## Production Code First

* Implement confirmed business requirements as complete production code. Do not put ordinary product behavior behind release documents, readiness status, demo/UAT labels, deployment stages, or feature activation switches.
* Equivalent authenticated actors with equivalent permissions and business data must receive equivalent behavior across compatible environments. Framework-required `NODE_ENV` behavior and technical provider configuration are allowed; neither may grant or remove business authority.
* Do not add generic feature flags, rollout frameworks, fake runtime persistence, temporary bypasses, or activation debt. If a sensitive rule is unresolved, keep the affected operation fail-closed and identify the missing domain/security rule.
* Release, demo, UAT, and operational records are informational. They do not authorize or disable application business flows. Preserve permanent authentication, resource authorization, consent, audit, and data-integrity rules.
* Sole application testing-flag exception: server-only `DEMI_ALLOW_TEST_NATIONAL_IDS`. Only exact `"true"` bypasses the Thai National ID checksum, independent of `NODE_ENV` and deployment labels; exactly 13 digits and valid category digits remain mandatory. Unset, false, or invalid values use strict validation. Never expose or enable it automatically; isolate synthetic identities in a separate test database.

## 2. Thai Text and Encoding

* **Thai text must never become corrupted, lost, translated, or mojibake.**
* Preserve the existing file encoding, BOM, and line endings.
* New text files must use **UTF-8 without BOM** unless the repository specifies otherwise.
* When using PowerShell, always specify encoding explicitly when reading or writing files, for example:

```powershell
Get-Content -Raw -Encoding UTF8

Set-Content -Encoding utf8NoBOM
```

* Never overwrite files containing Thai text using commands that rely on default encoding.
* Inspect `git diff` after making changes to detect corrupted characters such as `�`, malformed Thai text, or unintended whole-file encoding changes.
* Do not translate Thai text into English unless explicitly authorized.

## 3. Documentation and Repository Context

* Review project instructions, types, tests, schemas, and existing implementations before creating anything new.
* Resolve apparent conflicts in this order: (1) latest confirmed Product Owner direction, (2) accepted ADRs and current domain decisions, (3) current `PRODUCT.md` and `docs/CONTEXT.md`, (4) actual implementation and verification evidence (source code, schemas, and tests), then (5) relevant historical phase decisions. Existing code and tests describe current behavior; they do not override newer confirmed requirements.
* Treat historical phase documents and release, readiness, demo, UAT, and operations records as informative evidence, not business or runtime authority. Identify the newer authoritative decision, preserve security and data-integrity invariants, and investigate unresolved ambiguity before changing sensitive behavior.
* When using APIs or behavior from external libraries, verify the latest documentation through **Context7 MCP** or official documentation.
* Do not guess APIs, configuration options, framework behavior, or package versions.
* If documentation is unclear, state the assumption and choose the approach with the smallest impact.
* UI/UX work must use the **Impeccable skill** and follow the project's existing design system.

## 4. Code Quality and Type Safety

* Deliver complete implementations. Do not use placeholders such as `// ...`, pseudo-code, or empty functions.
* Prefer reuse before introducing new abstractions or implementations.
* Apply SRP, DRY, KISS, early returns, and pure functions where appropriate.
* Avoid unnecessary mutation.
* Newly modified first-party code must not introduce `any`.
* Use `unknown` together with schema validation or type guards.
* Define explicit return types for exported functions, services, hooks, actions, and API handlers.
* Handle `null` and `undefined` explicitly. Do not use non-null assertions without supporting evidence.
* Do not modify generated code or vendor code merely to bypass type errors.

## 5. Validation, Security, and Errors

* Validate input at every system boundary, including APIs, server actions, forms, webhooks, and environment variables.
* Use schemas as the Single Source of Truth and derive types from schemas whenever possible.
* Enforce authentication and authorization on the server for every mutation.
* Never trust roles, owner IDs, or permissions supplied by the client.
* Do not hardcode secrets, credentials, tokens, or sensitive configuration.
* Do not expose stack traces, SQL errors, internal paths, or implementation details to clients.
* Client-facing errors must be safe and understandable. Technical details should be recorded in server logs.

Standard order for server-side mutations:

1. Request size / abuse protection / rate limiting
2. Authentication
3. Input parsing and schema validation
4. Resource-level authorization
5. Business rules
6. Transactional persistence
7. Cache invalidation or revalidation
8. Sanitized response

## 6. Architecture and Single Source of Truth

* Types, constants, validation schemas, and business rules must each have a single authoritative source.
* Dependency direction:

```text
UI → Hooks → Services → Data Layer
```

* Lower layers must not import from higher layers.
* UI code must not access the database or persistence implementation directly.
* Business logic shared across multiple entry points must live in the service/domain layer rather than being duplicated in routes or components.
* Avoid circular dependencies and hidden side effects.

## 7. API and Database

* Public APIs intended for long-term support should use versioned endpoints.
* Use cursor-based pagination for datasets that may grow significantly.
* Mutations that may be retried, submitted more than once, or have significant side effects must define clear idempotency semantics.
* Never construct SQL from user input using string concatenation.
* Use parameterized queries or ORM query APIs only.
* Raw SQL must not use `SELECT *`; select only the required fields.
* Use transactions when multiple operations must either succeed or fail together.
* Production schema changes must be applied through migrations only.
* Enforce uniqueness, foreign keys, and concurrency constraints at the database layer when they represent business invariants.

## 8. Performance and Reliability

* Avoid accidental `O(n²)` behavior, N+1 queries, and repeated database or network calls.
* Use `Map` or `Set` for repeated lookups when appropriate for the dataset size.
* Use `Promise.all` only for operations that are independent and safe to execute concurrently.
* Do not parallelize operations that have dependencies, transaction ordering requirements, or shared mutable state.
* Use caching only when ownership, TTL, invalidation, and consistency behavior are clearly defined.
* Use dynamic imports only for dependencies that are large, unnecessary on the initial path, and provide measurable benefit.
* Retry only transient failures and operations that are safe to retry.
* Retries must have a maximum attempt count, exponential backoff, and jitter.
* Do not optimize based on speculation for code paths that are not known hot paths.

## 9. Testing and Verification

GitHub-hosted CI is the authoritative full-regression verification gate. Local verification provides focused, proportional feedback; a missing local full-suite run is not a delivery failure when the current commit has verified CI coverage. For job operations, diagnostics, manual runs and owner required-check setup, consult [the CI operational guide](docs/engineering/GITHUB_ACTIONS_INTEGRATION_CI.md).

### Local development: fast feedback

1. Inspect relevant code, requirements and architecture.
2. Implement the smallest correct change and add or update appropriate behavioral tests.
3. Run directly relevant focused tests and justified static checks.
4. Review the complete diff, including architecture boundaries, and address known defects before committing and pushing for CI. Any unresolved issues must remain explicit in the Draft PR and block readiness when material.

Use existing package scripts. For a focused unit test:

```bash
npm run test -- path/to/affected.test.ts
```

Without a path, `npm run test` runs the complete default Vitest suite under `src`, `app`, `scripts` and `deploy`; PostgreSQL integration uses a separate configuration. Use targeted ESLint where useful, `npm run lint` when broader lint coverage is justified, and `npm run typecheck` when TypeScript/runtime contracts change. Generate Prisma Client with `npm run prisma:generate` before checks that require it. Review architecture and module boundaries as an engineering obligation; no dedicated architecture-check script exists.

For PostgreSQL-backed focused tests, use only the existing disposable environment:

```bash
npm run test:db:up
npm run test:integration:focused -- tests/integration/affected.integration.test.ts
npm run test:db:down
```

Preserve the runner's environment and database identity validation before migrations or destructive tests. Arrange cleanup in a shell `finally`/trap or equivalent so `npm run test:db:down` executes even after failure, and preserve the original failure. If the disposable database is unavailable locally, report that local integration verification was not performed and delegate complete integration verification to CI. Never substitute a shared or production database or bypass identity guards.

### Full local verification: exceptional

Do not routinely require `npm run test`, `npm run test:integration` or `npm run build` before opening a PR. Complete unit testing, PostgreSQL integration and production build verification belong in CI. Full local verification is permissible when explicitly requested, CI is unavailable, a CI failure needs local reproduction, a critical risk warrants additional verification, or focused tests cannot reproduce an issue sufficiently. Record the reason and run only the justified scope; a local pass does not waive the CI gate below.

Production builds remain expensive. Framework/bundler/configuration changes, routing conventions, build-time environment behavior and deployment/runtime compatibility require appropriate build verification through CI by default. Use a local build only under the exceptional conditions above. Run a development server only when explicitly requested, needed to reproduce an issue, or no cheaper verification can establish correctness.

### CI authority and failure handling

Before classifying the current PR HEAD as READY FOR REVIEW for merge review, verify directly on GitHub that all four jobs in [the existing workflow](.github/workflows/full-integration.yml) completed successfully for that HEAD:

* Code Quality
* Unit Tests
* Full PostgreSQL integration
* Production Build

After every new commit, verify the checks applicable to the new HEAD; this pipeline requires all four. A local pass alone, older successful SHA, in-progress/failed/cancelled workflow, skipped required job, unsupported success claim or green badge without individual job conclusions does not satisfy this gate. Preserve command failure propagation; never use `continue-on-error`, test skipping or other bypasses to force a passing result. CI unavailability permits additional local evidence, not READY FOR REVIEW without the required hosted results.

When CI fails:

1. Read the exact failed job logs and preserve the original failure, test name and duration where applicable.
2. Classify the evidence: infrastructure/configuration, platform portability, resource contention, test fixture defect or deterministic application defect. State unresolved uncertainty.
3. Reproduce the specific issue where practical, fix the evidenced root cause and run useful focused local verification.
4. Push a new commit and verify the new CI run at its HEAD. Do not rerun complete local suites after every small fix.

A local resource-sensitive timeout, worker termination or broad-run failure is not automatically an application regression. Reproduce the affected test in isolation where practical and inspect resource evidence. Consistent focused passes plus evidence of contention must be distinguished from deterministic defects without claiming the timing cause is proven. One successful CI run establishes evidence for that tested commit, not future stability.

### Testing integrity

* Tests must assert meaningful behavior, business invariants, authorization, data correctness and database isolation rather than implementation details.
* Use unit tests for business rules/pure logic, integration tests for database interactions, authorization and critical/security-sensitive mutations, and E2E tests for critical user flows, including happy paths and realistic failure paths.
* Preserve authentication, authorization, privacy and data-integrity assertions. Do not weaken tests, add unjustified retries, raise deadlines to hide defects, add arbitrary exclusions, or change unverified production behavior merely to obtain a pass.
* If a check cannot run, report the command, reason and remaining verification gap. Keep known failures visible.
* CI is a technical verification gate, not security review, business acceptance, UAT or production release approval. These four jobs do not establish E2E/UAT coverage; claim such coverage only from actual corresponding execution evidence.

## 10. Git and Delivery

Preferred delivery workflow:

```text
Implement → Focused Local Verification → Review Diff → Commit
→ Push Feature Branch → Open/Update Draft PR → GitHub Full CI
→ Investigate and Fix Failures → Ready for Code Review → Owner Approval → Merge
```

* Inspect `git status` and `git diff` before and after changes. Keep diffs small, readable and separated by concern; preserve unrelated user work.
* Do not modify lockfiles/generated files or format the entire repository unless the task requires it.
* Commit and push within the task's authorization. Do not use destructive Git commands, reset user work, force-push or rewrite unrelated commits without explicit authorization.
* Open/update the Draft PR after focused checks; do not routinely wait for complete local regression. Pending CI or explicitly documented known issues are acceptable in a Draft PR, provided they are not represented as resolved.
* Mark work READY FOR REVIEW only after the current HEAD satisfies Section 9 and known blocking failures are resolved. Code review and owner approval remain required before merge. Do not merge automatically or bypass required checks.
* Do not change production branch protection or rulesets without explicit approval.

### Required delivery report

For every completed task, report:

* Branch, commit SHA and PR URL.
* Files changed, implemented behavior and important security/architecture decisions.
* Focused local checks actually executed and results; local checks intentionally delegated to CI.
* GitHub Actions run URL, tested SHA, all four job conclusions and relevant test totals.
* Remaining limitations, known failures or risks and a final readiness classification.

Use only these readiness classifications:

* **READY FOR REVIEW**: current HEAD's four checks verified successful, no known blocking failure; engineering review/owner approval still required.
* **REQUEST CHANGES**: known blocking defects or failed checks require correction.
* **BLOCKED**: a stated dependency or unavailable capability prevents completion; disclose verification gaps.
* **CI PENDING**: latest commit's required checks have not completed, including a run not yet started. Never substitute an older successful SHA. Identify any additional blocker explicitly.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
