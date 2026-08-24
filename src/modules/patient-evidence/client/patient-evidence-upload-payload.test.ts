import { describe, expect, it } from "vitest";

import { replacePatientEvidenceFile } from "./patient-evidence-upload-payload";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

describe("patient evidence upload payload", () => {
  it("preserves the captured caption while asynchronous optimization is pending", async () => {
    const originalFile = new File(["original"], "original.jpg", { type: "image/jpeg" });
    const optimizedFile = new File(["optimized"], "evidence.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    const optimization = deferred<File>();
    const caption = "รูปหลักฐานก่อนทำกิจกรรม";

    formData.set("file", originalFile);
    formData.set("caption", caption);

    const replacement = replacePatientEvidenceFile(
      formData,
      originalFile,
      () => optimization.promise,
    );

    expect(formData.get("caption")).toBe(caption);
    expect(formData.get("file")).toBe(originalFile);

    optimization.resolve(optimizedFile);
    await replacement;

    expect(formData.get("caption")).toBe(caption);
    expect(formData.get("file")).toBe(optimizedFile);
    expect(formData.get("file")).not.toBe(originalFile);
  });

  it("keeps an empty caption entry unchanged while replacing only the file", async () => {
    const originalFile = new File(["original"], "original.jpg", { type: "image/jpeg" });
    const optimizedFile = new File(["optimized"], "evidence.jpg", { type: "image/jpeg" });
    const formData = new FormData();

    formData.set("file", originalFile);
    formData.set("caption", "");

    await replacePatientEvidenceFile(formData, originalFile, async () => optimizedFile);

    expect(formData.get("caption")).toBe("");
    expect(formData.get("file")).toBe(optimizedFile);
  });
});

