# Phase 17J.4A — Proactive Notification Owner Decision Closeout

- **Decision status: J4A-OD01–OD10 APPROVED; Cutover Safety and Honest Idempotency APPROVED.**
- **Decision date:** 2026-10-09, recorded from the owner instruction in the Phase 17J.4B implementation request.
- **Approval scope:** isolated synthetic/demo implementation of bounded appointment-only LINE notifications.
- **Not authorized:** real LINE Push, real-provider/device UAT, LINE resource or authorization mutation, environment or deployment changes, feature activation in a deployed environment, or production release.
- External privacy-controller/governance approval and production readiness remain separate gates. No signature, external approval, or provider evidence is asserted here.

This closeout supersedes the OPEN recommendation state in the earlier [Phase 17J.4A Decision Pack](./PHASE_17J4A_PROACTIVE_NOTIFICATION_DECISION_PACK.md) for the decisions listed below. The pack remains historical evidence of the proposal and source review.

## Approved decisions

| Decision | Approved contract |
| --- | --- |
| J4A-OD01 — Events | Notify only on appointment creation, actual date/time reschedule, and canonical cancellation. Hospital approval emits the same cancellation event. No acknowledgement, cancellation-request submission/rejection, completion, no-show, or scheduled reminder notification. |
| J4A-OD02 — Recipient | The currently authorized Patient SELF User on the exact appointment’s active Patient-Hospital relationship. No OSM, Hospital staff, Family/Caregiver, or LINE-only authority. |
| J4A-OD03 — Timing | Due immediately after the source transaction commits; a bounded worker handles it on its next invocation. No appointment-relative reminders, quiet-hours engine, or reminder timezone calculation. |
| J4A-OD04 — Opt-in | Explicit purpose-specific Patient opt-in for appointment updates over LINE, default OFF. Linking, friendship, and reactive Messaging do not imply consent. Relink requires fresh opt-in. This does not replace Phase 17E.2 legal consent. |
| J4A-OD05 — LINE eligibility | Exactly one active binding for the authorized Patient User, no conflicting state, and known FRIEND reachability observed within the prior 30 days. Missing, UNKNOWN, NOT_FRIEND, stale, conflicting, or unlinked state suppresses delivery. |
| J4A-OD06 — Content | Exact generic Thai text: **“มีข้อมูลใน DEMI อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ”**. No appointment/date/time, Hospital, Patient/staff identity, location, medical details, resource identifiers, or deep link. |
| J4A-OD07 — Outbox | One durable intent per committed appointment source version/event, inserted in the same transaction, with database uniqueness. Revalidate current source and recipient authority before each attempt; suppress superseded events. AuditEvent is not a queue. |
| J4A-OD08 — Retry and retention | One initial provider attempt and at most two retries for transient/ambiguous outcomes; proposed delays are 1 and 4 minutes with bounded jitter. Reuse one LINE retry key and payload within the documented validity window. HTTP acceptance is not delivery. Terminal-row retention target is 30 days; no production purge schedule is authorized. |
| J4A-OD09 — Opt-out/unlink | Stop new attempts after opt-out or unlink; pending work is suppressed at eligibility validation. Relink requires new opt-in for the new binding generation. An in-flight provider request cannot be recalled. |
| J4A-OD10 — Activation | Separate server-side gate `DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED=false`, independent of `DEMI_LINE_DISCONNECTION_ENABLED`. Do not enable in a deployed environment. |
| Cutover Safety | No historical replay. While disabled, appointment changes create no deliverable notification rows. Each enabled cutover uses a fresh rollout generation; old-generation work is ineligible and is suppressed when encountered. No real activation timestamp is recorded by this task. |
| Honest Idempotency | Database uniqueness and bounded leases prevent ordinary duplicate scheduling/overlapping active claims; settlement uses lease-token compare-and-set. Provider I/O runs outside database transactions. A crash/timeout after dispatch leaves an uncertain external result. No exactly-once request, visible delivery, or recall guarantee is made. |

## Approval limits

- This approval authorizes source implementation and automated verification only with synthetic records and a fake LINE provider in isolated tests.
- Real proactive LINE Push requires separate explicit authorization and external privacy/governance review. The existing reactive appointment privacy approval does not transfer to proactive Push.
- This closeout does not authorize real-provider UAT, user/device testing, LINE provisioning, LINE authorization changes, scheduler activation, Vercel/environment changes, deployment, or production release.
- Supabase Auth remains DEMI’s sole authentication authority. LINE identity never establishes Patient authority. Family/Caregiver access, medication Push, follow-up reminders, and general consent remain out of scope.

## Implementation handoff

The bounded implementation and its actual verification state are recorded in [Phase 17J.4B — Appointment LINE Notification Implementation](./PHASE_17J4B_APPOINTMENT_NOTIFICATION_IMPLEMENTATION.md). Focused unit and PostgreSQL checks passed for the synthetic/demo scope; overall Phase 17J.4 and P17D-NOTIF-01 remain open. Phase 17J.5A automated integrated re-audit/UAT-readiness is the next roadmap slice; any real-device/provider UAT stays separately authorized.
