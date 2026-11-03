import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";

import { createJiti } from "jiti";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

class CliInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliInputError";
    this.safeForDisplay = true;
  }
}

function isInteractiveTerminal() {
  return input.isTTY && output.isTTY && typeof input.setRawMode === "function";
}

function readHiddenInput(prompt) {
  if (!isInteractiveTerminal()) {
    return Promise.reject(new CliInputError("คำสั่งนี้ต้องทำงานจาก terminal แบบ interactive"));
  }

  return new Promise((resolveValue, reject) => {
    let value = "";
    let settled = false;

    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    };

    const finish = (callback, result) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      output.write("\n");
      callback(result);
    };

    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          finish(reject, new CliInputError("ยกเลิกการ bootstrap"));
          return;
        }

        if (character === "\r" || character === "\n") {
          finish(resolveValue, value);
          return;
        }

        if (character === "\u0008" || character === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }

        if (character >= " ") {
          value += character;
        }
      }
    };

    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function getApplicationErrorCode(error) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  return typeof error.code === "string" ? error.code : null;
}

function hasReconciliationFlag(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "requiresReconciliation" in error &&
    error.requiresReconciliation === true
  );
}

function formatFailure(error) {
  if (
    typeof error === "object" &&
    error !== null &&
    "safeForDisplay" in error &&
    error.safeForDisplay === true &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  if (hasReconciliationFlag(error)) {
    return "การ bootstrap ต้องหยุดเพื่อ reconciliation ของข้อมูลตัวตนและผู้ให้บริการ โดยยังไม่ได้สร้างสิทธิ์ ADMIN";
  }

  const code = getApplicationErrorCode(error);

  if (code === "VALIDATION") {
    return "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบตัวระบุเข้าสู่ระบบ ชื่อ และรหัสผ่าน";
  }

  if (typeof error === "object" && error !== null && "name" in error && error.name === "LegalVersionConflictError") {
    return "มีข้อกำหนดหรือนโยบายฉบับใหม่ระหว่างทำรายการ กรุณาเรียกคำสั่งอีกครั้ง และยังไม่ได้สร้างสิทธิ์ ADMIN";
  }

  if (code === "CONFLICT" && typeof error.message === "string") {
    return error.message;
  }

  if (code === "INFRASTRUCTURE") {
    return "ระบบหรือบริการที่จำเป็นไม่พร้อมใช้งาน และยังไม่ได้สร้างสิทธิ์ ADMIN";
  }

  return "การ bootstrap ไม่สำเร็จ และยังไม่ได้สร้างสิทธิ์ ADMIN";
}

const ACCEPT_LEGAL_FLAG = "--accept-legal";

function assertArguments(argumentsList) {
  const unexpected = argumentsList.filter((argument) => argument !== ACCEPT_LEGAL_FLAG);

  if (unexpected.length > 0 || argumentsList.length > 1) {
    throw new CliInputError(
      `รับเฉพาะ ${ACCEPT_LEGAL_FLAG} และไม่รับเลขบัตรประชาชนหรือรหัสผ่านผ่าน command line arguments`,
    );
  }

  // LG-1 §3 (ADR-0028): the operator accepts the current Terms + Privacy explicitly, never by default.
  if (argumentsList.length !== 1) {
    throw new CliInputError(
      `ต้องยอมรับข้อกำหนดและเงื่อนไขการใช้บริการ และรับทราบนโยบายการคุ้มครองข้อมูลส่วนบุคคล ด้วย ${ACCEPT_LEGAL_FLAG}`,
    );
  }
}

async function main() {
  assertArguments(process.argv.slice(2));

  if (!isInteractiveTerminal()) {
    throw new CliInputError("คำสั่งนี้ต้องทำงานจาก terminal แบบ interactive");
  }

  console.log("DEMI Platform Admin Bootstrap");

  const jiti = createJiti(import.meta.url, {
    alias: {
      "server-only": resolve(repositoryRoot, "node_modules", "server-only", "empty.js"),
    },
    tsconfigPaths: true,
  });
  const { getCurrentLegalVersions } = await jiti.import(
    resolve(repositoryRoot, "src", "modules", "legal", "services", "legal-service.ts"),
  );
  const currentLegal = await getCurrentLegalVersions();

  if (!currentLegal.TERMS || !currentLegal.PRIVACY_POLICY) {
    throw new CliInputError("ยังไม่มีข้อกำหนดหรือนโยบายฉบับที่ประกาศใช้ และยังไม่ได้สร้างสิทธิ์ ADMIN");
  }

  console.log(
    `ยอมรับ ${currentLegal.TERMS.title} ฉบับ ${currentLegal.TERMS.versionLabel} (/legal/terms)` +
      ` และรับทราบ ${currentLegal.PRIVACY_POLICY.title} ฉบับ ${currentLegal.PRIVACY_POLICY.versionLabel} (/legal/privacy)`,
  );

  const questionInterface = createInterface({ input, output });
  const nationalId = await questionInterface.question("เลขบัตรประชาชน หรือรหัส Admin: ");
  const givenName = await questionInterface.question("ชื่อ: ");
  const familyName = await questionInterface.question("นามสกุล: ");
  questionInterface.close();

  const password = await readHiddenInput("รหัสผ่าน: ");
  const passwordConfirmation = await readHiddenInput("ยืนยันรหัสผ่าน: ");

  if (password !== passwordConfirmation) {
    throw new CliInputError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
  }

  const { bootstrapPlatformAdmin } = await jiti.import(
    resolve(
      repositoryRoot,
      "src",
      "modules",
      "platform-admin-bootstrap",
      "services",
      "platform-admin-bootstrap-service.ts",
    ),
  );

  console.log("กำลังสร้าง Platform Admin คนแรก...");
  await bootstrapPlatformAdmin({
    nationalId,
    givenName,
    familyName,
    password,
    acceptLegal: {
      termsVersionId: currentLegal.TERMS.id,
      privacyVersionId: currentLegal.PRIVACY_POLICY.id,
    },
  });

  console.log("สร้าง Platform Admin สำเร็จ");
  console.log("เข้าสู่ระบบได้ที่ /login");
}

try {
  await main();
} catch (error) {
  console.error(`การ bootstrap ไม่สำเร็จ: ${formatFailure(error)}`);
  process.exitCode = 1;
}
