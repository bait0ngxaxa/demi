import { describe, expect, it } from "vitest";

import {
  buildHospitalMapsUrl,
  describeHospitalLocationChange,
  formatHospitalLocation,
  isWithinHospitalLocationBounds,
  MAX_HOSPITAL_LOCATION_INPUT_CODE_UNITS,
  parseHospitalLocationInput,
} from "./hospital-location";

const bangkok = { latitude: 13.756331, longitude: 100.501765 };

describe("parseHospitalLocationInput", () => {
  it.each([null, "", "   \n\t "])("clears the location for empty input %j", (value) => {
    expect(parseHospitalLocationInput(value)).toEqual({ ok: true, location: null });
  });

  it.each([
    ["plain pair", "13.756331, 100.501765"],
    ["plain pair without a space", "13.756331,100.501765"],
    ["plain pair with surrounding space", "  13.756331 ,  100.501765  "],
    ["?query=", "https://www.google.com/maps/search/?api=1&query=13.756331%2C100.501765"],
    ["?q=", "https://maps.google.com/?q=13.756331,100.501765"],
    ["?q= with a space", "https://www.google.co.th/maps?q=13.756331,%20100.501765"],
    ["/@lat,lng,zoom", "https://www.google.com/maps/@13.756331,100.501765,17z"],
    [
      "!3d!4d place pin",
      "https://www.google.com/maps/place/Some+Hospital/data=!4m6!3m5!1s0x0:0x0!8m2!3d13.756331!4d100.501765!16s",
    ],
    ["a URL pasted without its scheme", "www.google.com/maps/@13.756331,100.501765,15z"],
  ])("accepts a %s", (_form, value) => {
    expect(parseHospitalLocationInput(value)).toEqual({ ok: true, location: bangkok });
  });

  it("prefers the place pin over the viewport centre of the same link", () => {
    expect(
      parseHospitalLocationInput(
        "https://www.google.com/maps/place/X/@14.000000,101.000000,15z/data=!3m1!4b1!4m6!3m5!8m2!3d13.756331!4d100.501765",
      ),
    ).toEqual({ ok: true, location: bangkok });
  });

  it("prefers an explicit query over the viewport centre", () => {
    expect(
      parseHospitalLocationInput("https://www.google.com/maps/@14.0,101.0,15z?q=13.756331,100.501765"),
    ).toEqual({ ok: true, location: bangkok });
  });

  it("rounds to 6 decimal places", () => {
    expect(parseHospitalLocationInput("13.7563314, 100.5017649")).toEqual({
      ok: true,
      location: { latitude: 13.756331, longitude: 100.501765 },
    });
    expect(parseHospitalLocationInput("13.75, 100.5")).toEqual({
      ok: true,
      location: { latitude: 13.75, longitude: 100.5 },
    });
  });

  it.each([
    "https://maps.app.goo.gl/AbCdEf123",
    "maps.app.goo.gl/AbCdEf123",
    "https://goo.gl/maps/AbCdEf123",
  ])("refuses the short link %s instead of following it", (value) => {
    expect(parseHospitalLocationInput(value)).toEqual({ ok: false, reason: "SHORT_LINK" });
  });

  it.each([
    ["swapped latitude and longitude", "100.501765, 13.756331"],
    ["a point outside Thailand", "35.689487, 139.691706"],
    ["a negative latitude", "-13.756331, 100.501765"],
    ["swapped values inside a URL", "https://www.google.com/maps/@100.501765,13.756331,17z"],
  ])("rejects %s as out of bounds", (_case, value) => {
    expect(parseHospitalLocationInput(value)).toEqual({ ok: false, reason: "OUT_OF_BOUNDS" });
  });

  it.each([
    ["a place name", "โรงพยาบาลศิริราช"],
    ["a single number", "13.756331"],
    ["three numbers", "13.7, 100.5, 17"],
    ["a non-finite value", "NaN, Infinity"],
    ["exponent notation", "1e1, 1e2"],
    ["a query that is a place name", "https://www.google.com/maps/search/?api=1&query=Siriraj"],
    ["a non-Google host", "https://example.com/maps/@13.756331,100.501765,17z"],
    ["a lookalike host", "https://www.google.com.evil.test/maps/@13.756331,100.501765,17z"],
    ["a Google page outside Maps", "https://www.google.com/search?q=13.756331,100.501765"],
    ["a non-web scheme", "javascript:alert(1)//13.756331,100.501765"],
    ["an over-long value", `13.756331, 100.501765${" ".repeat(MAX_HOSPITAL_LOCATION_INPUT_CODE_UNITS)}x`],
  ])("rejects %s as unrecognized", (_case, value) => {
    expect(parseHospitalLocationInput(value)).toEqual({ ok: false, reason: "UNRECOGNIZED" });
  });

  it("accepts the bounding box edges and rejects just outside them", () => {
    expect(parseHospitalLocationInput("5.5, 97.3")).toMatchObject({ ok: true });
    expect(parseHospitalLocationInput("20.5, 105.7")).toMatchObject({ ok: true });
    expect(parseHospitalLocationInput("5.499999, 100")).toEqual({ ok: false, reason: "OUT_OF_BOUNDS" });
    expect(parseHospitalLocationInput("13, 105.700001")).toEqual({ ok: false, reason: "OUT_OF_BOUNDS" });
  });
});

describe("Hospital location helpers", () => {
  it("builds a keyless Google Maps URL with api=1 and an encoded comma", () => {
    expect(buildHospitalMapsUrl(bangkok)).toBe(
      "https://www.google.com/maps/search/?api=1&query=13.756331%2C100.501765",
    );
    expect(buildHospitalMapsUrl({ latitude: 13.75, longitude: 100.5 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=13.750000%2C100.500000",
    );
  });

  it("round-trips the URL it builds and the text it formats through the parser", () => {
    expect(parseHospitalLocationInput(buildHospitalMapsUrl(bangkok))).toEqual({ ok: true, location: bangkok });
    expect(parseHospitalLocationInput(formatHospitalLocation(bangkok))).toEqual({ ok: true, location: bangkok });
  });

  it("formats coordinates with 6 decimals", () => {
    expect(formatHospitalLocation({ latitude: 13.75, longitude: 100.5 })).toBe("13.750000, 100.500000");
  });

  it("describes the change kind recorded by the audit", () => {
    expect(describeHospitalLocationChange(null, null)).toBe("UNCHANGED");
    expect(describeHospitalLocationChange(null, bangkok)).toBe("SET");
    expect(describeHospitalLocationChange(bangkok, { ...bangkok })).toBe("UNCHANGED");
    expect(describeHospitalLocationChange(bangkok, { ...bangkok, latitude: 13.756332 })).toBe("CHANGED");
    expect(describeHospitalLocationChange(bangkok, null)).toBe("CLEARED");
  });

  it("checks bounds with finite numbers only", () => {
    expect(isWithinHospitalLocationBounds(bangkok)).toBe(true);
    expect(isWithinHospitalLocationBounds({ latitude: Number.NaN, longitude: 100 })).toBe(false);
  });
});
