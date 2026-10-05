import { z } from "zod";

const MAX_CONTACT_PAYLOAD_BYTES = 16 * 1024;
const MAX_ADDRESS_CODE_UNITS = 500;
const MAX_PHONE_CODE_UNITS = 32;

const forbiddenInvisible = new Set<number>([
  0x200b,
  0x200e,
  0x200f,
  0x202a,
  0x202b,
  0x202c,
  0x202d,
  0x202e,
  0x2060,
  0x2066,
  0x2067,
  0x2068,
  0x2069,
  0xfeff,
]);

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);

      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }

      index += 1;
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }

  return false;
}

function isForbiddenControlOrInvisible(code: number): boolean {
  return (
    (code >= 0x0000 && code <= 0x001f) ||
    (code >= 0x007f && code <= 0x009f) ||
    forbiddenInvisible.has(code)
  );
}

function hasForbiddenCharacter(value: string, allowLineFeed: boolean): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);

    if (code !== undefined && isForbiddenControlOrInvisible(code)) {
      if (allowLineFeed && code === 0x000a) {
        continue;
      }

      return true;
    }
  }

  return false;
}

export function normalizeHospitalAddressText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  if (hasUnpairedSurrogate(value)) {
    throw new Error("Address text contains invalid Unicode");
  }

  const normalized = value
    .replace(/\r\n?/gu, "\n")
    .replace(/\t/gu, " ")
    .trim()
    .split("\n")
    .map((line) => line.replace(/ +$/gu, ""))
    .join("\n")
    .trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > MAX_ADDRESS_CODE_UNITS) {
    throw new Error("Address text is too long");
  }

  if (hasForbiddenCharacter(normalized, true)) {
    throw new Error("Address text contains a prohibited character");
  }

  return normalized;
}

export function normalizeHospitalPhoneNumber(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  if (hasUnpairedSurrogate(value) || hasForbiddenCharacter(value, false)) {
    throw new Error("Phone number contains a prohibited character");
  }

  const normalized = value.trim().replace(/ {2,}/gu, " ");

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > MAX_PHONE_CODE_UNITS) {
    throw new Error("Phone number is too long");
  }

  if (!/^[\p{L}\p{M}\p{Nd} +\-().#:]+$/u.test(normalized)) {
    throw new Error("Phone number contains an unsupported character");
  }

  if (!/\p{Nd}/u.test(normalized)) {
    throw new Error("Phone number must contain a decimal digit");
  }

  return normalized;
}

const expectedUpdatedAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  .refine((value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  });

const rawMutationSchema = z
  .object({
    hospitalId: z.string().uuid(),
    expectedUpdatedAt: expectedUpdatedAtSchema.nullable(),
    addressText: z.string().nullable(),
    phoneNumber: z.string().nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    const contactBytes =
      new TextEncoder().encode(input.addressText ?? "").byteLength +
      new TextEncoder().encode(input.phoneNumber ?? "").byteLength;

    if (contactBytes > MAX_CONTACT_PAYLOAD_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["addressText"],
        message: "Contact fields exceed the allowed request size",
      });
    }
  });

export const hospitalContactMutationSchema = rawMutationSchema.transform((input, context) => {
  let addressText: string | null = null;
  let phoneNumber: string | null = null;
  let valid = true;

  try {
    addressText = normalizeHospitalAddressText(input.addressText);
  } catch {
    valid = false;
    context.addIssue({
      code: "custom",
      path: ["addressText"],
      message: "Address text is invalid",
    });
  }

  try {
    phoneNumber = normalizeHospitalPhoneNumber(input.phoneNumber);
  } catch {
    valid = false;
    context.addIssue({
      code: "custom",
      path: ["phoneNumber"],
      message: "Phone number is invalid",
    });
  }

  if (!valid) {
    return z.NEVER;
  }

  return {
    hospitalId: input.hospitalId.toLowerCase(),
    expectedUpdatedAt: input.expectedUpdatedAt,
    addressText,
    phoneNumber,
  };
});

export const hospitalContactHospitalIdSchema = z.string().uuid().transform((value) => value.toLowerCase());

export type HospitalContactMutationInput = z.infer<typeof hospitalContactMutationSchema>;

export const hospitalContactSchemaInternals = {
  MAX_CONTACT_PAYLOAD_BYTES,
  MAX_ADDRESS_CODE_UNITS,
  MAX_PHONE_CODE_UNITS,
  hasUnpairedSurrogate,
  hasForbiddenCharacter,
  expectedUpdatedAtSchema,
};
