# DEMI System-State Copy Guidelines

This document complements [Product Language Guidelines](PRODUCT_LANGUAGE_GUIDELINES.md). It defines how existing action results and recovery contracts should appear in Thai user interfaces. It does not change authorization, business rules, persistence, or retry behavior.

## Message principles

- Lead with the outcome the server can confirm: completed, still processing, unavailable, or unconfirmed.
- Say what the user should do next. Use one primary message and one obvious action; add supporting detail only when it changes a decision.
- Use ordinary Thai. Keep implementation terms such as nonce, token, session ID, provider state, and reconciliation in code, logs, or specialist diagnostics.
- Never infer success from a request being sent or accepted. Say “บันทึกแล้ว” only when persistence is confirmed.
- Keep important security consequences visible. A disclosure may hold secondary diagnostics, but must not hide a warning the user needs before acting.
- Match detail to the audience: patients get a direct next step; อสม. get safe task guidance; hospital workers get operational outcomes; hospital administrators get security consequences; platform administrators retain incident detail.
- Do not repeat the same outcome in a parent and child alert, a success banner, and an accessible status announcement.

## State-to-presentation mapping

| Confirmed condition | User-facing presentation | Required boundary |
| --- | --- | --- |
| Mutation completed and persistence confirmed | State that it was saved or completed; offer the next task when useful. | Do not stack a second success message for the same result. |
| Request is pending | Say it is being processed or prepared. | Pending is not completed; keep the next submission disabled until the workflow is ready. |
| Outcome is unknown | Say the result could not be confirmed and give the workflow's safe recovery action. | Never call it success or invite an unsafe replay. |
| Authentication expired | Ask the user to sign in again and preserve the validated return destination. | Keep separate from missing authentication, revoked sessions, service outages, and permission denial. |
| Authenticated user lacks permission | Say “คุณไม่มีสิทธิ์ทำรายการนี้”; direct them to the hospital administrator when appropriate. | Do not imply that signing in again will grant permission or reveal a protected resource. |
| Local DEMI account lock is confirmed; external sign-in revocation is not | State both facts separately and name the remaining check. | Do not imply all external sessions have ended or that recovery may proceed before the required checks. |
| Activation link is expired, used, or unavailable | Explain that the link cannot be used and name the permitted next step. | Keep expiration, single-use, reissue invalidation, ownership, and uncertain issuance semantics distinct. |

## Unknown mutation recovery

The recovery kind in `src/components/ui/unknown-outcome-alert.tsx` is a behavioral contract. Keep these actions distinct:

| Recovery | User action | What it proves | Safety requirement |
| --- | --- | --- | --- |
| `resend` | “ตรวจสอบผลของรายการ” | The server can resolve the original operation by receiving its original identity and payload again. | Only use when the server safely deduplicates that exact identity. Preserve payload and navigation guard; do not submit automatically. |
| `reload` | “ดูข้อมูลล่าสุด” or a workflow-specific list check | The page shows the current persisted state. | It does not prove which request changed the record. Explain any discarded one-time result or unsaved input. |
| `verify` | “ตรวจสอบสถานะ” | A separate query checks current state using the existing identifier. | Preserve that identifier and navigation guard; never replace this query with mutation replay. |
| `review` | Inspect the latest records before deciding whether to submit again. | The user has checked existing records. | Do not provide automatic resubmission or claim duplicate prevention when the server has none. |
| `note` | Follow the workflow's stated manual check. | No in-page verification is available. | Use only recovery instructions supplied by that workflow; do not invent a retry. |

The shared hook in `src/components/ui/mutation-action-state.ts` may resend only the captured original payload and only for actions whose server contract safely deduplicates it. Other forms must use their own existing recovery operation.

## Audience and security detail

- **Patients and caregivers:** use simple language, preserve their work when safe, and state whether care data or account information was saved. Do not expose identifiers or protected-resource existence.
- **อสม.:** name the task and safe next step. Do not expose nonce or request-identity mechanics.
- **Hospital staff:** name the affected record and distinguish a saved change from a pending or unconfirmed one. For an unknown create without deduplication, ask them to check the list before starting again.
- **Hospital administrators:** disclose local account lock separately from unconfirmed external sign-in revocation. For assisted activation, tell them not to hand off a device if sign-out or link revocation is unconfirmed.
- **Platform administrators:** preserve the evidence, quarantine reason, and remediation needed for incident investigation. Do not present a quarantined reset as recovered until the authoritative reconciliation succeeds.

## Before and after examples

| Situation | Less helpful | Preferred direction |
| --- | --- | --- |
| Shared unknown outcome with safe resend | “ลองใหม่” | “ยังยืนยันผลรายการนี้ไม่ได้” with “ตรวจสอบผลของรายการ”; disclose that the same request and information are checked again only for a deduplicated workflow. |
| Registration result unknown | “คำขออาจดำเนินการแล้วหรือยังไม่เสร็จ… หากคิดว่าตั้งรหัสผ่านสำเร็จ…” | “ยังยืนยันผลการลงทะเบียนไม่ได้” followed by “กรุณาอย่าส่งข้อมูลซ้ำ หากตั้งรหัสผ่านแล้วให้ลองเข้าสู่ระบบ หากเข้าไม่ได้ให้ติดต่อโรงพยาบาลที่ดูแล”. |
| Local lock confirmed, provider revocation uncertain | “ยังยืนยันการระงับการเข้าใช้กับบริการภายนอกไม่ได้” | “ระงับการใช้งานบัญชีแล้ว” followed by “ยังยืนยันการระงับการเข้าสู่ระบบผ่านบริการภายนอกไม่ได้”. |
| Assisted activation sign-out and rollback uncertain | Technical explanation about closing an administrator session and canceling temporary activation | Say that sign-out and link cancellation remain unconfirmed, and the device must not be handed off until the DEMI administrator is contacted. |
| Activation issuance uncertain | “ออกลิงก์ใหม่” | Tell the user whether the existing link can still be displayed. Never issue a replacement automatically when issuance is unknown. |

## Cross-role audit inventory

This focused audit records the decision and risk for representative system-state findings. Internal identifiers, logs, tests, and service comments were searched but were not treated as user-facing defects by default.

| Location and audience | Current condition and recovery action | Copy decision | Constraint / risk |
| --- | --- | --- | --- |
| `src/components/ui/unknown-outcome-alert.tsx`; patients, อสม., hospital staff | Mutation result is unknown; recovery varies by workflow. | Keep five distinct recovery messages and actions; do not replace them with generic retry. | High: replay, persistence, or navigation mistakes can duplicate or lose work. |
| `app/app/patients/provision/patient-provisioning-workspace.tsx`; hospital administrator | Patient import may have partially persisted; recheck the same file and review “มีอยู่แล้ว” rows before another confirmation. | Name the uncertain import result first, then describe the safe same-file recheck. | Critical: clinical and patient data must not be duplicated or reported as fully saved. |
| `app/register/self-registration-form.tsx`; patient | Registration may have completed or may still be processing; do not resubmit, try login, then contact the hospital or use account recovery. | Shorten the explanation while keeping the no-resubmit warning and existing login/recovery actions. | High: never imply the password was set or the account was created. |
| `app/app/users/[kind]/[relationshipId]/page.tsx`; hospital administrator | DEMI lock is confirmed; external sign-in revocation still needs confirmation; inspect or retry below. | Keep the local lock status and external uncertainty distinct without repeating the lock warning. | High: do not promise remote logout or weaken recovery checks. |
| `src/modules/workforce/transport/server-actions.ts`; hospital administrator | Assisted sign-out and activation-link revocation are unconfirmed; stop device handoff and contact the DEMI administrator. | Replace session terminology with the uncertain result and required action. | Critical: an activation link or administrator session may remain usable. |
| `app/app/admin/recovery/quarantined-resets.tsx`; platform administrator | Password-provider outcome is unknown; reconcile the actual provider state. | Keep the technical explanation and quarantine result visible to the operator. | Critical: an account stays quarantined until authoritative recovery or rollback is confirmed. |
| `app/line/` and `docs/line/account-ux.md`; all LINE users | LINE entry, linking, recovery, and external-browser states have their own validated lifecycle and safe recovery. | Leave the recently completed LINE copy and behavior unchanged in this pass. | High: preserve LIFF/browser handling and LINE authorization boundaries. |

## Regression expectations

Tests should verify behavior and state, not copy alone:

- Exercise all five recovery kinds. Verify same-identity/same-payload resend, no automatic replay, reload limitations, verification identifier retention, review-before-resubmit, note-only recovery, and navigation guards.
- Keep unknown, pending, local-commit, and confirmed-success outcomes distinguishable. Assert that unconfirmed persistence is never announced as saved.
- Cover expired, missing, revoked, and unavailable authentication separately from authorization denial. Validate return-to-login handling.
- Cover confirmed account lock, unconfirmed provider revocation, retry, and recovery authorization without changing lock or provider contracts.
- Cover activation issue/reissue, one-time display, expiration, prior-link invalidation, and unknown issuance. Do not expose activation secrets in UI assertions, logs, or analytics.
- For Thai copy changes, assert the safe next step and material consequence. For status announcements, ensure only one live announcement represents each outcome.

Relevant behavioral coverage includes `src/components/ui/mutation-action-state.test.tsx`, `app/register/self-registration-form.test.tsx`, `app/app/users/[kind]/[relationshipId]/page.test.tsx`, and the affected workflow and integration tests.
