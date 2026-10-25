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

function parseOptions(args) {
  if (args.length === 0) return { action: "reset", allowActivePeer: false, reason: null };
  if (args.length === 3 && args[0] === "--reconcile" && args[1] === "--reason" && args[2].trim().length >= 5) {
    return { action: "reconcile", allowActivePeer: false, reason: args[2].trim() };
  }
  if (args.length === 3 && args[0] === "--no-active-peer" && args[1] === "--reason" && args[2].trim().length >= 5) {
    return { action: "reset", allowActivePeer: true, reason: args[2].trim() };
  }
  throw new CliInputError('ใช้ --no-active-peer --reason "เหตุผล" เพื่อข้ามการตรวจ ADMIN ที่ยังใช้งานได้ หรือ --reconcile --reason "เหตุผล" เพื่อ reconcile งาน break-glass ที่ค้าง');
}

function isInteractiveTerminal() {
  return input.isTTY && output.isTTY && typeof input.setRawMode === "function";
}

function readHiddenInput(prompt) {
  if (!isInteractiveTerminal()) return Promise.reject(new CliInputError("คำสั่งนี้ต้องทำงานจาก terminal แบบ interactive"));
  return new Promise((resolveValue, reject) => {
    let value = "";
    let settled = false;
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    };
    const finish = (callback, result) => {
      if (settled) return;
      settled = true;
      cleanup();
      output.write("\n");
      callback(result);
    };
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          finish(reject, new CliInputError("ยกเลิกการกู้คืนบัญชี"));
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
        if (character >= " ") value += character;
      }
    };
    output.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function formatFailure(error) {
  if (typeof error === "object" && error !== null && "safeForDisplay" in error && error.safeForDisplay === true && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "CONFLICT") return "การกู้คืนหรือ reconciliation หยุดลงเพราะมี ADMIN ที่ยังใช้งานได้อีกบัญชี หรือบัญชีมีงานรีเซ็ตที่ต้องตรวจสอบ";
    if (error.code === "VALIDATION") return "ข้อมูลไม่ถูกต้อง หรือรหัสผ่านใหม่ไม่ผ่านนโยบายความปลอดภัย";
  }
  return "ยังยืนยันผลการเปลี่ยนรหัสผ่านไม่ได้ ตรวจสอบสถานะตามคู่มือ operations ก่อนลองใหม่";
}

async function main() {
  if (!isInteractiveTerminal()) throw new CliInputError("คำสั่งนี้ต้องทำงานจาก terminal แบบ interactive");
  const options = parseOptions(process.argv.slice(2));
  console.log("DEMI Platform Admin Recovery · break-glass");
  const questions = createInterface({ input, output });
  const loginIdentifier = await questions.question("รหัสเข้าสู่ระบบของบัญชี ADMIN ที่ต้องการกู้คืน: ");
  const operatorNote = options.reason ?? await questions.question("บันทึกเหตุผลการดำเนินการ (ห้ามใส่รหัสผ่านหรือ token): ");
  questions.close();
  const jiti = createJiti(import.meta.url, {
    alias: { "server-only": resolve(repositoryRoot, "node_modules", "server-only", "empty.js") },
    tsconfigPaths: true,
  });
  const recoveryService = await jiti.import(resolve(repositoryRoot, "src", "modules", "account-security", "services", "mediated-password-reset-service.ts"));
  if (options.action === "reconcile") {
    console.log("กำลังตรวจสอบ provider และ reconcile สถานะเดิม...");
    const result = await recoveryService.reconcilePlatformAdminBreakGlassPassword({ loginIdentifier, operatorNote });
    console.log(result.outcome === "COMPLETED" ? "reconciliation สำเร็จ: ใช้รหัสผ่านใหม่ได้" : "reconciliation สำเร็จ: ใช้รหัสผ่านเดิมได้");
    return;
  }

  const newPassword = await readHiddenInput("รหัสผ่านใหม่: ");
  const passwordConfirmation = await readHiddenInput("ยืนยันรหัสผ่านใหม่: ");
  if (newPassword !== passwordConfirmation) throw new CliInputError("รหัสผ่านใหม่และการยืนยันไม่ตรงกัน");
  console.log("กำลังตรวจสิทธิ์และเปลี่ยน credential...");
  await recoveryService.recoverPlatformAdminPassword({
    loginIdentifier,
    newPassword,
    passwordConfirmation,
    operatorNote,
    allowActivePeer: options.allowActivePeer,
  });
  console.log("เปลี่ยนรหัสผ่านบัญชี ADMIN สำเร็จ");
}

try {
  await main();
} catch (error) {
  console.error(`การกู้คืนบัญชีไม่สำเร็จ: ${formatFailure(error)}`);
  process.exitCode = 1;
}
