# ADR-0030: Password policy — 8 characters, no composition rules, blocklist

- Status: Accepted (Product Owner, 2026-11-06)
- Date: 2026-11-06
- Replaces: the 12–128 character rule of `userOwnedPasswordSchema` and the duplicate `z.string().min(12).max(128)` in self-registration. No earlier ADR recorded that rule.
- Does not change: sign-in, the 5-failure login throttle, mediated and LINE recovery flows (ADR-0012), or how passwords are stored (Supabase Auth, bcrypt).

## Context

DEMI asked every person who sets a password — Patients, อสม., staff, caregivers, OWNERs and the first platform ADMIN — for at least 12 characters. Many of them type on a phone, often in Thai, and the length rule produced weak workarounds (repeated or padded digits) more than it produced strong passwords. The Product Owner chose a shorter minimum with screening instead.

NIST SP 800-63B-4 §3.1.1.2 requires a minimum of **15** characters when a password is the only authentication factor and 8 when it is part of multi-factor authentication. DEMI has no second factor, so 8 is a deliberate deviation, accepted for usability with the compensating controls below.

## Decision

- **Length.** A new or changed password has 8–128 Unicode code points (`PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_LENGTH`, `passwordLength(value) = [...value].length` in `src/modules/auth/domain/password-policy.ts`). A Thai combining mark counts as a character. The value is never trimmed or normalised, because Supabase stores and compares exactly what was typed and sign-in does not normalise either.
- **Provider byte limit.** Supabase Auth refuses passwords over 72 UTF-8 bytes (bcrypt; `MaxPasswordLength` in `internal/api/password.go`, returned as `validation_failed`). DEMI checks the same limit (`PASSWORD_MAX_BYTES = 72`, issue `PASSWORD_TOO_MANY_BYTES`) so the person is told why instead of seeing a generic provider failure. In practice the maximum is 72 ASCII characters or about 24 Thai characters, below NIST's recommended 64-character maximum; this is a provider limit, not a policy choice.
- **No composition rules.** No required digit, symbol, upper-case letter or character class. Spaces, Thai and emoji are allowed.
- **Blocklist on every set/change.** `isBlocklistedPassword` (server side, no network call) rejects, case-insensitively:
  - the bundled common passwords in `src/modules/auth/domain/data/common-passwords.ts`: SecLists `Pwdb_top-10000.txt` (MIT), lower-cased, only entries of at least 8 code points (3,922);
  - a unit of up to four characters repeated (`aaaaaaaa`, `11111111`, `12121212`, `abcdabcd`);
  - ascending or descending digit or letter runs (`12345678`, `87654321`, `abcdefgh`) and keyboard-row runs (`qwertyui`, `asdfghjk`);
  - `password`, `demi` or `admin` followed only by digits.
- **Personal information.** Where the server knows the person, `assertPasswordNotPersonal(password, context)` rejects a password that contains their National ID (13 digits), phone number (digits only, 9–10, a `+66` record read as the local `0`), an HN of at least 4 characters, or their birthdate as `ddmmyyyy`, `yyyymmdd` or `ddmmyy` in both the Gregorian and the Buddhist year. Separators (space, `-`, `.`, `/`, `_`) are ignored and Thai digits read as ASCII; digits are not joined across letters.
  - The National ID is stored only as the keyed hash `Person.identityKeyHash`. Where it is not typed in the same request (password change, Patient activation, mediated and LINE recovery), every 13-digit window of the password is hashed with the same HMAC and compared with the stored hash; the National ID is never stored in clear for this.
  - `loadPasswordPersonalContext` reads the User's identity hash, Patient phone and birthdate, HNs and workforce/OSM contact phones in one bounded query.
  - The check runs only after the flow has proved who is setting the password (the activation or invitation claim, the National ID confirmation, the LINE proof, the current session or the break-glass operator), so a rejection never tells a stranger anything about another person. A rejection releases or rolls back the claim: no provider call was made and the same link can be used again.
  - Flows and their context: Patient activation and self-registration (stored data, plus the typed National ID), workforce activation and its onboarding purposes (stored data and the typed National ID), Hospital onboarding, caregiver account claim and the first platform ADMIN (the typed identifier only: a new person), password change, mediated reset, LINE recovery and break-glass recovery (stored data).
- **Reasons.** NIST requires telling the person why. Each schema issue carries a stable code (`PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `PASSWORD_TOO_MANY_BYTES`, `PASSWORD_BLOCKLISTED`, `PASSWORD_PERSONAL_INFO`) and services throw `PasswordPolicyRejectedError(reason)`, a `ValidationError`, which every flow maps to its existing password field error. Copy lives in one module, `src/modules/auth/domain/password-policy-copy.ts`. The provider's `weak_password` (`PASSWORD_POLICY`) keeps its generic message as a fallback.
- **Client checks** measure length only (`passwordLengthIssue`); the blocklist and personal checks stay on the server so the list is not shipped to browsers.
- **Sign-in is unchanged.** Login schemas keep `min(1).max(128)`. Existing passwords keep working and no one is forced to reset.

## Compensating controls

1. The blocklist and personal-information check above.
2. The existing login throttle: blocked after 5 failed attempts (`AUTH_ATTEMPT_THROTTLE.maxFailures`).
3. Mediated recovery (ADR-0012): a reset needs a Hospital-verified identity, a single-use time-limited link and the account owner's National ID.
4. Supabase leaked-password protection (HIBP) when the Supabase plan allows it (`RELEASE_GATE.md` T-12). It is a provider setting, not application behaviour.

## Consequences

- An 8-character password without digits or symbols is accepted in every set/change flow unless it is blocklisted or contains the person's own National ID, phone, HN or birthdate; the rejection says which rule applied.
- Supabase must be configured to match (minimum length 8, no required characters); otherwise the provider would still refuse 8–11 character passwords with the generic message. The operator steps are in `docs/operations/SUPABASE_PRODUCTION.md` §4 and `RELEASE_GATE.md` T-21.
- A rejected personal or blocklisted password costs one extra bounded read; there is no new table or stored data.
- The NIST deviation is explicit and owned by the Product Owner.

## Revisit

- When multi-factor authentication is added: 8 then meets NIST SP 800-63B-4 for a password used as one factor.
- After any security incident involving password guessing or credential stuffing.
