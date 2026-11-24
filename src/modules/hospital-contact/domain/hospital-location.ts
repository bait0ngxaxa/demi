/**
 * One map point per Hospital, set by its OWNER. The bounds are Thailand's bounding box; the same
 * numbers back the "HospitalContact_location_bounds" CHECK constraint in PostgreSQL.
 */
export type HospitalLocation = {
  latitude: number;
  longitude: number;
};

export const HOSPITAL_LOCATION_BOUNDS = {
  minLatitude: 5.5,
  maxLatitude: 20.5,
  minLongitude: 97.3,
  maxLongitude: 105.7,
} as const;

export const MAX_HOSPITAL_LOCATION_INPUT_CODE_UNITS = 2048;

const COORDINATE_DECIMALS = 6;

export type HospitalLocationParseFailure = "SHORT_LINK" | "OUT_OF_BOUNDS" | "UNRECOGNIZED";

export type HospitalLocationParseResult =
  | { ok: true; location: HospitalLocation | null }
  | { ok: false; reason: HospitalLocationParseFailure };

const DECIMAL = String.raw`[+-]?\d{1,3}(?:\.\d+)?`;
const PLAIN_PAIR = new RegExp(String.raw`^(${DECIMAL})\s*,\s*(${DECIMAL})$`, "u");
const PLACE_PIN = new RegExp(String.raw`!3d(${DECIMAL})!4d(${DECIMAL})`, "u");
const VIEWPORT_CENTER = new RegExp(String.raw`/@(${DECIMAL}),(${DECIMAL}),`, "u");

const GOOGLE_MAPS_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.co.th",
  "www.google.co.th",
  "maps.google.co.th",
]);

function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_DECIMALS));
}

export function isWithinHospitalLocationBounds(location: HospitalLocation): boolean {
  return (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    location.latitude >= HOSPITAL_LOCATION_BOUNDS.minLatitude &&
    location.latitude <= HOSPITAL_LOCATION_BOUNDS.maxLatitude &&
    location.longitude >= HOSPITAL_LOCATION_BOUNDS.minLongitude &&
    location.longitude <= HOSPITAL_LOCATION_BOUNDS.maxLongitude
  );
}

function toLocation(latitudeText: string, longitudeText: string): HospitalLocationParseResult {
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, reason: "UNRECOGNIZED" };
  }

  const location = { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };

  return isWithinHospitalLocationBounds(location)
    ? { ok: true, location }
    : { ok: false, reason: "OUT_OF_BOUNDS" };
}

function matchPair(pattern: RegExp, value: string): HospitalLocationParseResult | null {
  const match = pattern.exec(value);
  const latitude = match?.[1];
  const longitude = match?.[2];

  return latitude !== undefined && longitude !== undefined ? toLocation(latitude, longitude) : null;
}

function isShortLink(url: URL): boolean {
  return (
    url.hostname === "maps.app.goo.gl" ||
    (url.hostname === "goo.gl" && url.pathname.startsWith("/maps"))
  );
}

function decodePath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function parseGoogleMapsUrl(url: URL): HospitalLocationParseResult {
  if (isShortLink(url)) {
    return { ok: false, reason: "SHORT_LINK" };
  }

  const isMapsUrl =
    (url.protocol === "https:" || url.protocol === "http:") &&
    GOOGLE_MAPS_HOSTS.has(url.hostname) &&
    (url.hostname.startsWith("maps.") || url.pathname === "/maps" || url.pathname.startsWith("/maps/"));

  if (!isMapsUrl) {
    return { ok: false, reason: "UNRECOGNIZED" };
  }

  // An explicit query is what the link was made to show; the place pin comes next; the
  // viewport centre (/@lat,lng,zoom) is only the camera position, so it is the last resort.
  for (const name of ["query", "q"]) {
    const query = url.searchParams.get(name);

    if (query !== null) {
      const fromQuery = matchPair(PLAIN_PAIR, query.trim());

      if (fromQuery !== null) {
        return fromQuery;
      }
    }
  }

  const path = decodePath(url.pathname);

  if (path === null) {
    return { ok: false, reason: "UNRECOGNIZED" };
  }

  return matchPair(PLACE_PIN, path) ?? matchPair(VIEWPORT_CENTER, path) ?? { ok: false, reason: "UNRECOGNIZED" };
}

/**
 * Accepts "lat, lng" or a full Google Maps URL that carries the coordinates. Short links are
 * refused rather than followed: resolving them would make the server fetch an external URL.
 * An empty value clears the location.
 */
export function parseHospitalLocationInput(value: string | null): HospitalLocationParseResult {
  const trimmed = value?.trim() ?? "";

  if (trimmed.length === 0) {
    return { ok: true, location: null };
  }

  if (trimmed.length > MAX_HOSPITAL_LOCATION_INPUT_CODE_UNITS) {
    return { ok: false, reason: "UNRECOGNIZED" };
  }

  const plain = matchPair(PLAIN_PAIR, trimmed);

  if (plain !== null) {
    return plain;
  }

  let url: URL;

  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/iu.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: "UNRECOGNIZED" };
  }

  return parseGoogleMapsUrl(url);
}

export function hospitalLocationsEqual(
  left: HospitalLocation | null,
  right: HospitalLocation | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.latitude === right.latitude && left.longitude === right.longitude;
}

export type HospitalLocationChange = "SET" | "CHANGED" | "CLEARED" | "UNCHANGED";

export function describeHospitalLocationChange(
  previous: HospitalLocation | null,
  next: HospitalLocation | null,
): HospitalLocationChange {
  if (hospitalLocationsEqual(previous, next)) {
    return "UNCHANGED";
  }

  if (previous === null) {
    return "SET";
  }

  return next === null ? "CLEARED" : "CHANGED";
}

export function formatHospitalLocation(location: HospitalLocation): string {
  return `${location.latitude.toFixed(COORDINATE_DECIMALS)}, ${location.longitude.toFixed(COORDINATE_DECIMALS)}`;
}

/** Google Maps URLs: `api=1` is required and no key is needed. */
export function buildHospitalMapsUrl(location: HospitalLocation): string {
  const query = encodeURIComponent(
    `${location.latitude.toFixed(COORDINATE_DECIMALS)},${location.longitude.toFixed(COORDINATE_DECIMALS)}`,
  );

  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
