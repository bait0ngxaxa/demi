# AGENTS.md

## 1. Priorities and Scope

* Priority order: **Correctness > Security > Maintainability > Performance > Speed**
* Make the smallest necessary change and keep it consistent with the existing architecture.
* Read the relevant code before making changes. Do not infer behavior from file names or function names.
* Do not modify files outside the task scope, rewrite code unnecessarily, or revert existing user changes.
* UI/style work must not change business logic unless explicitly instructed.

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
* Treat existing repository implementations and conventions as the primary source of truth.
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

Use staged, proportional verification. Do not automatically run every command when a narrower check is sufficient.

### Normal iteration

Run only checks proportional to the change. Typical order:

1. relevant targeted test(s)
2. `architecture:check` when module boundaries may be affected
3. `lint:strict` when source/config changed
4. `typecheck` when TypeScript/runtime contracts changed

Examples:

```bash
npm run test -- path/to/changed-feature.test.ts
npm run architecture:check
npm run lint:strict
npm run typecheck
```

During routine implementation, pass an explicit test path to `npm run test`. Without a path, this command runs the full repository suite.

### Full-suite rule

If a full repository test suite is genuinely justified by broad regression risk, use:

```bash
npm run test
```

This command uses Vitest's default file parallelism. Do not use the full suite during normal edit/fix iterations. Normally run it no more than once near task completion, only after implementation is complete, targeted tests are green, lint is green, typecheck is green, architecture checks are green where applicable, and the diff is stable.

### Failure handling

If the full suite exposes failures:

1. identify and group the failures by root cause;
2. reproduce each relevant failure with targeted test commands;
3. fix the root cause;
4. rerun only the affected targeted tests;
5. rerun lint, typecheck, or architecture checks only when the fix affects them;
6. do not immediately rerun the complete suite after every small edit;
7. perform another full confirmation only when the corrective diff is stable and the additional full run is justified.

Do not use this loop:

```text
full suite
→ one failure
→ tiny edit
→ full suite
→ another tiny edit
→ full suite
→ repeat
```

### Flaky/resource-sensitive failures

A timeout, worker termination, resource exhaustion, or isolated failure from a broad run must not automatically be treated as a product defect. Reproduce the affected test in isolation first, for example:

```bash
npm run test -- path/to/failing.test.ts
```

If the focused test passes consistently and there is evidence of machine or resource contention, classify the broad-run failure separately from a deterministic application regression. Do not modify production code or weaken tests merely to make a resource-sensitive broad suite pass.

### Other checks

* Prefer scripts defined by the repository.
* Do not build or run the development server unless explicitly requested, required to reproduce an issue, or there is no other reasonable verification method.
* Tests must verify behavior rather than implementation details.
* Use unit tests for business rules and pure logic.
* Use integration tests for database interactions, authorization, and critical mutations.
* Use E2E tests for critical user flows, including both happy paths and error paths.
* Do not modify tests merely to make them pass without verifying that the expected behavior is still correct.
* If a command cannot be run, state the command, the reason, and what remains unverified.

### Build policy

Production builds are expensive and must only be used when justified. Run `npm run build` for framework upgrades, bundler or Next.js configuration changes, routing convention changes, build-time environment behavior, deployment/runtime compatibility, or changes where only a production build can reasonably verify correctness. Do not run a production build repeatedly during normal implementation.

## 10. Git and Delivery

* Inspect `git status` and `git diff` before and after making changes.
* Do not use destructive Git commands, force pushes, or reset user work without explicit authorization.
* Do not modify lockfiles, generated files, or format the entire repository unless required by the task.
* Keep diffs small, readable, and clearly separated by concern.
* Before completing the task, summarize:

  * Files changed
  * Behavior changed
  * Important security or architecture decisions
  * Commands and tests executed, including results
  * Remaining limitations, assumptions, or risks


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
