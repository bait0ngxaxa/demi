# ADR-0010: Production-Ready MVP and Deployment-Neutral Runtime

- Status: Accepted
- Date: 2026-10-11

## Context

DEMI's demonstrations and UAT contexts were sometimes treated as permission to build temporary runtime behavior or defer production quality. The Product Owner has clarified that DEMI is one production-ready MVP codebase and that infrastructure, databases, environment configuration, and release operations are managed separately.

## Decision

1. Implement every approved feature as a complete, production-ready MVP vertical slice. Do not introduce demo-only or UAT-only runtime paths, fake persistence, temporary authorization bypasses, mock success responses, or “convert to production later” debt.
2. Keep application business behavior and authorization independent of hosting provider, `NODE_ENV`, project identity, and deployment labels. Server-side authorization uses current authenticated identity, role, capability, resource status, and scope. Infrastructure configuration, secrets, database isolation, and release operations remain operator responsibilities.
3. Use synthetic fixtures in tests and controlled test databases. Demo and UAT are ways to present and verify the application, not distinct application authorization modes.
4. Keep unconfirmed clinical definitions and unauthorized capabilities out of the implemented scope. Production-ready code does not claim independent clinical, Security, Privacy, Data Controller, or deployment approval.
5. When project records appear to conflict, apply the precedence documented in [AGENTS.md](../../AGENTS.md) and [Project Context](../CONTEXT.md); dated phase records remain historical evidence.

## Consequences

Compatible deployment environments run the same business authorization for the same user, role, resource, and database state. New implementations and handoffs must state implemented scope and remaining approvals separately. For example, Hospital OWNER reporting requires direct ACTIVE OWNER membership and remains exact-Hospital; Platform ADMIN selected-Hospital reporting uses its separate ADMIN policy and remains exact-Hospital. Cross-Hospital aggregation, unrestricted Patient discovery/detail, and Network export do not follow from either policy.

## Amendment — production-code-first runtime contract (2026-10-25)

The Product Owner confirms that release approval, readiness records, demo/UAT phases, and deployment labels are operator concerns and do not authorize or disable confirmed application behavior. Ordinary features must not depend on those records or on rollout/activation flags. Technical integration configuration may determine whether that integration can connect; missing optional provider configuration must not disable unrelated operations. A feature with an unresolved sensitive business rule remains explicitly incomplete and fail-closed until its permanent authorization/consent contract is confirmed.

The sole application testing-flag exception is server-only `DEMI_ALLOW_TEST_NATIONAL_IDS`. Only exact `"true"` bypasses Thai National ID checksum validation, in any `NODE_ENV` or deployment; format, exactly 13 numeric digits, category digit, identity conflict and uniqueness checks remain mandatory. Unset, false, or invalid values enforce the checksum. This flag is never automatically enabled, and synthetic data remains isolated by the operator in a separate database. This amendment extends ADR-0010 and does not create a separate runtime or feature-toggle architecture.
