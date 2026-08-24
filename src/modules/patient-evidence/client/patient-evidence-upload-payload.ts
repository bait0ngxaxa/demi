import { optimizeEvidenceImage } from "./patient-evidence-image-optimizer";

export type EvidenceImageOptimizer = (file: File) => Promise<File>;

export async function replacePatientEvidenceFile(
  formData: FormData,
  sourceFile: File,
  optimizer: EvidenceImageOptimizer = optimizeEvidenceImage,
): Promise<void> {
  const optimizedFile = await optimizer(sourceFile);

  formData.set("file", optimizedFile);
}

