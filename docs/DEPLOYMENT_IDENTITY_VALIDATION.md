# Thai National ID validation across environments

`DEMI_ALLOW_TEST_NATIONAL_IDS` is a server-only, operator-controlled exception for synthetic identities. It works independently of `NODE_ENV`, hosting provider, deployment label, or `DEMI_DEPLOYMENT_STAGE`.

When the variable is absent, `false`, or invalid, DEMI enforces the Thai National ID checksum. Only the exact value `true` bypasses that checksum. DEMI still requires exactly 13 numeric digits and a valid category digit, and it continues all identity conflict, uniqueness, ownership, authorization, relationship, audit, and database integrity checks. This is not an authentication or authorization bypass.

The variable must never be exposed through `NEXT_PUBLIC_*` and is never enabled automatically. Keep it `false` when using real patient identities. Any deployment that enables it must use a separate database and authentication environment containing synthetic data only; a hostname, project name, or production build is not evidence that test identities are safe.

Examples:

| Configuration | Checksum behavior |
| --- | --- |
| `NODE_ENV=development`, flag `true` | Bypassed |
| `NODE_ENV=production`, flag `true` (including Vercel Preview or staging builds) | Bypassed |
| Any `NODE_ENV`, flag absent, `false`, or invalid | Enforced |
| `NODE_ENV=production`, `DEMI_DEPLOYMENT_STAGE=production`, flag `true` | Bypassed; deployment labels are ignored |

The owner is responsible for isolating synthetic test data and turning the exception off before processing real patient identities.
