import "server-only";

import { cache } from "react";

import type { ActorContext } from "../types/actor-context";
import { getProtectedApplicationActor } from "./application-access-service";

/**
 * Render-only protected actor, shared by the protected layout, the page and its page contexts within one server render
 * request: one Supabase `getUser()` and one actor read per request instead of one per call site.
 *
 * Ownership and scope: React `cache()` memoizes per server render request only; each request starts empty and nothing
 * is shared across requests or users. Outside a render request (server actions, route handlers) React does not
 * memoize, but those entry points must still call `getProtectedApplicationActor` directly so every mutation and every
 * auth-state change (sign-in, sign-out, password change/reset, legal re-acceptance, LINE linking) resolves fresh; a
 * repository guard test rejects importing this module from them. A denial is memoized for the request like a success,
 * so every caller in one render observes the same outcome. Callers must treat the returned actor as read-only.
 */
export const getRequestApplicationActor = cache(
  async (): Promise<ActorContext> => getProtectedApplicationActor(),
);
