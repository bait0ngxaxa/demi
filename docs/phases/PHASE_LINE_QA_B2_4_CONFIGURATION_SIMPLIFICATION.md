# Phase LINE-QA.B2.4 — LINE Configuration Simplification and Build Gate Cleanup

**Status:** Implemented and verified locally with synthetic data and disposable PostgreSQL. No real LINE Provider call, LINE Console change, Rich Menu change, production migration, environment change or deployment was made.

## 1. Starting HEAD

`961bc1bfe3d3a3710fa5b855d0764c5fbe51bd75` (`fix(line): address B2.3 workflow findings`).

## 2. Environment variables: before and after

| Variable | Before | After |
| --- | --- | --- |
| `DEMI_LINE_LOGIN_CHANNEL_ID`, `NEXT_PUBLIC_DEMI_LINE_LIFF_ID`, `DEMI_LINE_PUBLIC_ORIGIN` | Required for Account LIFF | Unchanged |
| `DEMI_LINE_LOGIN_CHANNEL_SECRET` | Account remote deauthorization | Unchanged |
| `DEMI_LINE_MESSAGING_*` | Messaging API | Unchanged |
| `DEMI_LINE_DISCONNECTION_ENABLED` | Activation flag | **Removed** — Full Disconnection is permanent policy |
| `DEMI_LINE_DISCONNECTION_MANIFEST` | Hand-written JSON inventory + evidence | **Removed** — inventory derived on the server |
| `DEMI_LINE_PROVIDER_TOKEN_VERIFY_QUERY_ENABLED` | Privacy switch for LINE token verify | **Removed** — see section 9 |
| `DEMI_LINE_MINI_APP_WORKFLOW_ENABLED` | MINI gateway flag | **Removed** |
| `DEMI_LINE_MINI_APP_ISSUANCE_ENABLED` | MINI issuance flag | **Removed** |
| `DEMI_LINE_MINI_APP_ENDPOINT_URL` | Had to equal origin + `/line/workflow` | **Removed** — derived |
| `DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE` | Operator reference string | **Removed** |
| `DEMI_LINE_MINI_APP_ENVIRONMENT`, `_CHANNEL_ID`, `_LIFF_ID` | MINI channel identity | Unchanged |
| `DEMI_LINE_MINI_APP_CHANNEL_SECRET` | MINI remote deauthorization | Unchanged |
| `DEMI_LINE_MINI_APP_CONTEXT_KEYRING` | Workflow context keys | Unchanged |
| `DEMI_LINE_MINI_APP_DISABLED` | — | **New** optional emergency kill switch |

Removed variables are not read anywhere; leftover values in an old `.env` are ignored.

## 3. Required / optional rules

- **Account LIFF (required for any LINE feature):** `DEMI_LINE_LOGIN_CHANNEL_ID`, `NEXT_PUBLIC_DEMI_LINE_LIFF_ID`, `DEMI_LINE_PUBLIC_ORIGIN`, `IDENTITY_HASH_SECRET`. `DEMI_LINE_LOGIN_CHANNEL_SECRET` is needed only to *confirm* remote Account deauthorization; without it local Unlink succeeds and the LINE-side result stays unconfirmed.
- **MINI (optional, all-or-nothing):** when every `DEMI_LINE_MINI_APP_*` value except the kill switch is empty, MINI is *not provisioned* (Account-only). If any of them is set, `ENVIRONMENT` (`DEVELOPING`/`REVIEW`/`PUBLISHED`), `CHANNEL_ID` and `LIFF_ID` must all be valid, the origin must be canonical HTTPS, and the MINI Channel ID/LIFF ID must differ from the Account ones. Otherwise the configuration is invalid and fails closed.
- `DEMI_LINE_MINI_APP_CONTEXT_KEYRING` is required to issue or open a workflow context (missing → `MINI_CONFIGURATION_UNAVAILABLE`). It is a DEMI-generated keyring, never a LINE secret (separate AES-256-GCM encryption and session-HMAC keys).
- `DEMI_LINE_MINI_APP_CHANNEL_SECRET` is required only for remote MINI deauthorization; missing does not block MINI reads or Account features.
- No value is exposed through `NEXT_PUBLIC_*` except the existing Account LIFF ID; MINI LIFF ID reaches the browser only through the gateway page props when MINI is available.

**Production vs local:** production must use HTTPS for `DEMI_LINE_PUBLIC_ORIGIN`. Local development may use `http://localhost` for Account LIFF only; MINI always requires HTTPS, so local development is normally Account-only (leave MINI values empty).

## 4. Kill switch

`DEMI_LINE_MINI_APP_DISABLED`:

- unset, empty or `false` → MINI is available when its configuration is valid;
- any other value (`true`, `TRUE`, `1`, …) → `WORKFLOW_DISABLED` for the gateway page, Verify/issuance and every scoped read and mutation, evaluated before Origin, body, Provider or database work.

The switch never removes the MINI channel from the lifecycle inventory and does not block remote MINI deauthorization: disabling access is not proof that a grant was removed. There is no fallback to another channel or environment.

## 5. Channel configuration derivation

`resolveLineMiniAppChannel()` (`src/modules/line/services/line-mini-app-configuration.ts`) parses MINI identity only; `getLineMiniAppConfiguration()` is the single availability policy (kill switch, then a complete valid channel) used by `app/line/workflow/page.tsx`, `handleLineWorkflowVerifyRequest`, `handleLineWorkflowInteractionRequest` and `openLineWorkflowScope` (scoped reads and mutations). The endpoint URL is derived as `DEMI_LINE_PUBLIC_ORIGIN + /line/workflow`.

`getLineChannelInventory()` (`line-disconnection-configuration.ts`) derives `{ channels: [Account, MINI?] }` from `DEMI_LINE_LOGIN_CHANNEL_ID` and the resolved MINI channel. The domain schema requires exactly one Account channel, at most one MINI channel and distinct Channel IDs. `requireLineDisconnectionReadiness()` adds the actual migration check (`_prisma_migrations` row for `20261008120000_line_authorization_lifecycle`). Missing Account configuration, partial MINI configuration or a missing migration → `LINE_CONFIGURATION_MISSING`.

Responsibilities: raw env parsing (`line-mini-app-configuration.ts`, `@/lib/env/server`), trusted channel inventory (`line-disconnection-configuration.ts`), channel credentials (`getLineMiniAppDeauthorizationCredentials`, Account secret read only inside the deauthorization adapter), persisted lifecycle authority (`line-authorization-lifecycle-service.ts`), workflow authorization (`line-workflow-service.ts`). No circular import was introduced.

## 6. Provider identity

No Provider identity is configured. LINE user IDs are Provider-scoped, and the MINI workflow already requires the MINI-audience ID token subject to equal the ACTIVE Account binding's `lineUserId` (and fingerprint) before any scope is issued; remote MINI deauthorization likewise requires the MINI access token's subject to equal the binding subject. A MINI channel placed under another Provider therefore fails closed (`LINE_NOT_LINKED` / `KNOWN_NOT_DISPATCHED`); this is covered by a PostgreSQL integration test. Actual Provider placement is verified by the owner in LINE Developers Console.

## 7. Historical lifecycle compatibility

- **Tuple identity.** New tuples use `["LINE_CHANNEL_V2", kind, channelId, environment, "server-config"]`. The five-string shape satisfies the existing database `LineAuthorizationLifecycle_tuple_check` unchanged, so **no migration was added**. Slots 0 and 4 are fixed format markers, not Provider or deployment identity.
- **Existing rows are never recomputed.** Rows written under the pre-B2.4 manifest tuple keep their `tupleKey`/`tupleDefinition`. `initializeLineTermination` already carries every historical tuple forward (OBSERVED stays OBSERVED, everything else UNKNOWN) at each new Unlink. Such rows cannot be dispatched (they are not in the current inventory), stay `REMOTE_UNCONFIRMED`, block Relink, and are released only through the existing bounded Recovery flow. Display names are derived from the persisted `tupleDefinition` kind for both formats.
- **Pending Recovery intents.** The reviewed-set digest now covers the derived inventory, so a Recovery intent prepared before B2.4 no longer matches and is rejected (`ForbiddenError`); the owner simply starts Recovery again (intents already expire after five minutes). This is the chosen safe-expiry transition.
- **Permanent Full Disconnection.** The former "staged" path (unrestricted Relink when the flag was off and no lifecycle history existed) is removed. Relink with an unavailable inventory throws `LINE_CONFIGURATION_MISSING`; a legacy revoked binding with no lifecycle rows for its current generation is blocked until Recovery lazily initializes and releases it. Local Unlink still always succeeds; when readiness is unavailable it records the existing `disconnectionReadiness: UNAVAILABLE` audit marker.
- **No exclusion evidence.** Configuration can no longer mark a MINI grant `PROVEN_ABSENT`. Account-only deployments simply have no MINI channel, so no new MINI obligation is created; historical MINI obligations remain visible and enforceable when MINI is later removed, disabled or rotated.
- Unchanged: ACTIVE binding semantics, lifecycle generation, attempt reservation/fencing, late-response isolation, settlement rules, Recovery release provenance, audit events. No lifecycle row is deleted or reset.

## 8. Removed flags, manifests and evidence

Removed from runtime: the JSON manifest (`inventory.revision`, `providerReference`, `deploymentReference`, `exclusionReference`, `miniExclusionReference`, `appNames`, `accountLiffId`, `migrationEvidence`, `recoveryUatEvidence`, `providerCredentialEvidence`, `exactSessionEvidence`), `isLineMiniAppWorkflowEnabled`, `isLineMiniAppWorkflowIssuanceEnabled`, `getLineDisconnectionConfiguration`, the `WORKFLOW_NOT_ACTIVATED` failure code, the account page `STAGED` readiness state and its copy, the `deploymentReference` part of the workflow-context AAD, and test-only `enabled`/`issuanceEnabled` handler overrides. Audit metadata now records `channelTupleVersion` instead of `inventoryRevision`. Migration readiness is checked from actual migration state; UAT acceptance belongs to release governance.

## 9. Provider privacy and deauthorization

The `DEMI_LINE_PROVIDER_TOKEN_VERIFY_QUERY_ENABLED` switch is removed. LINE's official access-token verification (`GET https://api.line.me/oauth2/v2.1/verify?access_token=…`) requires the token in the query; the adapter is the single place that builds that URL. It is sent only to the fixed LINE host, server-side, with `redirect: "error"`, `cache: "no-store"`, a shared 10-second timeout, no retry, no logging, no persistence and no browser navigation. Every other request carries the token in a header or body. The switch protected nothing beyond that containment (the friendship check already used the same query), so removing it does not widen exposure.

Remote deauthorization runs only inside an explicit authorized Unlink with a transient, channel-correct token: Account uses Account credentials and Account audience; MINI uses only MINI credentials and the MINI audience, matching the selected MINI channel ID and environment. Missing credentials, wrong audience, wrong subject or Provider unavailability leave local Unlink committed and the obligation honestly unconfirmed; only HTTP 204 confirms.

## 10. Build fixes

- `app/app/patients/[relationshipId]/evidence/upload/route.ts`: removed the non-handler export `patientEvidenceUploadRouteInternals`. The test only needed the size limit, which already lives in the server module `@/modules/patient-evidence/transport/patient-evidence-upload-parser` (`PATIENT_EVIDENCE_MAX_MULTIPART_BYTES`). Upload behavior is unchanged.
- `app/login/page.tsx`, `app/line/workflow/page.tsx`: replaced the optional/defaulted Page argument with the required `{ searchParams: Promise<…> }` shape used by the other App Router pages. Parsing, redirects, login returns, LIFF startup and Family invitation precedence are unchanged; tests now pass `searchParams` explicitly.
- `/api/health` Windows generate failure: see section 11.

## 11. Verification actually executed

All on Windows 11, Node via the repository scripts, Next.js 16.3.0. Disposable local PostgreSQL only (`npm run test:db:up`); no real LINE Provider calls.

**Focused (during implementation)**

- `npx vitest run` on the two configuration test files: **45/45 passed** (valid Account + MINI, Account-only, missing/partial/invalid MINI, wrong audience/LIFF reuse, wrong environment, kill switch, credentials, no legacy flags).
- `npx vitest run src/modules/line app/line app/api/line app/login "app/app/patients/[relationshipId]/evidence/upload" src/lib/auth`: **55 files / 781 tests passed**.
- `npm run test:integration:focused -- <file>` on PostgreSQL:
  - `line-authorization-lifecycle`: **32/32** (includes new: MINI not provisioned, historical MINI grant carried forward after MINI removal, pre-B2.4 tuple rows kept distinct and resolved only through Recovery).
  - `line-disconnection-orchestration`: **34/34** (includes: unavailable configuration never waives pending records; derived display names).
  - `line-workflow-issuance`: **5/5** (includes new: MINI subject from another Provider → `LINE_NOT_LINKED`, no observation).
  - `line-workflow-scoped-read`: **9/9**; `line-workflow-scoped-mutation`: **19/19**; `line-account-linking`: **26/26**.
- `npm run test:line-workflow:next-smoke`: **PASS** (anonymous Verify denied without Provider I/O; ten Verify requests issued cookies and the eleventh got 429; cookie authorized the scoped read without renewal; one MINI observation and shared limiter counters persisted). It runs with only the new variables; this harness still builds with `--experimental-build-mode compile`, so it is runtime evidence, not build evidence.
- `npx eslint` on all changed files: no findings.

**Build**

- Baseline reproduction (detached worktree of `961bc1b`, no `.env`): `next build --webpack` **failed** in type check with exactly three errors — the exported `patientEvidenceUploadRouteInternals` in the upload route, and the optional Page argument in `app/line/workflow/page.tsx` and `app/login/page.tsx`. The default Turbopack `npm run build` passed at baseline because it did not produce the `.next/types/app/**` route/page validators that webpack generated.
- After the fixes: `npm run build` (Turbopack, default) **passed**; `npx next build --webpack` **passed** (TypeScript, 48/48 static pages, traces).
- `/api/health`: the experimental split `next build --webpack --experimental-build-mode compile` then `--experimental-build-mode generate` was rerun on the baseline worktree. The reported `/api/health` syntax error did **not** reproduce (all 48 pages generated); the generate step instead failed inside Next with `ENOENT: rename .next/server/proxy.js -> .next/server/middleware.js`. `app/api/health/route.ts` contains no defect. This is behavior of the experimental split mode (on Windows, the only platform tested), not of the default build; it was not reproduced on Linux/Vercel and is not claimed fixed. The acceptance build is the default `npm run build`, which passes.

**Broad (once, after the diff was reviewed)**

- `npm run typecheck`: **passed**.
- `npm run lint`: **0 errors**, 2 warnings, both existing `@next/next/no-img-element` warnings in files not touched here.
- `npm run test`: **426 files / 4,429 tests passed**.
- Not run: the full `npm run test:integration` suite (non-LINE integration files are unaffected; all LINE integration files were run individually above), real LINE/device UAT, production migration or deployment.

## 12. Remaining operational prerequisites

- Owner: create/verify the LINE Login and MINI channels under the same DEMI Provider, configure environment values per deployment, and run real device/Provider UAT. None of this was verified here.
- Production DB role must be able to read `_prisma_migrations` (readiness check) and use `LineWorkflowRateLimitBucket` (unchanged from B2.3).
- With MINI provisioned, the Account LIFF cannot obtain a MINI access token, so an Unlink leaves the MINI obligation unconfirmed and Relink requires Recovery. This is existing behavior, not introduced here.
- Unused export `verifyLineTerminationToken` in `line-deauthorization-client.ts` predates this phase and was left untouched.

<a id="owner-setup-th"></a>

## 13. คู่มือตั้งค่าสำหรับเจ้าของระบบ (ภาษาไทย)

ตั้งค่าใน environment variables ของ deployment (เช่น Vercel → Project → Settings → Environment Variables) ไม่ต้องเขียน JSON manifest และไม่ต้องกรอกหลักฐานการทดสอบใดๆ

### A. LINE Login (บัญชี LINE ของ DEMI) — จำเป็น

จาก LINE Developers → Provider ของ DEMI → channel ประเภท **LINE Login**

| คัดลอกจาก | ใส่ใน |
| --- | --- |
| แท็บ Basic settings → **Channel ID** | `DEMI_LINE_LOGIN_CHANNEL_ID` |
| แท็บ Basic settings → **Channel secret** | `DEMI_LINE_LOGIN_CHANNEL_SECRET` |
| แท็บ LIFF → **LIFF ID** ของหน้าเชื่อมบัญชี | `NEXT_PUBLIC_DEMI_LINE_LIFF_ID` |
| โดเมน HTTPS ของ DEMI เช่น `https://demi.example.org` (ไม่มี `/` ท้าย) | `DEMI_LINE_PUBLIC_ORIGIN` |

### B. LINE MINI App — ใส่เมื่อพร้อมใช้งานเท่านั้น

จาก channel ประเภท **LINE MINI App** ใน Provider **เดียวกัน** กับ LINE Login เลือก internal channel ที่จะใช้กับ deployment นี้ (Developing / Review / Published) 1 ตัว

| คัดลอกจาก | ใส่ใน |
| --- | --- |
| ชื่อ internal channel ที่เลือก | `DEMI_LINE_MINI_APP_ENVIRONMENT` = `DEVELOPING` หรือ `REVIEW` หรือ `PUBLISHED` (ตัวพิมพ์ใหญ่) |
| **Channel ID** ของ MINI App | `DEMI_LINE_MINI_APP_CHANNEL_ID` |
| **LIFF ID** ของ internal channel ที่เลือก | `DEMI_LINE_MINI_APP_LIFF_ID` |
| **Channel secret** ของ MINI App | `DEMI_LINE_MINI_APP_CHANNEL_SECRET` |

ใน LINE Developers ให้ตั้ง **Endpoint URL** ของ MINI App เป็น `DEMI_LINE_PUBLIC_ORIGIN` ตามด้วย `/line/workflow` เช่น `https://demi.example.org/line/workflow` (ไม่ต้องใส่ค่านี้ใน env ระบบคำนวณเอง)

`DEMI_LINE_MINI_APP_CONTEXT_KEYRING` เป็นกุญแจของ DEMI เอง **ไม่ใช่ค่าจาก LINE** สร้างครั้งเดียวต่อ environment ด้วยคำสั่ง:

```sh
node -e "const r=()=>require('crypto').randomBytes(32).toString('base64url');console.log(JSON.stringify({currentKid:'k1',keys:[{kid:'k1',encryptionKey:r(),sessionKey:r()}]}))"
```

แล้วคัดลอกผลลัพธ์ทั้งบรรทัดไปใส่ ห้ามใช้ Channel secret แทน และห้ามใช้ค่าเดียวกันข้าม environment

### C. กฎสำคัญ

- **ยังไม่ใช้ MINI:** เว้นค่า `DEMI_LINE_MINI_APP_*` ทั้งหมดให้ว่าง ระบบจะทำงานแบบ LINE Login อย่างเดียวตามปกติ
- **ใส่ไม่ครบ หรือใส่ผิด:** MINI จะถูกปิด และการเชื่อมบัญชี LINE ใหม่/การกู้คืนจะแจ้งว่าตั้งค่าไม่ถูกต้องจนกว่าจะแก้ (การยกเลิกการเชื่อมต่อยังทำได้เสมอ)
- ห้ามใช้ Channel ID หรือ LIFF ID ของ LINE Login ซ้ำกับ MINI
- **ปิด MINI ฉุกเฉิน:** ตั้ง `DEMI_LINE_MINI_APP_DISABLED=true` แล้ว redeploy เมื่อจะเปิดคืนให้ลบค่านี้หรือตั้งเป็น `false` ไม่มี flag อื่นที่ต้องเปิด
- ค่าเก่า `DEMI_LINE_DISCONNECTION_ENABLED`, `DEMI_LINE_DISCONNECTION_MANIFEST`, `DEMI_LINE_PROVIDER_TOKEN_VERIFY_QUERY_ENABLED`, `DEMI_LINE_MINI_APP_WORKFLOW_ENABLED`, `DEMI_LINE_MINI_APP_ISSUANCE_ENABLED`, `DEMI_LINE_MINI_APP_ENDPOINT_URL`, `DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE` ไม่ถูกใช้แล้ว ลบออกได้
- **Production:** origin ต้องเป็น HTTPS และ database migration ต้อง apply ครบ (เจ้าของเป็นผู้ apply ตามขั้นตอนปกติ) **Local:** ใช้ `http://localhost` ได้เฉพาะ LINE Login ส่วน MINI ต้องเป็น HTTPS เสมอ
