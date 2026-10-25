# ADMIN Recovery — mediated reset and server break-glass

## Normal recovery

Use the authenticated REC-1 ceremony for a second active ADMIN: an active platform ADMIN selects the other ADMIN in `/app/admin/recovery`, verifies the person's identity using one of the recorded methods, and has the target complete the National-ID step. An ADMIN cannot reset their own account through the web flow. OWNER co-owner and caregiver-only eligibility follows [ADR-0012 REC-2A](../adr/0012-global-credential-recovery-proof.md).

## Last-ADMIN break-glass

`admin:recover` is for a service outage or account incident that prevents the normal ADMIN-mediated path from being used. Only a designated server operator who is authorized to access the production host and the server-only Supabase service-role environment may run it. Hospital OWNERs, caregivers, and ordinary application users must not run this command. The CLI targets an active ADMIN by the exact login identifier accepted at `/login`; it asks for the new password twice without echoing either value.

Run from the deployed release directory as the `demi` service account so the Node process reads the protected environment file and the matching application code:

```sh
sudo -u demi -H env NODE_OPTIONS='--env-file=/etc/demi/demi.env' npm run admin:recover
```

The command refuses if another ACTIVE ADMIN exists. If the approved incident procedure requires bypassing that peer check, pass an incident reference and a concise reason. This reason is written to the `account.password_reset.break_glass` audit event; do not put a National ID, password, token, service key, or other secret in it.

```sh
sudo -u demi -H env NODE_OPTIONS='--env-file=/etc/demi/demi.env' npm run admin:recover -- --no-active-peer --reason "INC-1234: normal ADMIN recovery unavailable"
```

The command prompts for the target ADMIN login identifier. With no override, it also prompts for an operator note. Password and confirmation are hidden terminal input. Do not pass the login identifier or password as arguments or environment variables. The CLI prints only a safe outcome; it never prints a token, password, Supabase key or provider subject.

The reset creates a claimed REC-1 `WorkforceActivation` record and reuses the same provider replacement, canonical identity switch, cleanup and reconciliation code. A confirmed success emits `account.password_reset.completed` with `verificationMethod: BREAK_GLASS_CLI`. If provider or database state is ambiguous, do not rerun the reset or edit the reset row. When another ADMIN can sign in, use `/app/admin/recovery` and reconcile from provider facts. For a last-ADMIN incident, use the CLI reconciliation mode, which reuses REC-1's provider probes and state transitions and records an `account.password_reset.reconciled` event with the operator note:

```sh
sudo -u demi -H env NODE_OPTIONS='--env-file=/etc/demi/demi.env' npm run admin:recover -- --reconcile --reason "INC-1234: reconcile provider outcome"
```

### Evidence to retain

Keep the incident/change reference, operator identity, start and completion times, target's internal User ID, the `account.password_reset.break_glass` audit event and reset ID, whether the active-peer override was used, final reset/reconciliation state, and the provider outcome needed for any follow-up. Store this evidence in the restricted incident record. Do not retain or copy the National ID, password, bearer token, service-role key, or hidden terminal input. The operator note belongs in the audit and should describe the incident without personal or credential data.

## Unresolved authenticated password change

An authenticated password change is also a credential-operation fence. While a User has an outstanding password-change operation, recovery issue, claim and switch for that account are refused. A definite current-password or provider password-policy rejection clears the fence automatically and keeps existing links valid. A provider timeout, an unknown provider response, a database failure after Supabase confirmed the change, or a process that stopped mid-request leaves the fence in place. The User sees “ยังยืนยันผลการเปลี่ยนรหัสผ่านไม่ได้” and is asked not to retry.

DEMI cannot prove from its own records or from Supabase which password is now valid: the operation is recorded before the provider request, and Supabase has no lookup that confirms a password without the password itself. Reconciliation therefore never assumes the password stayed unchanged. It moves the account to the same end state as a confirmed change. Every earlier unclaimed Workforce, Patient and LINE recovery capability is revoked, and the fence is released, in one transaction. That state is safe for either credential, because only the signed-in User who proved the current password knew either value. If the account owner then cannot sign in, they use the normal Hospital-mediated or LINE recovery path, which issues a new link and replaces the provider identity.

Two conditions, both enforced by the command, establish that the original request can no longer change the credential. Neither is inferred from logs:

- **Bounded provider request.** The provider adapter never sends the password update after a 60-second deadline. That deadline is fixed before the fence is reserved, and an update still open at the deadline is aborted. Reconciliation also requires the operation to be at least 15 minutes old, well past that deadline and the 2-minute process lease timeout.
- **Process quiescence.** For the whole operation, from reserving the fence through resolving it, the password-change process holds a per-User PostgreSQL lease in an open transaction. PostgreSQL drops the lease when that process finishes or its database connection dies. Reconciliation probes the lease without blocking and refuses while it is held, however old the operation is.

Only the designated server operator described above may run the command, from the deployed release directory as the `demi` service account. It takes no password, token, National ID or service key.

1. **Identify.** List outstanding operations. The output shows only internal identifiers and timestamps:

   ```sh
   sudo -u demi -H env NODE_OPTIONS='--env-file=/etc/demi/demi.env' npm run account:password-change:reconcile -- --list
   ```

   A non-empty `reconciliationRequiredAt` means the request recorded an uncertain outcome. `-` means the process stopped before it could record one.
2. **Investigate.** Open an incident record. Check application logs around `startedAt` for “Password change outcome is unknown”. Treat the operation as a possible change, whatever the logs suggest. Do not use Supabase user metadata, `updated_at`, session revocation or the user's own statement as proof of the outcome.
3. **Reconcile.** Run the command for exactly one User and operation, with the incident reference. The reason is stored in the audit, so keep National IDs, passwords, tokens and keys out of it:

   ```sh
   sudo -u demi -H env NODE_OPTIONS='--env-file=/etc/demi/demi.env' npm run account:password-change:reconcile -- --user-id <userId> --operation-id <operationId> --reason "INC-1234: password change outcome unconfirmed"
   ```

4. **Close.** Act on the result code:
   - `RELEASED`: earlier unclaimed links were revoked (the counts are printed) and the fence is released. Tell the account owner to sign in with the new password, or else the old one. If neither works, start normal recovery. Other devices may still be signed in, so ask the owner to sign out of other devices or change the password again once signed in.
   - `ALREADY_RELEASED`: this operation was already reconciled. Running the command again changes nothing.
   - `RETAINED_OPERATION_TOO_RECENT` (exit code 2): the operation started less than 15 minutes ago and the original request may still be running. The fence stays. Try again later. Age alone never releases a fence.
   - `RETAINED_OPERATION_IN_FLIGHT` (exit code 2): a connected process still holds this operation's lease, so the original request may still be running. The fence stays and nothing is revoked. Find the process. A healthy process resolves the fence on its own. If the process is hung, stop it, which drops its database connection and lease, and then rerun the command.
   - `RETAINED_RECOVERY_UNRESOLVED` (exit code 2): the account also has a claimed or reconciliation-required reset. The fence stays and that reset is left untouched. Reconcile the reset first through `/app/admin/recovery` (or `admin:recover -- --reconcile` for a last-ADMIN break-glass reset), then rerun this command.
   - `NOT_OUTSTANDING`: no such operation exists for that User. It may have finished already, or the ID may be out of date. Recheck with `--list`. Never reuse an older operation ID against a newer operation.
   - `FAILED`: nothing changed and the fence stays. Retry after checking database health.

Every run that matches an outstanding operation is audited under the target User. `account.password_change.reconciled` records the release. `account.password_change.reconciliation_retained` records a refusal. Each event records the operation ID, start time, uncertainty time, fence reason, `providerOutcome: UNVERIFIED`, the procedure `REVOKE_UNCLAIMED_AND_RELEASE`, the enforced `providerDeadlineMs`, `processLeaseFree: true` (on release), the number of revoked capabilities (on release) and the operator reason. Keep the incident reference, operator identity, target User ID, operation ID, result code and audit event IDs in the restricted incident record.

Do not edit `passwordChangeOperationId`, `passwordChangeStartedAt` or `passwordChangeReconciliationRequiredAt` with SQL. Do not revoke or un-revoke recovery rows by hand. Do not treat refresh-session revocation as proof that the password changed.

Two cases have no supported resolution yet and must stay fenced until someone investigates them by hand:

- A claimed reset whose own reconciliation stays quarantined.
- A host that froze while it held the lease, lost its database connection, and then resumed in the instant after the deadline check passed, while the update was being sent. The deadline and lease together cover every other interleaving. Stop or fence a resumed host from the frozen period before you rerun the command.

DEMI has no operator-driven way to set a known credential for a non-ADMIN account outside the existing recovery ceremonies, and this procedure does not add one.

## LINE forgot-password recovery

REC-2B adds the `/recover` choice “ลืมรหัสผ่าน · รับลิงก์ทาง LINE” and the same request entry on the LINE account page. A valid request always receives the same Thai response; only a non-ADMIN account with one active LINE binding can receive a single-use, 15-minute link. The link works only when opened with a fresh ID token from that same LINE binding. An unreachable OA or push failure leaves no usable capability. Users without a linked LINE use the existing Hospital-mediated path, and platform ADMIN accounts remain on the mediated reset path.

LINE password recovery follows the same permanent identity-proof, active-binding, single-use capability, expiry, throttling, anti-enumeration, audit and reconciliation rules in every compatible environment. It does not require `DEMI_RECOVERY_LINE_ENABLED` or release-document approval. Configure LINE provider credentials when using this integration; missing or invalid configuration leaves LINE delivery unavailable safely while the other recovery paths remain available. See [ADR-0012 REC-2B](../adr/0012-global-credential-recovery-proof.md). External governance records remain operator responsibilities and do not grant or deny application permissions.
