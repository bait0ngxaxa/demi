import { describe, expect, it } from "vitest";
import { z } from "zod";

import { expectActionInputContract, expectFormContract } from "../../../tests/support/form-contract";

const fields = new Set(["patientProgramId", "submissionNonce", "note"]);
const schema = z.object({ patientProgramId: z.string().uuid(), submissionNonce: z.string().uuid(), note: z.string() }).strict();
const programId = "11111111-1111-4111-8111-111111111111";
const nonce = "22222222-2222-4222-8222-222222222222";

function posted(entries: readonly (readonly [string, string])[]): FormData {
  const formData = new FormData();
  for (const [key, value] of entries) {
    formData.append(key, value);
  }
  return formData;
}

const parse = (formData: FormData): unknown => Object.fromEntries(formData.entries());
const valid = [["patientProgramId", programId], ["submissionNonce", nonce], ["note", "ok"]] as const;

describe("expectFormContract", () => {
  it("accepts FormData that matches the allow-list exactly and ignores $ACTION_ keys", () => {
    const formData = posted([...valid, ["$ACTION_ID_abc", ""]]);

    const parseWithoutFrameworkKeys = (data: FormData): unknown =>
      Object.fromEntries([...data.entries()].filter(([key]) => !key.startsWith("$ACTION_")));

    expect(expectFormContract(formData, { fields, parse: parseWithoutFrameworkKeys, schema }))
      .toEqual({ patientProgramId: programId, submissionNonce: nonce, note: "ok" });
  });

  it("fails on an extra key, such as a UI-only radio name", () => {
    const formData = posted([...valid, ["followedPlanChoice", "true"]]);

    expect(() => expectFormContract(formData, { fields, parse, schema })).toThrow(/extra \(rejected by the server\): followedPlanChoice/u);
  });

  it("fails on a missing key", () => {
    const formData = posted(valid.filter(([key]) => key !== "note"));

    expect(() => expectFormContract(formData, { fields, parse, schema })).toThrow(/missing: note/u);
  });

  it("fails on a duplicate key unless the contract marks it repeatable", () => {
    const formData = posted([...valid, ["note", "again"]]);

    expect(() => expectFormContract(formData, { fields, parse })).toThrow(/more than once: note/u);
    expect(() => expectFormContract(formData, { fields, parse, repeatable: ["note"] })).not.toThrow();
  });

  it("fails when the parser rejects the input or the schema reports issues", () => {
    expect(() => expectFormContract(posted(valid), { fields, parse: () => null })).toThrow(/parser rejected/u);
    expect(() => expectFormContract(posted(valid), { fields, parse: () => { throw new Error("bad"); } })).toThrow(/parser threw: Error: bad/u);
    const badId = posted([["patientProgramId", "not-a-uuid"], ["submissionNonce", nonce], ["note", "ok"]]);
    expect(() => expectFormContract(badId, { fields, parse, schema })).toThrow(/patientProgramId/u);
  });

  it("keeps the comparison exact when a mode omits optional keys", () => {
    const formData = posted(valid.filter(([key]) => key !== "note"));

    expect(() => expectFormContract(formData, { fields, notPosted: ["note"], parse })).not.toThrow();
    expect(() => expectFormContract(posted(valid), { fields, notPosted: ["note"], parse })).toThrow(/extra \(rejected by the server\): note/u);
    expect(() => expectFormContract(posted(valid), { fields, notPosted: ["unknown"], parse })).toThrow(/not in the server allow-list/u);
  });
});

describe("expectActionInputContract", () => {
  const input = { patientProgramId: programId, submissionNonce: nonce, note: "ok" };

  it("accepts an object whose keys match and that the schema parses", () => {
    expect(expectActionInputContract(input, { fields, schema })).toEqual(input);
  });

  it("fails on an extra or a missing key, and on a non-object", () => {
    expect(() => expectActionInputContract({ ...input, extra: "x" }, { fields, schema })).toThrow(/extra \(rejected by the server\): extra/u);
    expect(() => expectActionInputContract({ patientProgramId: programId, submissionNonce: nonce }, { fields, schema })).toThrow(/missing: note/u);
    expect(() => expectActionInputContract(null, { fields, schema })).toThrow(/not a plain object/u);
  });
});
