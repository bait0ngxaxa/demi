# Phase 17J.2B — Deterministic Reactive Messaging Technical Contract

- **Phase 17J.2A — CLOSED / OWNER DECISION COMPLETE**
- **Phase 17J.2B — TECHNICAL CONTRACT DRAFT COMPLETE / REVIEW REQUIRED**
- **Phase 17J.2 runtime — NOT IMPLEMENTED**
- Source/check date: **2026-10-07**; original draft inspected clean HEAD `fd3bb97ec260cd8fe6edf8240faeb15fcdc4e84b`; bounded correction re-audited HEAD `bbd52843a13b6a56d0949c3ac55944fb4c8b40a0` on **2026-10-07**. Current-state authority, one coherent read, local timing and unresolved receipt retention below supersede the original draft details; product decisions remain closed.
- This is a documentation/source-audit/design artifact. All proposed types, enum additions, files, menu changes and tests below are **future implementation requirements subject to contract review**, not changes delivered here.

## 1. Status and authority

[17J.2A owner closeout](./PHASE_17J2A_REACTIVE_MESSAGING_DECISION_CLOSEOUT.md) is the locked product/privacy authority; [decision pack](./PHASE_17J2A_REACTIVE_MESSAGING_DECISION_PACK.md) preserves the alternatives and audit history. Its references to technical mechanics being OPEN describe the handoff into this draft; this document chooses those mechanics for review, without reopening Q01–Q14 or claiming implementation approval.

Preserve [17J.0](./PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md) CLOSED / ARCHITECTURE CONTRACT COMPLETE, [17J.0B](./PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md) CLOSED / OWNER DECISION CLOSED (Option C), [17J.1 contract](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md) and [17J.1 implementation](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION.md) IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE. [CONTEXT](../CONTEXT.md) carries current status. Historical status text in earlier artifacts is not a current runtime claim.

## 2. Purpose and boundary

Specify one implementation-ready command, `PATIENT_NEXT_APPOINTMENT`, from verified webhook through durable acceptance, transient post-response handling, current authority, narrow domain read and best-effort Reply. LINE owns transport/presentation; Patient SELF/Appointment owns facts and selection. No second appointment domain, notification framework or browser authentication flow is created.

## 3. Locked owner decisions

Q01/Q02/Q14: PATIENT SELF only, READ ONLY, exact deterministic Rich Menu business postback, 1:1 user source. Q03: exactly Thai date/time from `scheduledAt` and Hospital display name. Q04: nearest canonical SCHEDULED at/after one server query instant, across all currently authorized own relationships. Q05/Q07: distinct authorized-empty, generic-ineligible and infrastructure copy (§15). Q06: no embedded appointment navigation. Q08: presentationRole != authorization. Q09/Q10: transient single-use token, best effort, no Push/exactly-once promise. Q11: stateless. Q12: sanitized minimal telemetry/no ordinary clinical-read AuditEvent. Q13: unsupported messages/events ignored. These are owner approved or pre-existing closed architecture, not recommendations in this draft.

Owner's acknowledged reactive-chat privacy exposure remains narrow: chat history/previews/screenshots/shared devices can reveal healthcare timing/Hospital relationship. This does not approve proactive disclosure or close P17D-NOTIF-01.

## 4. Current source audit

Test files were read as evidence; **no runtime tests were executed in this task**.

| Source | Verified behavior / implementation consequence |
| --- | --- |
| [Route](../../app/api/line/webhook/route.ts), [route tests](../../app/api/line/webhook/route.test.ts) | Node.js, force-dynamic; awaits local processing, schedules returned binding IDs, then 200 sanitized counters/no-store. Existing duplicate-only tests concern foundation reconciliation; add reactive-only duplicate scheduling assertions separately. |
| [Webhook service](../../src/modules/line/services/line-webhook-service.ts), [tests](../../src/modules/line/services/line-webhook-service.test.ts) | 1 MiB raw-byte cap, signature before fatal UTF-8/JSON decode, destination check, empty events permitted, unknown/malformed siblings ignored; sequential per-event serializable receipt/effect transaction. P2002 checked against prior receipt. No business command/query/Reply. |
| [Schemas](../../src/modules/line/schemas/line-schemas.ts), [signature adapter](../../src/modules/line/adapters/line-webhook-security.ts) | ULID event ID, safe integer timestamp, optional source/token/postback, additive passthrough. `mode`/`deliveryContext` are not explicitly typed. Signature is raw-body HMAC-SHA256/base64, constant-time comparison. Extend narrowly without rewriting foundation classification. |
| [Messaging client](../../src/modules/line/adapters/line-messaging-client.ts), [tests](../../src/modules/line/adapters/line-messaging-client.test.ts) | Rich Menu operations only; existing Messaging channel token, no-store, 12-second AbortSignal timeout; 429/5xx/network → TRANSIENT, other errors → PERMANENT. No Reply or internal retry loop. |
| [Scheduler](../../src/modules/line/transport/line-reconciliation-scheduler.ts), [reconciler](../../src/modules/line/services/line-menu-reconciler.ts), [entry resolver](../../src/modules/line/services/line-entry-reconciliation.ts) | `after()` registration/callback failures contained. Menu repair uses durable sync/cleanup state, 90-second leases, lifecycle fencing, lazy/operator recovery. Entry resolver uses browser session and may return an inactive cleanup binding; neither is reactive authority or a reactive retry mechanism. |
| [Catalog](../../src/modules/line/rich-menu/catalog.ts), [layout](../../src/modules/line/rich-menu/layout.ts), [builder](../../src/modules/line/services/line-deep-link-builder.ts) | 18 shared menu variants, URI/richmenuswitch actions only, static workspace marker. Current top area assumes one workspace URI; adding a second action requires distinct bounds/assets. Builder has no appointment intent; leave it unchanged. |
| [Eligibility](../../src/modules/line/services/line-eligibility-service.ts), [account service](../../src/modules/line/services/line-account-service.ts) | Menu eligibility currently constructs a limited actor for SELF context; do not reuse that construction for a business command. New binding timestamps default in DB; relink sets lastLinkedAt and increments lifecycleVersion; unlink increments version and sets unlinkedAt, with raw cleanup locator possibly retained. ALREADY_LINKED preserves lifecycle. |
| [Actor types](../../src/modules/auth/types/actor-context.ts), [resolver](../../src/modules/auth/services/actor-context-service.ts), [tests](../../src/modules/auth/services/actor-context-service.test.ts) | Canonical ACTIVE User record maps roles, Person, Hospital memberships and OSM relationships including Hospital statuses. Resolver currently looks up by authSubject; LINE requires current User-ID seam with shared mapping, no fabricated actor or browser session. |
| [SELF policy](../../src/modules/patient-self/policies/patient-self-policy.ts), [query](../../src/modules/patient-self/services/patient-self-query-service.ts), [tests](../../src/modules/patient-self/services/patient-self-query-service.test.ts) | Policy alone checks capability/PATIENT/actor identifiers. ownPatientWhere also checks exact persisted User/Person, ACTIVE and persisted PATIENT. Relationship reads include SUSPENDED/PENDING_VERIFICATION Hospitals; tests assert no Hospital operational-status filter. |
| [SELF care query](../../src/modules/patient-self/services/patient-self-care-query-service.ts), [tests](../../src/modules/patient-self/services/patient-self-care-query-service.test.ts) | History is one relationship, scheduledAt/id DESC, page 50 + lookahead. DTO contains IDs/type/duration/location/status/staff/OSM/acknowledgement/cancellation requests. Do not page/scan/reuse it for LINE. |
| [17D.0 approved contract](./PHASE_17D0_APPOINTMENT_INTERACTION_CONTRACT_CONSOLIDATION.md), [17D.1](./PHASE_17D1_APPOINTMENT_INTERACTION_IMPLEMENTATION.md), [definitions](../../src/modules/appointments/domain/appointment-definitions.ts), [policy](../../src/modules/appointments/policies/appointment-policy.ts), [access](../../src/modules/appointments/services/appointment-access-service.ts), [service](../../src/modules/appointments/services/appointment-service.ts) | Canonical status separate from acknowledgement/cancellation request; approval cancels atomically. Operational Appointment policy includes Hospital ACTIVE checks; it must not replace the approved SELF read path, which intentionally preserves own Hospital visibility. Existing mutations remain web/domain behavior only. |
| [Schema](../../prisma/schema.prisma), [LINE migration](../../prisma/migrations/20261006120000_line_account_linking_rich_menu/migration.sql), [integration evidence](../../tests/integration/line-account-linking.integration.test.ts) | ACTIVE-only fingerprint/User unique indexes; retained-history conflict protection; lifecycle versions 1 → unlink 2 → relink 3. Receipt PK is provider event ID; enums currently FOLLOW/UNFOLLOW/RICHMENUSWITCH and APPLIED/STALE/IGNORED. Appointment scheduledAt is timestamptz(3); no stored business timezone. |

No contradiction invalidates post-response design. Three concrete gaps are contractual dependencies: receipt enum vocabulary, User-ID actor resolution, and a narrow cross-relationship SELF read. Existing 17J.1 duplicate suppression applies to durable foundation effects/reconciliation, not proof of a Reply being sent. Existing eligibility/menu visibility is presentation, not new business authority.

## 5. Official platform constraints — verified 2026-10-07

These are provider facts; the local algorithm below is DEMI's technical decision.

| Official source | Verified constraint |
| --- | --- |
| [Signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/) | Verify HMAC-SHA256 with channel secret over original body bytes before processing; do not transform body. |
| [Common fields](https://developers.line.biz/en/reference/messaging-api/nojs/#common-properties), [postback](https://developers.line.biz/en/reference/messaging-api/nojs/#postback-event), [source user](https://developers.line.biz/en/reference/messaging-api/nojs/#source-user) | Event ID is ULID; timestamp is provider UNIX-millisecond original occurrence, unchanged on redelivery, not DEMI receive time or an authorization clock. Sources distinguish user/group/room. Standby has no Reply token and should not send messages. isRedelivery is transport metadata. |
| [Webhook body](https://developers.line.biz/en/reference/messaging-api/nojs/#request-body), [response](https://developers.line.biz/en/reference/messaging-api/nojs/#response) | Multiple events/users can share one request; empty events allowed; successful receipt requires 2xx. |
| [Redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/#webhook-redelivery) | Same event ID/token; isRedelivery changes. Enabled redelivery follows non-2xx; duplicates also arise otherwise. Delivery/count/interval are not guaranteed. |
| [Reply API / token](https://developers.line.biz/en/reference/messaging-api/nojs/#send-reply-message) | Single-use; normally within one minute of receipt. Redelivery permits one minute from redelivery unless already used or event older than 20 minutes. Timing can change; send promptly, eligibility is not a guarantee. |
| [Webhook errors](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/#check-error-reason) | No response within 2 seconds is request_timeout. |
| [Retry support](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/#apis-with-available-retry-keys) | Reply is outside retry-key endpoints; unsupported X-Line-Retry-Key produces 400. |
| [Postback action](https://developers.line.biz/en/reference/messaging-api/nojs/#postback-action) | Static data returned as postback.data; usable in Rich Menu. |

Reference content was also inspected through LINE's official [Markdown reference](https://developers.line.biz/en/reference/messaging-api/index.html.md), because the HTML index collapses sections; the linked nojs reference exposes verified section anchors.

[Next.js after()](https://nextjs.org/docs/app/api-reference/functions/after) supports Route Handlers and runs callbacks after response completion, including unsuccessful completion. Execution is constrained by route/platform duration; Node/Docker supported, static export unsupported, adapters platform-specific. Serverless hosting needs a compatible waitUntil integration. This is not durable work storage or crash recovery. Verified against repository [package.json](../../package.json) (`next` 16.3.0) and installed official `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`; Context7 official-site query agrees. Context7's versioned package list did not contain 16.3, so it was not represented as version-specific evidence. Hosting support must be verified before deployment; no deployment is performed here.

## 6. Architectural decision

Choose **durable local acceptance → register transient after() work → HTTP 200 → fresh authority/query → one immediate Reply attempt**. This preserves 17J.0 §16 and the 17J.1 seam. No business query/Reply network call runs on the synchronous request path or inside the receipt transaction.

```mermaid
sequenceDiagram
    participant LINE
    participant Route
    participant DB
    participant After as after callback
    participant Domain as Auth / Patient SELF
    LINE->>Route: Signed bounded multi-event webhook
    Route->>Route: Verify bytes, destination; classify siblings
    loop supported event
        Route->>DB: Per-event receipt / existing foundation effect
        DB-->>Route: Committed acceptance or matching duplicate
    end
    Route->>After: Register transient jobs (catch registration failure)
    Route-->>LINE: HTTP 200 sanitized counters
    After->>After: Check local execution-age guard
    After->>DB: Begin one short coherent current-state snapshot
    After->>Domain: Current binding, canonical actor, persisted SELF; capture asOf; one narrow read
    Domain-->>After: Two fields / empty / refusal / infrastructure category
    After->>DB: Close transaction
    After->>After: Format; recheck local execution age
    After->>LINE: One eligible transient text Reply outside transaction
    Note over After,LINE: Best effort; no token persistence, retry queue or Push
```

Unlike menu reconciliation, an accepted reactive receipt cannot regenerate a lost token or repair Reply later. Crash after 200 may lose all transient work. This is within Q10, not a reliability guarantee. No new ADR: [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md) already establishes deterministic/stateless Reply, domain ownership/current authorization and separate Push; the chosen ordering refines its existing webhook boundary.

## 7. Finite event/intent contract

Define `LINE_PATIENT_NEXT_APPOINTMENT_MARKER = "DEMI_LINE_PATIENT_NEXT_APPOINTMENT_V1"` in a server-safe LINE domain constants module. Canonical intent has exactly one business value: `PATIENT_NEXT_APPOINTMENT`. Compare postback.data byte-for-byte after JSON string decoding; no trim/case-fold/prefix/query-string/JSON command parsing. Additional unrelated provider fields are tolerated and never grant authority. Postback params are ignored for this command.

Marker carries only intent/version. No role, Patient/User/Person/relationship/appointment/Hospital locator, HN/National ID, session/token or clinical data. A marker's authenticity does not establish eligibility.

| Event class | Durable handling | Transient business handling |
| --- | --- | --- |
| Valid user follow / unfollow | Existing foundation receipt/reachability behavior unchanged | None |
| Exact existing workspace marker, valid user source | Existing alias/SUCCESS/current eligibility/preference rules unchanged | None; existing reconciliation channel |
| Exact appointment marker, valid user source/common fields, active, nonempty token | New appointment receipt / matching duplicate | One job per event identity per inbound request |
| Same appointment class, standby or absent/empty token | New appointment receipt / matching duplicate | None; no authority/query/Reply |
| Appointment marker in group/room or missing valid user locator | Sanitized ignore; no new receipt | No Patient lookup or account-status response |
| Unknown/near-match postback; text/media/location/sticker/system event | Sanitized ignore; no new receipt | None; no help message |
| Malformed sibling | Ignore sibling; no new receipt | None; supported siblings continue |

Keep foundation envelope/event validation permissive for additive fields. Add an explicit typed common-field projection/validator at the new appointment classification seam for `mode` and `deliveryContext.isRedelivery`; do not make new fields mandatory or newly reject additive mode/deliveryContext values for existing foundation dispatch. The new appointment classifier requires mode `active` or `standby` and a deliveryContext with boolean isRedelivery; missing/unknown/wrongly typed values are malformed for the new class and ignored. Optional replyToken is accepted only as a string; absent/empty/whitespace-only token is ineligible. No token-format inference, authority inference or delayed compensation. Timestamp must satisfy existing nonnegative safe-integer validation and be a representable Date; nonsensical/unrepresentable values are malformed. Provider timestamp is transport metadata only: being later than DEMI receivedAt does not itself invalidate an event. No cross-clock ordering is an identity, authorization or token-validity test (§11/§18). Foundation events in standby retain their existing local effects/reconciliation behavior; they never acquire a reactive Reply path.

## 8. Rich Menu presentation contract

Future catalog action: `{ type: "postback", label: "ตรวจสอบนัดหมาย", intent: "PATIENT_NEXT_APPOINTMENT" }`. Adapter maps to `{ type: "postback", label, data: LINE_PATIENT_NEXT_APPOINTMENT_MARKER }`; omit displayText, deprecated text, inputOption and fillInText. No appointment URI or builder intent.

Only these four existing generated keys/assets change:

| Key | Existing asset under public/line/rich-menus/ |
| --- | --- |
| PATIENT_DIRECT | patient_direct.png |
| PATIENT_PATIENT_OSM | patient_patient_osm.png |
| PATIENT_PATIENT_HOSPITAL | patient_patient_hospital.png |
| PATIENT_PATIENT_OSM_HOSPITAL | patient_patient_osm_hospital.png |

Preserve workspace URI, bottom Manage Account and all workspace switches. Split the current Patient top workspace area into distinct non-overlapping workspace/appointment areas within the existing 2500×1686 canvas; exact visual coordinates/assets must pass future layout and visual review. All other 14 menus remain unchanged: UNLINKED, LINKED_INELIGIBLE, neutral CHOOSER, OSM and HOSPITAL variants never carry this command. Future provisioning uses existing manifest/image/alias reconciliation and read-back; do not auto-provision on startup or webhook. No real provider operation is authorized by this documentation task. Copied/stale actions reauthorize regardless of selected workspace; UI visibility is not a mitigation.

## 9. Durable receipt contract

Reuse LineWebhookEventReceipt, PK webhookEventId. For a newly classified appointment event, create one row with **eventType PATIENT_NEXT_APPOINTMENT**, provider eventOccurredAt and **outcome ACCEPTED**; acceptedAt remains the DB default. Commit before scheduling. ACCEPTED means supported event identity durably accepted, including standby/missing-token cases; it means neither authorization, appointment existence, query/Reply attempt/success nor visible delivery. No subsequent Reply outcome update.

Existing APPLIED/STALE/IGNORED and foundation effect transactions remain unchanged. Do not call an appointment RICHMENUSWITCH or APPLIED. No new business mutation/idempotency machinery is needed for a read. Receipt writes are transport persistence, not Appointment domain mutations or clinical audit.

On uniqueness conflict, verify prior row exists with the **same eventType and eventOccurredAt** before reporting matching duplicate. A verified conflicting type/time is sanitized-ignore for the incoming event (EVENT_ID_CONFLICT), no overwrite/job. A P2002 without confirmed prior row, or lookup/commit failure, is acceptance failure → 503. Preserve any earlier sibling commits; do not claim request-wide atomicity.

Receipt fields stay exactly provider ID/type/time/acceptance/outcome. No LINE subject/token, actor/resource IDs, appointment content, raw payload or provider body. Exact LineWebhookEventReceipt retention/purge duration is **NOT established by current repository evidence**. The 17J.1 contract webhook-receipt minimization rule describes a separately approved operational policy, but no exact duration, purge interval/job, archival behavior or table-size policy is demonstrated. This draft invents none. Reactive taps can create receipts more frequently than foundation events, making volume/storage and operational privacy more relevant. **OPEN production-readiness follow-up:** resolve retention/purge and storage policy before claiming long-term production readiness; not a blocker for bounded implementation/demo development after contract approval. No purge cron, TTL, archive or retention schema change is authorized without separate approval/evidence. Receipt existence proves DEMI saw this event ID, not its original binding lifecycle: no lifecycle witness is stored.

## 10. Transient work/result boundaries

Implementation types (specifications, not runtime code):

| Boundary | Fields / permitted consumers |
| --- | --- |
| Durable receipt result | ACCEPTED / DUPLICATE / IGNORED + safe event identity/class; foundation opaque bindingIds remain separate |
| `LineReactiveWorkItem` (server-only, memory) | intent PATIENT_NEXT_APPOINTMENT, webhookEventId, eventOccurredAt, request receivedAt plus process-local monotonic execution deadline, source lineUserId, replyToken, isRedelivery; mode is already narrowed to active |
| Webhook internal result | Existing counters/bindingIds + readonly reactiveWorkItems; route serializes only existing counters |
| Sanitized operational result | canonical intent, safe outcome/provider category, duration, permitted event/correlation ID, optional redelivery boolean; no payload/work item/authority witness |

Capture receivedAt and a process-local monotonic timing witness at request entry, before body reading; only the latter drives elapsed-time guards (§18). Jobs contain signed transport facts and local scheduling metadata only, not actor, binding, roles, Patient or cached data. LINE subject/token are sensitive locators. Do not serialize jobs to DB/audit/analytics, log them, pass to client modules or expose in HTTP responses. Never overload bindingIds with token-bearing work. New dedicated `scheduleLineReactiveWork` registers after(); inject scheduling/execution/clock dependencies for focused tests. No cookies/session are required inside callback.

## 11. Current binding authority and identity-lifecycle limits

Inside the single callback transaction (§14), resolve exact signed source `lineUserId` against `LineAccountBinding` with `unlinkedAt IS NULL`. Zero rows or more than one (invariant conflict) gives generic refusal, no Appointment read; never choose an arbitrary winner. Current binding owner User is the only identity input to canonical auth resolution. Fingerprint/history, retained cleanup locator, reachability, menu state and presentationRole never authorize Patient access.

Source evidence: initial linkedAt/lastLinkedAt use database defaults; relink writes an application timestamp and increments lifecycleVersion; ALREADY_LINKED preserves them; unlink sets unlinkedAt and increments version. These do not establish one universal clock shared with LINE. eventOccurredAt, lastLinkedAt and lifecycleVersion are not independent Patient authority. No provider/application timestamp comparison proves exact causal lifecycle membership. This first slice needs no lifecycle witness or timestamp fence; version may be an internal change witness in another bounded execution design, never cross-clock causal proof.

A stale/copied static postback asks only for the currently authorized own next appointment. An old redelivery after unlink has no ACTIVE binding and discloses no Patient data; after same-user relink it may perform a fresh CURRENT read when current actor/SELF authority permits. Binding changes before callback are resolved from current snapshot state, never receipt-time/history state. No cached old result is replayed.

Current account-service retained identity evidence fails closed against conflicting cross-user rebind. Cross-account subject transfer is not an approved feature. Exact identity-history erasure/future cross-account reconciliation remains an external gate: if it later permits a LINE subject to move to another User, static-postback/stale-redelivery semantics MUST be explicitly re-audited rather than inherited. A prior receipt proves event identity was seen, not which binding lifecycle originally received it.

## 12. Current actor-resolution dependency

Add auth-owned server-only `resolveActorAccessByUserId(userId, store/dependencies)` alongside existing authSubject resolver. Access variants: AUTHORIZED with canonical ActorContext, UNMAPPED, ACCOUNT_NOT_ACTIVE. Blank/invalid internal ID fails closed; database failure is InfrastructureError, not UNMAPPED. Lookup by current DEMI User PK, not authSubject, Supabase session or LINE profile.

Share the canonical User select/record mapping and ACTIVE-to-ActorContext mapping with the browser resolver: current Person ID, all persisted roles, current Hospital memberships (type/profession/status/Hospital status), OSM relationships (status/Hospital status). Preserve current authSubject trim/access/error behavior and browser tests. Support database/TransactionClient injection for the single coherent callback transaction; no React/request cache for LINE authority. LINE must not construct ActorContext, omit membership data as an optimization, or reuse the presentation eligibility service's limited actor. No Supabase session/credential is created and no Supabase provider call is needed for this new resolver.

## 13. Patient SELF upcoming query ownership

Add `getOwnNextAppointment(actor, captureAsOf, dependencies)` in existing `patient-self-care-query-service.ts`, with a narrow SELF identity helper in `patient-self-query-service.ts` sharing ownPatientWhere semantics. No LINE imports in these modules. Result: INELIGIBLE, or AUTHORIZED with `appointment: { scheduledAt: Date; hospitalName: string } | null`. Null means authorized empty; INELIGIBLE includes missing PatientProfile/no own relationships. Exceptions remain sanitized application infrastructure errors.

Algorithm within a short read transaction (or caller's TransactionClient):

1. Assert SELF policy with APPOINTMENT_READ_CAPABILITY. Non-PATIENT/missing actor fails closed. `captureAsOf` is an injected server clock function, never provider input.
2. Narrow existence check of Person matching exact actor.personId → persisted User matching actor.userId, ACTIVE, persisted PATIENT → that Person's PatientProfile → at least one own Hospital relationship. Select only minimal existence booleans/opaque internal witness, not names/HN/navigation DTO. Share the ownership predicate instead of copying it into LINE. Missing identity/profile/relationships is INELIGIBLE, never empty.
3. After successful persisted eligibility, invoke captureAsOf exactly once and validate the finite Date. One patientAppointment findFirst, not one call per Hospital: status SCHEDULED, scheduledAt >= asOf; relationship.patientProfile.person matches the same canonical ownership predicate. No Hospital ACTIVE filter, assignment requirement, Family grant or 90-day window. Order scheduledAt ASC then id ASC; one result. IDs can be ORDER BY operands without SELECT/return.
4. Select only scheduledAt and relationship.hospital.name; return exactly scheduledAt/hospitalName. Never select whole DTO/type/status label/location/staff/OSM/acknowledgement/cancel requests/clinical notes. Internal query predicates can reference IDs/status without exposing them.

Use current SELF read semantics across all own relationships, including suspended/pending Hospitals; no extra relationship-active predicate exists in this model. CANCELLED/COMPLETED/NO_SHOW excluded by canonical status. Pending/rejected/superseded cancellation requests and acknowledgement do not affect eligibility. Started before asOf is excluded even if duration is still running. asOf is captured once inside the coherent callback transaction after current identity/SELF eligibility checks and immediately before appointment selection; it is not webhook timestamp/start-of-today. Redelivery/new tap captures its own new asOf. Hospital name is authoritative current display name, not menu/webhook text.

Short query transaction uses RepeatableRead for identity-existence and appointment selection to share a snapshot; when a TransactionClient is provided, reuse caller's snapshot, no nested transaction. Bound standalone/callback transaction maxWait to 2 seconds and execution timeout to 5 seconds; timeout is infrastructure failure, not an authorization/empty result. No transaction retry loop in transient work. These are local limits, not LINE timing guarantees. No long transaction/lock spans provider I/O.

## 14. One coherent last-moment authorized read and TOCTOU

No receipt-time actor/binding/Patient projection is trusted. Each transient execution checks local Reply context (§18), then starts **ONE short RepeatableRead transaction**, as late as practical before sending. Within the same injected TransactionClient/snapshot:

1. Resolve exact CURRENT ACTIVE binding by signed LINE subject; zero/conflicting bindings → INELIGIBLE.
2. Resolve current canonical User/ActorContext using auth-owned User-ID resolver; inactive/unmapped → INELIGIBLE.
3. Run persisted Patient SELF policy/ownership/profile/own-relationship eligibility through the domain-owned helper (§13).
4. Capture one server asOf, then execute exactly one narrow upcoming Appointment query with §13 selection. Do not duplicate eligibility logic in LINE; the domain seam accepts the injected captureAsOf function (§13) so capture occurs exactly once after eligibility within this snapshot.
5. Return only INELIGIBLE, AUTHORIZED_EMPTY or APPOINTMENT_SUMMARY `{ scheduledAt, hospitalName }`; infrastructure failure throws a sanitized category. No binding/actor/IDs escape into presentation.

Close transaction, map approved Thai text, recheck only LOCAL transient execution-age eligibility, then immediately make one Reply call. No second Appointment query, second full actor resolution, initial sensitive projection or final re-read/witness comparison. No transaction retry loop, menu repair, intentional wait or provider I/O inside the snapshot. Existing §13 helper reuses caller TransactionClient, never opens a nested transaction; maxWait 2 seconds/timeout 5 seconds apply to the one callback transaction.

Revocation/unlink/cancellation/Hospital rename committed before the snapshot is reflected in its current state. Ineligible → generic refusal; transaction/auth/query failure → infrastructure copy, never authorized-empty. A snapshot is coherent current database state, not a historical asOf database snapshot, appointment reservation or attendance confirmation.

Authority/facts may change after this transaction commits and before/during LINE Reply. RepeatableRead does not make DEMI and provider delivery atomic. This residual TOCTOU race is explicitly retained: evaluate authority once coherently as late as practical, close DB work and send immediately, with no durable sensitive payload, delayed retry or Push. No added locks or redundant second read create an atomic-disclosure claim; a long cross-network DB transaction is forbidden.

## 15. Narrow server-safe presentation and copy

Add server-safe LINE text mapper accepting only the two-field projection or safe outcome category. Do not import app/UI presentation modules. Current UI formatters are route-local; use a small dedicated formatter rather than extracting/changing unrelated UI. Intl formatToParts with `th-TH-u-ca-buddhist-nu-latn`, timezone Asia/Bangkok: numeric day, long Thai month, Buddhist year; separate hour/minute using h23 and two digits. Assemble exact pattern:

```text
นัดหมายถัดไปของคุณ
วันที่ {day} {month} {year} เวลา {HH}:{mm} น.
โรงพยาบาล {hospitalName}
```

Example for `2026-10-15T02:00:00Z`:

```text
นัดหมายถัดไปของคุณ
วันที่ 15 ตุลาคม 2569 เวลา 09:00 น.
โรงพยาบาล ...
```

| Outcome | Exact first-slice text |
| --- | --- |
| Authorized successful empty | ไม่พบนัดหมายที่กำลังจะมาถึง |
| Generic currently ineligible/revoked | ยังไม่สามารถตรวจสอบนัดหมายผ่าน LINE ได้ กรุณาเปิด “จัดการบัญชี DEMI” จากเมนู |
| Infrastructure/transaction/query failure | ขณะนี้ยังตรวจสอบนัดหมายไม่ได้ กรุณาลองใหม่ภายหลัง |
| Ignored/standby/missing or late token | No Reply |

No status line, CTA, appointment link, IDs or other fields. Do not imply acknowledgement/attendance. Hospital display name is a single rendered line: trim, collapse whitespace/line separators, remove control characters; do not add other data or parse it as markup. Empty/unrenderable name or invalid Date fails presentation → infrastructure copy, not invented Hospital text. Database Hospital.name is bounded varchar(200); do not truncate arbitrary Patient fields or stringify DTOs. Stored scheduledAt is unchanged; timezone/calendar are display only. Tests assert Bangkok day/year rollover and midnight h23, independent of host timezone.

## 16. Reply API adapter contract

Add `LineMessagingClient.replyText(replyToken, text): Promise<void>`. One POST to `https://api.line.me/v2/bot/message/reply`, existing server Messaging token Authorization, application/json, no-store. Body has replyToken and exactly `messages: [{ type: "text", text }]`; no recipient ID/to, extra message, Flex, quick reply, custom sender or generic message DSL. Text/token must be nonempty; inputs come only from validated transient context and allowlisted mapper.

Reuse existing request boundary/12-second abort timeout, no internal retry, no X-Line-Retry-Key and no Push. Non-2xx normalized using existing LineFailure: 400/401/403/404/other 4xx → LINE_PROVIDER_PERMANENT; 429/5xx/network/timeout → LINE_PROVIDER_TRANSIENT. Reply method must explicitly reject 404 (helper permits 404 for menu readback). Do not parse a raw 400 body to infer whether token was used versus expired; only safe permanent rejection category. Success → provider accepted, not delivery proof. Discard provider body/sent-message IDs/quote tokens; never log request/response/token/error object. One attempt per execution including refusal/error copy; failed data Reply is not followed by another error Reply using the same token.

## 17. Request acknowledgement and after() lifecycle

1. Capture receivedAt; read ≤1 MiB bytes; verify signature before parsing; fatal UTF-8/JSON/envelope and expected destination validation.
2. Classify each sibling; persist supported identity/effect per-event as today. No actor/business/provider work here.
3. After **all** supported siblings are durably accepted or matching duplicates and others ignored, return internal counters, bindingIds and eligible reactive jobs. Register existing reconciliation and separate reactive scheduler independently; a registration failure in either cannot suppress the other or change durable acceptance. Catch locally; log only safe SCHEDULING_UNAVAILABLE.
4. Return HTTP 200 no-store sanitized existing counters without awaiting callback/query/Reply. Empty/ignored-only requests also 200; duplicate reactive-only requests may schedule work unlike foundation-only duplicates.
5. after callback runs finite bounded workers (§19), contains per-job exceptions and awaits its workers so hosting can track completion. No fire-and-forget unawaited promises, detached timers or app-start work.

Invalid signature/destination/malformed envelope → existing 401; body overflow →413. Existing classified LineFailure request validation behavior remains 400 where applicable; database receipt/commit/duplicate-check failures must normalize as acceptance failure →503 even if an ORM error class could otherwise map differently. No raw errors in HTTP body. Request failure after earlier commits retains them; no reactive jobs from that unsuccessful request are registered. A possible LINE duplicate/redelivery may recover them; a Reply loss remains allowed best effort. Foundation durable repair remains independently possible.

Synchronous after registration failure **after committed acceptance still returns 200**. Authorization refusal/empty/query failure/Reply rejection/crash after 200 never rollback receipt or change HTTP/domain truth. Do not intentionally return non-2xx to manufacture Reply redelivery. LINE's 2-second expectation is an operational target; DB contention/large multi-event envelopes can still exceed it. Do not claim removing provider work proves every webhook finishes within 2 seconds. Preserve 1 MiB/no event-count cap; test latency separation and observe safe duration before deployment.

## 18. Duplicate/redelivery and Reply-context eligibility

Separate four layers: one durable event identity; no duplicate business mutation; fresh read execution; independent Reply attempt/provider-visible outcome. No durable attempt/used-token flag is inferred from receipt.

- First appointment acceptance schedules when context eligible.
- Matching duplicate in a **new inbound request**, whether isRedelivery true or network duplicate false, schedules one fresh authorized job when context eligible. Never replay cached appointment data or old authority/token storage. Foundation duplicates still suppress their durable effects and reconciliation channel as today.
- Same ID repeated inside one envelope yields one transient job: retain the first eligible occurrence, count subsequent duplicate occurrences, never multiple jobs for that ID in that request. Conflicting signed type/time is ignored as §9. No cross-request/process in-memory dedup cache, lock or new durable lease.
- Concurrent original/duplicate executions may both query and attempt the same inbound token. Provider single-use behavior prevents a second successful token consumption; DEMI does not prove which request won, whether delivery is visible, or exactly-once. Unknown/timeout result stays unknown; do not reset receipt or retry internally.
- A new user tap/new webhookEventId is a new fresh read/receipt and Reply context.

Local eligibility requires active mode, valid user/common fields and nonempty token, plus a conservative **DEMI-local execution-age guard**. Capture an in-memory monotonic request-entry time; carry that local deadline/elapsed-time witness in the transient work item and use the same process-local clock at callback start and immediately before send. No provider timestamp is an input. Future implementation must select and test a fixed safety margin below the documented one-minute window (no new configuration framework); late local work skips query/Reply, or discards its result if the guard elapses during DB work. This guard avoids obviously delayed work, does not prove token validity or extend provider lifetime. Never intentionally wait until expiry.

Original inbound and redelivery both use their fresh inbound local execution context. isRedelivery is classification only, not authority. LINE's 20-minute event-age condition belongs to redelivered-token semantics; DEMI does **not** enforce eventOccurredAt + 20 minutes locally or compare provider event time to DEMI receive/lifecycle clocks. Representable provider times ahead of local receivedAt or before lastLinkedAt are not automatically invalid. Reply API remains authoritative for unused/eligible/expired/rejected token state; permanent rejection terminates this attempt. Recheck official timing before implementation/deployment, not by inventing clock synchronization guarantees.

Provider-used/expired/invalid token, rate limit, server/network errors → sanitized transport category, no rollback/receipt reset/queue/Push. Redelivery can improve best effort only if provider sends a new inbound event context; it is not DEMI's durable Reply queue. No token is retrieved from historical persistence.

## 19. Multi-event processing and bounded concurrency

Keep existing sequential durable sibling transactions and isolation. Malformed/unsupported siblings do not poison valid siblings. Infrastructure failure stops request acceptance (503); prior commits remain and later siblings can be retried by provider. No request-wide transaction or Reply effects in receipt transaction.

Choose **four fixed workers per request**, each taking the next eligible job in envelope order and awaiting that job before taking another. Start up to min(4, job count); each catches/classifies job failures; await all workers. This preserves urgency better than fully sequential 12-second provider waits without Promise.allSettled over an unbounded event list or new queue infrastructure. This is a local technical concurrency choice, not a LINE event cap/channel-wide rate limit. Memory/job count remains bounded by existing body cap; each queued job rechecks deadline at start. Separate requests may overlap; no globally coordinated limiter is introduced. A provider failure for one job cannot terminate other workers/undo foundation receipts. Scheduling reactive work must not await menu reconciliation first.

## 20. Failure/outcome matrix

All rows: **Appointment/domain mutation = NO**. Foundation follow/unfollow/switch may retain their existing durable non-Appointment effects. HTTP refers to webhook acknowledgement, not Reply API status. `R` = one accepted appointment receipt (ACCEPTED) or its existing matching duplicate; `Q` = one coherent current binding/actor/persisted SELF snapshot and exactly one Appointment query when eligible; no second read. `A` = at most one provider attempt in that transient execution. All logging uses only category/allowlisted telemetry (§21).

| Case | Receipt | Domain query | Reply attempt / copy | HTTP | Recovery / log category | Sensitive disclosure |
| --- | --- | --- | --- | --- | --- | --- |
| Invalid/missing signature | None | No | No | 401 | No app retry; INVALID_SIGNATURE | No |
| Wrong destination | None | No | No | 401 | DESTINATION_REJECTED | No |
| Oversized body | None | No | No | 413 | BODY_TOO_LARGE | No |
| Malformed UTF-8/JSON/envelope | None | No | No | 401 | ENVELOPE_REJECTED | No |
| Malformed sibling/unrepresentable timestamp/invalid new common fields | None for sibling | No | No | 200 if others accepted | EVENT_MALFORMED; siblings continue | No |
| Unsupported text/media/system | None | No | No | 200 | UNSUPPORTED_IGNORED | No |
| Unknown/near-match postback | None | No | No | 200 | UNSUPPORTED_IGNORED | No |
| Group/room appointment marker | None | No | No | 200 | SOURCE_IGNORED | No, even generic account copy |
| Standby appointment event | R | No | No | 200 | STANDBY_IGNORED | No |
| Missing/empty token in recognized event | R | No | No | 200 | REPLY_CONTEXT_UNAVAILABLE | No |
| Local execution-age guard exceeded | R | No if detected before work | No | 200 | REPLY_CONTEXT_LATE | No |
| Durable receipt/DB acceptance failure | None for failing event; prior commits retained | No | No jobs registered for request | 503 | ACCEPTANCE_UNAVAILABLE; provider may redeliver, not guaranteed | No |
| No ACTIVE binding / invariant conflict | R | No | A generic refusal | 200 | INELIGIBLE | No |
| Binding changes before callback transaction | R | Current Q if currently eligible | A current result or generic refusal | 200 | Current outcome; resolve current state | Current snapshot only |
| Old event after same-user relink / provider time ahead of receivedAt | R | Current Q if eligible | A current result if local context eligible | 200 | Current outcome; no cross-clock suppression | Approved current own projection only |
| Future cross-user subject transfer | No new behavior approved | Outside scope | Requires identity/reactive re-audit | Not defined by this tranche | External identity/reconciliation gate | No transfer authority invented |
| User inactive / PATIENT removed | R | No Appointment read | A generic refusal | 200 | INELIGIBLE | No |
| Missing/mismatched PatientProfile / no own relationships | R | SELF eligibility only | A generic refusal | 200 | INELIGIBLE | No |
| Authorized successful empty | R | Q | A exact empty | 200 | AUTHORIZED_EMPTY | Empty fact only after coherent authorized snapshot |
| Appointment found | R | Q | A approved 3-line text | 200 | APPOINTMENT_SUMMARY | Exactly date/time + Hospital |
| Binding/actor infrastructure failure | R | No/partial checks | A infrastructure copy | 200 | LOOKUP_UNAVAILABLE | No |
| Patient query infrastructure failure | R | Attempt failed | A infrastructure copy | 200 | QUERY_UNAVAILABLE | No |
| Unlink/role/profile/relationship revocation before snapshot | R | No Appointment read when denied | A generic refusal | 200 | INELIGIBLE | No |
| Transaction infrastructure failure | R | No/failed single Q | A infrastructure copy | 200 | LOOKUP_UNAVAILABLE | No |
| Unlink/revoke after commit before/during provider request | R | One completed current Q | A may disclose committed snapshot | 200 | Ordinary sanitized outcome; no race detection claim | Residual TOCTOU; not atomically preventable |
| Presentation invalid date/name | R | Q | A infrastructure copy | 200 | PRESENTATION_UNAVAILABLE | No |
| Local execution-age guard elapses while queued/querying | R | No or Q already ran | No | 200 | REPLY_CONTEXT_LATE | No |
| Reply 2xx | R unchanged | Prior Q/outcome | A already made | 200 | PROVIDER_ACCEPTED; not visible-delivery proof | Only approved coherent-snapshot payload |
| Reply 400 invalid/used/expired token | R unchanged | Prior Q/outcome | A failed, no second copy | 200 | LINE_PROVIDER_PERMANENT; precise use state unknown | No extra payload |
| Reply 401/403/404/other 4xx | R unchanged | Prior Q/outcome | A failed | 200 | LINE_PROVIDER_PERMANENT | No extra payload |
| Reply 429 | R unchanged | Prior Q/outcome | A failed | 200 | LINE_PROVIDER_TRANSIENT; no internal retry | No extra payload |
| Reply 5xx | R unchanged | Prior Q/outcome | A unknown/failure | 200 | LINE_PROVIDER_TRANSIENT; delivery may be ambiguous | No extra payload |
| Reply network/12s timeout | R unchanged | Prior Q/outcome | A unknown | 200 | LINE_PROVIDER_TRANSIENT; no retry/Push | No extra payload |
| after registration throws | R committed | No | No | 200 | SCHEDULING_UNAVAILABLE; new tap/provider event only | No |
| Process crash after 200 / callback platform limit | R committed | None/partial/completed | None/unknown | 200 already emitted | May lose reply; no crash recovery claim/log guarantee | No new permission; in-flight ambiguity remains |
| Matching duplicate event in new request | Existing R | Fresh Q if context/authority valid | A if eligible | 200 | DUPLICATE + sanitized current outcome | Fresh coherent current authorization only |
| Same ID repeated in one envelope | Existing R | One job at most | A per selected job | 200 | DUPLICATE; collapse locally | Same snapshot rule |
| Same ID with conflicting type/time | Existing unchanged | No for conflict | No for conflict | 200 | EVENT_ID_CONFLICT | No |
| Redelivery before original Reply | Existing R | Fresh Q if eligible | A may race original | 200 | REDELIVERY + current outcome; no cache | Same snapshot rule |
| Redelivery after token consumed | Existing R | Fresh Q may run | A may get permanent rejection | 200 | Safe provider category; receipt does not reveal consumption | No second success promised |
| Concurrent duplicate/redelivery | One R via DB PK | Independent fresh Q | One A per execution; provider single-use arbitration | 200 after each acceptance | DUPLICATE/REDELIVERY; no attempt-state table | Each coherent snapshot independently |
| New tap/new event ID | New R | Fresh current Q/asOf | A if eligible | 200 | Current outcome | Exactly approved projection |

For every R-based row, token ineligibility replaces A with no attempt. All transport failure rows: no durable retry, receipt rollback, cached response replay or Push; provider redelivery remains optional external behavior, user can safely tap again. Sensitive payload submitted in an ambiguous network result may already have reached LINE; failure category never establishes non-delivery.

## 21. Telemetry/privacy contract

Allow only opaque random correlation ID, permitted webhookEventId subject to the unresolved operational retention gate (§9), canonical intent, sanitized event/outcome/provider category, duration/latency and optional isRedelivery boolean. Durations may cover acceptance/queue/read/provider latency, without absolute appointment times or identifying metadata. Do not stringify exceptions, jobs, query results or provider requests/responses. Sanitize at the emitter boundary, including scheduler catch paths.

Never log raw LINE subject/body/text/postback/token/access/channel/profile data; Patient/User/Person/relationship/appointment IDs; Hospital name or relationship/content; HN/National ID/name/phone/address; appointment date/time, diagnosis/medication/clinical data. No ordinary successful clinical-read AuditEvent, no provider-attempt/delivery persistence, no receipt as clinical audit. Existing security/link/unlink lifecycle audits remain unchanged. Receipt permitted provider event timestamp is transport metadata, not appointment content.

## 22. Exact future schema/migration delta

**Required after contract approval:** additive enum values only:

- `LineWebhookEventType`: add **PATIENT_NEXT_APPOINTMENT**.
- `LineWebhookEventOutcome`: add **ACCEPTED** (supported durable acceptance only, §9).

No table/column/index change, no Reply/session/notification/attempt table, token/content storage or event schema backfill. Existing enum values/rows/defaults stay intact. Future migration must add values in PostgreSQL without relabeling old rows; generate client and verify fresh database plus populated migration-history upgrade before using new values. No Prisma file/migration is edited in this task. This design identifies required future additive migration; it does not execute or approve deployment of one.

## 23. Expected future implementation surfaces

| Surface | Bounded delta |
| --- | --- |
| src/modules/line/domain/line-reactive-types.ts (new) | One static marker/intent, transient types and sanitized outcome types |
| src/modules/line/schemas/line-schemas.ts | Typed common mode/redelivery fields + strict new-command classifier requirements |
| src/modules/line/services/line-webhook-service.ts | Exact classifier, truthful receipt type/outcome, matching duplicate checks, separate transient job result |
| app/api/line/webhook/route.ts | Register independent reactive after seam; keep public counters; no awaited business/provider work |
| src/modules/line/transport/line-reactive-scheduler.ts (new) | after registration, four workers, safe failures/deadlines; no repair state |
| src/modules/line/services/line-reactive-appointment-service.ts (new) | Current binding/auth/domain orchestration in one late coherent transaction, one Appointment query, local deadline recheck and one Reply |
| src/modules/auth/services/actor-context-service.ts | Shared canonical projection/mapping and injected current User-ID resolver; browser behavior preserved |
| src/modules/patient-self/services/patient-self-query-service.ts | Reusable narrow exact SELF identity/existence helper; no HN/name projection |
| src/modules/patient-self/services/patient-self-care-query-service.ts | Narrow next appointment query/result with current ownership/asOf/status/order |
| src/modules/line/presentation/line-appointment-reply.ts (new) | Server-safe two-field Thai text and safe copy only |
| src/modules/line/adapters/line-messaging-client.ts | Narrow replyText, existing error categories/timeout, postback provider action |
| src/modules/line/rich-menu/catalog.ts and layout.ts | Four Patient presentation actions/non-overlapping hit areas; all other menus preserved |
| public/line/rich-menus/ + existing asset-generation/provisioning surfaces | Four affected assets; use existing operator reconcile/readback, no appointment URI |
| prisma/schema.prisma + one future additive migration | Two enum additions (§22), no new models |
| Adjacent unit tests, tests/integration/line-account-linking.integration.test.ts or focused reactive integration file, existing migration verification tooling | Tests §24, real PostgreSQL uniqueness/snapshots/races and enum upgrade evidence |

No changes to deep-link builder, appointment mutation services, Supabase sessions, reconciliation lease/cleanup persistence or unrelated menus. New orchestration/types are narrow modules, not a command bus/queue/message DSL. Existing provisioning code should already detect changed payload/image; modify it only if focused evidence proves missing detection.

## 24. Future verification contract

These are implementation obligations, **NOT checks run in this documentation task**.

| Area | Required focused assertions |
| --- | --- |
| Classification | Exact marker accepted; whitespace/case/prefix/suffix near-match ignored; text/media/unknown postback ignored/no help; user only; group/room never invokes binding/Patient query; typed active/standby/missing/wrong mode/redelivery/token cases; existing workspace SUCCESS/alias rules unchanged; structurally invalid/unrepresentable timestamps isolated; representable timestamps ahead of DEMI receivedAt not rejected solely for clock order. |
| Receipt / migration | First acceptance once; concurrent duplicates one row; PATIENT_NEXT_APPOINTMENT/ACCEPTED truthful; mismatched prior type/time ignored; no token/subject/content/provider result stored; foundation effects not replayed; fresh and populated PostgreSQL migration paths preserve existing rows/constraints. |
| Actor authority | Shared User-ID/authSubject mapping parity for roles/memberships/OSM/Hospital statuses; inactive/unmapped/errors distinct internally; no Supabase call; no actor fabrication; existing browser tests preserved. |
| Binding lifecycle | No binding/unlinked/conflict denies; no historical/cleanup fallback; presentationRole/reachability never authorize; current same-user relink permits current authorized read; changes before callback resolve current state. Provider timestamps before/equal lastLinkedAt or ahead of receivedAt do not themselves deny. Retained evidence cross-user conflict remains fail-closed; future transfer requires re-audit. |
| SELF authorization | Persisted ACTIVE/PATIENT/exact User-Person/Profile ownership, no own relationships ineligible; fake/stale actor fails persisted predicate; multi-role Patient allowed regardless presentationRole; operator/Family/ADMIN-only denied. |
| Upcoming selection | Nearest future SCHEDULED; scheduledAt == asOf included; past even ongoing-duration excluded; canonical terminal statuses excluded; pending/rejected/superseded cancellation/acknowledgement do not filter; multiple own Hospitals incl suspended/pending; scheduledAt/id tie; zero authorized result; one narrow query, no DTO/history pagination. |
| One coherent read / races | Exactly one Appointment business query and one full actor resolution per eligible transient execution; binding/actor/persisted SELF/query share one snapshot. Revocation before snapshot denies; cancellation/Hospital rename before snapshot reflected; DB fail → infrastructure. No provider call while transaction active; no second read; post-commit/pre-provider race is documented, never tested as impossible. |
| Local timing / retention | Local elapsed deadline skips delayed query/Reply; redelivery not rejected by cross-clock 20-minute arithmetic; provider rejection authoritative/no retry/Push. No cleanup behavior invented; minimized receipt only; unresolved retention/purge remains production follow-up, not owner-product reopening. |
| Presentation / privacy | Exact success/empty/refusal/error; Buddhist year/Thai month/Latin digits/h23 Bangkok midnight/day/year conversion independent of host timezone; only two data fields, no status/IDs/location/staff/HN/name/clinical/link; newline/control-safe Hospital display; raw DTO rejected by boundary; telemetry captures only allowlist. |
| Adapter | Exact one-text body/token/channel Authorization/POST/no-store; no retry key/Push/custom sender; 404 explicitly rejected; 400/429/5xx/network/timeouts safe; one attempt even ambiguous result; no body/token logging or persisted outcomes; failed data Reply never triggers error Reply reuse. |
| after / route | Callback remains unexecuted while route returns 200 after durable acceptance; deferred query/provider promises unresolved do not block response; registration throws still 200; separate menu/reactive registration independence; DB acceptance fail →503; no jobs scheduled on partial failure; counters contain no sensitive internal fields. |
| Multi-event / redelivery | Malformed/unsupported +follow/switch/appointment siblings isolated; same-envelope ID one job; matching duplicate/new-request fresh read incl isRedelivery false; concurrent reads safe/provider-used-token rejection; redelivery after original success no second success claim; four active workers maximum, failed worker continues, no event-count cap, queued/expired-token work skipped; no menu repair before Reply. |

Follow AGENTS proportional strategy: explicit focused Vitest paths during iteration; lint/typecheck when TypeScript changes (package has `npm run lint` and `npm run typecheck`; do not invent absent lint:strict/architecture scripts); relevant PostgreSQL integration and fresh/populated migration evidence when stable. Full suite once near final regression verification if justified, not after every edit. Build only if phase closeout/Next.js hosting boundary actually requires it; real after-host support/provisioning/UAT stays separately gated. Route mock timing tests prove await separation, not real LINE latency or live deployment reliability.

## 25. Security and race review

| Threat | Authoritative mitigation / residual limit |
| --- | --- |
| Forged webhook/postback | Raw signature + expected destination before parse; exact marker still requires current binding/SELF. Marker secrecy is not security. |
| Group/room disclosure | Source classifier blocks before binding/Patient lookup/Reply, even if userId exists. |
| Copied/stale menu | Presentation ignored; current authority per execution; valid stale action may read current own data, never expand scope. |
| Old redelivery after unlink / same-user relink | Unlinked → no ACTIVE binding/no Patient disclosure; same-user relink → fresh current authorized own read allowed. No timestamp lifecycle authority/history fallback. |
| Future cross-user subject transfer | Current retained-evidence conflict guards fail closed; erasure/transfer requires explicit identity/static-postback/redelivery re-audit. Receipt has no original lifecycle witness. |
| Unlink/role revocation during async work | One late coherent current binding/actor/persisted SELF snapshot denies prior revocation; send immediately after close. Post-commit authority change can race provider delivery; no atomic claim, second read, queued payload or cross-network transaction. |
| Stale actor | Fresh auth-owned User-ID projection and persisted SELF predicate; no cache/presentation actor shortcut. |
| Duplicate/concurrent events | One receipt PK; fresh read safe; no mutation/cached replay; provider single-use token arbitration, no delivery guarantee. |
| Replay after consumed token | One provider attempt, safe permanent rejection, no token retry/Push/receipt reset. |
| Arbitrary text masquerading as command | Ignore without parser/help/NLU, including exact Thai menu-label text. |
| Patient/resource ID injection | Static marker only; no payload authority/locators; ownPatientWhere in domain selects exact persisted scope. |
| Log/work item leakage | Separate transient/private and public/sanitized types; emitter allowlist; no raw exceptions/requests/results. |
| Whole DTO leakage | Domain SELECT and mapper allowlist exactly scheduledAt/hospitalName, no spread/serialization of existing DTO. |
| Browser-session assumption | User-ID resolver creates no browser session; reply contains no appointment link. |
| Push fallback escalation | Adapter/service lacks Push path; every token/provider failure terminates attempt. |
| Provider outage/429 | Best effort one bounded call; isolated workers, no long DB lock/transaction or outage-induced domain mutation. |
| Process crash after 2xx | Receipt retained, transient job may be lost; owner-approved best effort, new tap allowed, no durable recovery claim. |
| Multi-event overload / slow DB | Existing body cap, sequential short acceptance transactions, four async workers/deadline checks; no invented event cap. Per-request concurrency is not a global abuse limiter; observe latency and preserve future operational gates. |

No mitigation depends on Rich Menu visibility, role label, reachability, alias or client authority. Required security tests are in §24; this source/design review is not a live security scan or runtime verification.

## 26. Explicit non-goals

No runtime TypeScript/schema/migration/assets/provider changes in 17J.2B drafting. No Push/reminders/notification preference/consent/quiet-hour/retry queue/attempt subsystem; medication/MED-02/adherence/Follow-up reminders; Family/caregiver expansion; OSM/Hospital/ADMIN Patient commands; typed aliases/parser/fuzzy/NLU/LLM/chatbot; session/pending question/wizard/state machine; National ID/HN/OTP chat lookup; appointment acknowledge/request-cancel/cancel/reschedule/create/complete/no-show/coordination; appointment list/detail link; complex LIFF 17J.3; resource provisioning/provider call/deployment/mobile/device UAT. No generic command bus, event-sourcing, arbitrary message DSL or new dependencies.

## 27. Unchanged open/external gates

P17D-NOTIF-01 and proactive event/time/recipient/content/privacy/preferences/consent/quiet hours/retry/Push remain OPEN. MED-02, medication delivery/adherence, Follow-up prospective reminder source, Family LINE access, P17F-L04/L05, Q5 real-data governance, Phase 17E.2 consent, exact identity-history retention/erasure and future cross-account reconciliation retain their existing status. Exact LineWebhookEventReceipt retention/purge/storage policy is unresolved (§9), non-blocking for bounded implementation/demo after review but a production-readiness/operational-privacy follow-up before long-term retention/storage readiness claims. No cleanup implementation is approved. Real LINE provider setup/provisioning, mobile/device UAT, production deployment, 17J.3 and 17J.4 implementation are not executed/approved by this contract. Preserve 17J.0/0B/1 closure/evidence; sequence remains 17J.2 →17J.3 →17J.4 →17J.5A integrated audit →17J.5B real-device UAT.

## 28. Review gate / implementation GO–NO-GO

**GO: review this technical draft. NO-GO: runtime implementation until contract review is explicitly accepted.** Locked owner product/privacy decisions remain closed. Review must confirm exact marker/classifier, ACCEPTED receipt meaning/two enum additions, post-response/partial-failure ordering, duplicate fresh-read policy/four workers, current-state binding authority/future transfer re-audit, shared actor mapping, one coherent late snapshot/read and residual external race, local-only scheduling guard and unresolved production receipt-retention follow-up, formatter/adapter/privacy/test boundaries. No product-owner choice of low-level retry/database algorithm is required; technical review judges this selected design.

Final state: **17J.2A CLOSED / OWNER DECISION COMPLETE; 17J.2B TECHNICAL CONTRACT DRAFT COMPLETE / REVIEW REQUIRED; 17J.2 runtime NOT IMPLEMENTED**. Exact next step: **Review corrected Phase 17J.2B technical contract.** Stop at documentation/validation; runtime implementation remains blocked on contract review.
