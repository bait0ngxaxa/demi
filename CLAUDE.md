# AGENTS.md

Repository-wide engineering instructions.

More specific `AGENTS.md` files or project documentation may add local constraints, but must not weaken correctness, security, or data-integrity requirements.

## Engineering Priorities

When tradeoffs are necessary:

**Correctness > Security > Data Integrity > Maintainability > Performance > Delivery Speed**

Prefer the smallest solution that is demonstrably correct.

---

## Core Behavior

### Think Before Coding

* Understand existing behavior before changing it.
* Do not silently guess material requirements.
* Investigate uncertainty from code, tests, docs, configuration, and git history before asking the user.
* Use official documentation or Context7 when external library/framework behavior matters.
* Ask only when unresolved ambiguity materially affects behavior, security, schema, public contracts, or irreversible decisions.
* Surface meaningful tradeoffs and push back on unnecessary complexity or unsafe approaches.

### Simplicity First

* Implement only what is required.
* No speculative features, abstractions, configurability, dependencies, or premature optimization.
* Reuse existing patterns and abstractions when they represent the same responsibility.
* Prefer explicit, focused code over generic frameworks.
* Apply KISS, SRP, and DRY pragmatically; do not abstract merely to remove superficial duplication.

If a substantially simpler implementation provides the same correctness, prefer it.

### Surgical Changes

* Touch only what the task requires.
* Do not perform unrelated refactors, formatting, renaming, cleanup, dependency upgrades, or architectural rewrites.
* Match existing project conventions unless changing them is part of the task.
* Do not modify code you do not sufficiently understand.
* Remove only artifacts made obsolete by your own changes.
* Mention unrelated technical debt instead of fixing it opportunistically.

Every changed line should be justified by requested behavior, correctness, security, data integrity, required consistency, verification, or necessary documentation.

---

## Execution

For non-trivial work:

1. Inspect current behavior and relevant architecture.
2. Define the expected outcome.
3. Establish a useful feedback signal.
4. Implement the smallest correct change.
5. Run focused verification.
6. Review and stabilize the complete diff.
7. Run final broad verification only when appropriate.

For bugs, reproduce or establish a failing signal before fixing whenever reasonably possible.

Fix root causes rather than stacking speculative fixes.

Do not leave placeholders, fake success paths, temporary debugging code, or incomplete production behavior unless explicitly requested.

### Avoid Redundant Work

Do not repeat expensive work without new evidence that it is necessary.

Treat development as a narrowing loop:

```text
inspect
→ change
→ focused check
→ refine
→ focused check
→ review final diff
→ broad verification
→ finish
```

Not:

```text
change
→ full suite
→ inspect diff
→ change
→ full suite
→ inspect diff
→ change
→ full suite
```

The full test suite is not an inner-loop debugging tool.

Do not rerun an expensive command simply because another file was edited afterward. First determine whether that edit could invalidate the result of the previous verification.

Prefer incremental confidence over repeatedly rebuilding confidence from zero.

---

## Architecture & Security

Respect existing module and domain boundaries.

Before creating a new service, helper, hook, component, type, repository, policy, or utility, check whether an existing abstraction already owns that responsibility.

Do not duplicate domain rules across layers.

Authorization is authoritative on the server.

Never rely solely on:

* hidden or disabled UI;
* client-side role checks;
* route visibility;
* client-supplied ownership or permission data.

Authorization must fail closed.

Do not weaken authentication, authorization, validation, typing, tests, or security controls merely to make a flow pass.

At external boundaries, handle realistic failures from user input, databases, networks, filesystems, authentication systems, and third-party services.

Protect persisted-data invariants. Use transactions, idempotency, concurrency protection, and migrations when the actual problem requires them.

---

## Verification

Verification is part of implementation, but it must be proportional to the change.

Inspect repository scripts and use the project's established commands.

Typically verify with the relevant subset of:

* lint;
* typecheck;
* focused unit tests;
* relevant integration tests;
* schema/client generation or validation;
* full test suite when justified.

### Verification Strategy

Use verification in layers.

**During implementation:**

* Run the smallest check that can detect the current mistake.
* Prefer affected tests, specific test files, package-scoped checks, or relevant lint/typecheck commands.
* Iterate until the implementation is stable.
* Do not run the full suite after every code adjustment.

**Before broad verification:**

* Review the complete diff first.
* Remove debugging artifacts.
* Resolve obvious issues.
* Confirm the implementation is no longer actively changing.

**At final verification:**

* Run the broadest checks justified by the scope of the change.
* Run the full suite when the change has meaningful cross-cutting or regression risk, or when repository policy requires it.
* Avoid multiple full-suite runs unless later changes actually invalidate the previous result.

### After a Successful Full Suite

A passing full suite establishes a verification baseline for the exact code state that was tested.

If subsequent changes are made:

* determine what behavior those changes can affect;
* rerun focused checks for the affected area;
* rerun the full suite only if the later change has broad impact, changes shared behavior, affects architecture or configuration globally, or otherwise invalidates the previous full-suite confidence.

Examples that usually **do not** justify another full suite:

* fixing a comment;
* removing an unused import;
* correcting local formatting;
* changing isolated UI copy;
* a small implementation adjustment covered by focused tests and typechecking.

Examples that **may** justify another full suite:

* changing shared infrastructure;
* modifying global middleware;
* changing authentication or authorization behavior;
* modifying shared schemas or domain primitives;
* changing test/runtime configuration;
* changing code used broadly across unrelated modules.

Do not blindly restart verification from zero.

### Expensive Commands

Treat expensive checks as scarce resources.

Do not repeatedly run:

* full test suites;
* production builds;
* full integration environments;
* end-to-end suites;

when a cheaper check can answer the current question.

Prefer:

**focused feedback while developing → broad confidence when stable**

Do not automatically start a development server or full production build unless needed to verify behavior that cheaper checks cannot cover.

Never claim a check passed unless it was actually executed successfully.

Distinguish clearly between:

* passed checks;
* failed checks;
* checks not run;
* failures introduced by the change;
* pre-existing failures.

Do not alter tests or static-analysis rules just to make verification green.

---

## UI / UX

For UI work:

* follow the existing design system and interaction patterns;
* use available UI/UX skills such as Impeccable when applicable;
* consider responsive/mobile behavior, accessibility, loading, error, success, empty, and disabled states;
* avoid arbitrary visual values when project tokens/primitives already exist;
* do not introduce a new design system or UI framework without a real requirement.

UI permission visibility is not a security boundary.

---

## Text & Encoding

Use UTF-8.

Preserve Thai text correctly and never introduce mojibake.

Do not replace Thai content with English merely to avoid encoding problems.

Explicitly use UTF-8 when tools or environments make encoding ambiguous.

---

## Dependencies & Git

Do not add dependencies when the existing stack or a small local implementation solves the problem cleanly.

Do not upgrade unrelated dependencies.

Respect existing user changes.

Do not revert unrelated work, reset branches, discard uncommitted changes, rewrite history, commit, push, merge, or rebase unless explicitly required by the task.

---

## Completion

Before finishing, confirm:

* requested behavior is implemented;
* the solution is no more complex than necessary;
* no unrelated changes were introduced;
* security and data invariants remain valid;
* relevant verification was actually performed;
* expensive verification was not repeated without justification;
* temporary/debug artifacts are gone;
* the final diff was reviewed **before** the final broad verification where practical.

Final reports should state only:

1. what changed;
2. important implementation decisions;
3. verification actually executed;
4. remaining limitations or relevant pre-existing failures.

## Operating Principle

**Investigate before guessing.
Keep the design simple.
Change surgically.
Use focused feedback while iterating.
Run expensive verification only when it adds new confidence.
Verify broadly once the work is stable.**
