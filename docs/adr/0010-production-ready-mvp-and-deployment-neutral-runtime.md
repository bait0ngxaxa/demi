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
