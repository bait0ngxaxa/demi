import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createPatientImportTemplateWorkbook } from "../src/modules/patient-provisioning/import/patient-import-template";

const outputPath = fileURLToPath(
  new URL("../public/templates/demi-patient-import-template-v1.xlsx", import.meta.url),
);

const workbook = await createPatientImportTemplateWorkbook();
const buffer = await workbook.xlsx.writeBuffer();
const fileBytes = new Uint8Array(buffer);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, fileBytes);

console.log(`Generated ${outputPath}`);
