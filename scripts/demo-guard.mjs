// Safety guard for the synthetic demo seed (P1 Part C). Pure: reads only the environment object it is given.
// Every check must pass before the seed or reset touches a database or the auth provider; it fails closed.

const PRODUCTION_MARKERS = ["NODE_ENV", "VERCEL_ENV"];
const SUPABASE_REF_PATTERN = /^[a-z0-9]{20}$/u;

export class DemoSeedRefusedError extends Error {
  constructor(message) {
    super(message);
    this.name = "DemoSeedRefusedError";
  }
}

/** The Supabase project ref a PostgreSQL URL points to (direct `db.<ref>.supabase.co` or pooler user `postgres.<ref>`). */
export function supabaseRefFromDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) return null;

  const direct = url.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/u);
  if (direct) return direct[1];

  const poolerUser = decodeURIComponent(url.username).match(/^[a-z_]+\.([a-z0-9]{20})$/u);
  if (poolerUser && /\.pooler\.supabase\.com$/u.test(url.hostname)) return poolerUser[1];

  return null;
}

/** The Supabase project ref of an API URL (`https://<ref>.supabase.co`). */
export function supabaseRefFromApiUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u)?.[1] ?? null;
}

/**
 * Returns the allowlisted Supabase ref when seeding is allowed; throws DemoSeedRefusedError otherwise.
 * Requires DEMI_DEMO_SEED_ALLOWED=true, an allowlisted DEMI_DEMO_SUPABASE_REF that every database and API URL
 * points to, and no production marker. Messages name variables only, never their values.
 */
export function assertDemoSeedAllowed(environment) {
  if (environment.DEMI_DEMO_SEED_ALLOWED !== "true") {
    throw new DemoSeedRefusedError("DEMI_DEMO_SEED_ALLOWED must be exactly true");
  }

  for (const name of PRODUCTION_MARKERS) {
    if (environment[name] === "production") {
      throw new DemoSeedRefusedError(`${name} marks a production environment`);
    }
  }

  const allowedRef = environment.DEMI_DEMO_SUPABASE_REF;
  if (!allowedRef || !SUPABASE_REF_PATTERN.test(allowedRef)) {
    throw new DemoSeedRefusedError("DEMI_DEMO_SUPABASE_REF must be set to the demo Supabase project ref");
  }

  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    if (!environment[name]) throw new DemoSeedRefusedError(`${name} must be set`);
    if (supabaseRefFromDatabaseUrl(environment[name]) !== allowedRef) {
      throw new DemoSeedRefusedError(`${name} does not point to the allowlisted demo Supabase project`);
    }
  }

  if (supabaseRefFromApiUrl(environment.NEXT_PUBLIC_SUPABASE_URL ?? "") !== allowedRef) {
    throw new DemoSeedRefusedError("NEXT_PUBLIC_SUPABASE_URL does not point to the allowlisted demo Supabase project");
  }

  return allowedRef;
}
