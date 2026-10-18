import { loginReturnToSchema } from "../schemas/login-schema";

export function buildLoginReturnHref(value: unknown): string {
  const parsed = loginReturnToSchema.safeParse(value);
  if (!parsed.success) return "/login";
  return `/login?returnTo=${encodeURIComponent(parsed.data)}`;
}
