# Deployment Identity Validation

`DEMI_DEPLOYMENT_STAGE` controls the deployment stage independently of Next.js `NODE_ENV`:

- `development`
- `uat`
- `production`

`DEMI_ALLOW_TEST_NATIONAL_IDS` is a server-side opt-in for checksum-invalid synthetic Thai National IDs. It bypasses the checksum only. Every ID must still contain exactly 13 digits and begin with a valid category digit from 1 through 8.

## Local development and tests

```dotenv
NODE_ENV=development
DEMI_DEPLOYMENT_STAGE=development
DEMI_ALLOW_TEST_NATIONAL_IDS=true
```

For test runners using `NODE_ENV=test`, the same explicit flag works with `DEMI_DEPLOYMENT_STAGE=development`. Existing local/test setups that omit the deployment stage keep the prior opt-in behavior. Keep the flag `false` when synthetic IDs are not needed.

## UAT on VPS, Docker, or other hosting

```dotenv
NODE_ENV=production
DEMI_DEPLOYMENT_STAGE=uat
DEMI_ALLOW_TEST_NATIONAL_IDS=true
```

Set these values in the server runtime environment. The application reads them when validating input, so a production build can run with UAT settings supplied at startup. Do not use `NEXT_PUBLIC_` variables for this configuration.

UAT must use isolated data and authentication environments. Use a separate UAT database and a separate authentication project/tenant with UAT-only credentials. Do not point UAT at production patient data, production authentication, or production secrets.

## Production

```dotenv
NODE_ENV=production
DEMI_DEPLOYMENT_STAGE=production
DEMI_ALLOW_TEST_NATIONAL_IDS=false
```

The `production` deployment stage always enforces the checksum, even if the opt-in flag is mistakenly set to `true`. With `NODE_ENV=production`, a missing, unknown, invalid, or mismatched stage also enforces the checksum; only `DEMI_DEPLOYMENT_STAGE=uat` plus the exact value `DEMI_ALLOW_TEST_NATIONAL_IDS=true` enables the bypass.

The deployment stage and flag do not change identity hashing, authentication, authorization, database schemas, or workflow behavior. They control only whether the Thai National ID checksum is required.

## Historical Phase 14B record

The original [Phase 14B](phases/PHASE_14B_DEMO_PRODUCTIZATION_UX_POLISH.md) record remains unchanged and describes the behavior at that phase. Production-mode UAT support is a later configuration change documented here.
