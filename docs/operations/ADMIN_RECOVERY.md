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

An unresolved authenticated password change is also a credential-operation fence. If a User has a non-null `passwordChangeOperationId`, do not issue, claim, or manually clear recovery state for that account. A definite current-password or password-policy rejection clears the fence automatically; an ambiguous provider/database result intentionally leaves recovery paused. Escalate to the application/security operator for an incident review of the operation ID and timestamp, application logs, and provider request outcome. Keep recovery paused until the operator can establish a safe credential state; do not clear the User fence with direct SQL or treat refresh-session revocation as proof that the password update succeeded.

### Evidence to retain

Keep the incident/change reference, operator identity, start and completion times, target's internal User ID, the `account.password_reset.break_glass` audit event and reset ID, whether the active-peer override was used, final reset/reconciliation state, and the provider outcome needed for any follow-up. Store this evidence in the restricted incident record. Do not retain or copy the National ID, password, bearer token, service-role key, or hidden terminal input. The operator note belongs in the audit and should describe the incident without personal or credential data.

## LINE forgot-password recovery

REC-2B adds the `/recover` choice “ลืมรหัสผ่าน · รับลิงก์ทาง LINE” and the same request entry on the LINE account page. A valid request always receives the same Thai response; only a non-ADMIN account with one active LINE binding can receive a single-use, 15-minute link. The link works only when opened with a fresh ID token from that same LINE binding. An unreachable OA or push failure leaves no usable capability. Users without a linked LINE use the existing Hospital-mediated path, and platform ADMIN accounts remain on the mediated reset path.

Keep `DEMI_RECOVERY_LINE_ENABLED=true` in the demo environment for demonstration. Production must remain `false` until partner-agency approval of the LINE recovery notice is recorded at RELEASE_GATE G-06. REC-1 tokenized links and Hospital-mediated recovery remain available regardless of this flag. See [ADR-0012 REC-2B](../adr/0012-global-credential-recovery-proof.md).
