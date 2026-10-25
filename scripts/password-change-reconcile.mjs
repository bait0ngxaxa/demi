import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createJiti } from "jiti";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CliInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliInputError";
    this.safeForDisplay = true;
  }
}

function parseOptions(args) {
  if (args.length === 1 && args[0] === "--list") return { action: "list" };
  if (
    args.length === 6 && args[0] === "--user-id" && uuidPattern.test(args[1]) &&
    args[2] === "--operation-id" && uuidPattern.test(args[3]) &&
    args[4] === "--reason" && args[5].trim().length >= 5
  ) {
    return { action: "reconcile", userId: args[1], operationId: args[3], operatorNote: args[5].trim() };
  }
  throw new CliInputError('ใช้ --list เพื่อดูงานเปลี่ยนรหัสผ่านที่ค้าง หรือ --user-id <UUID> --operation-id <UUID> --reason "INC-xxxx: เหตุผล" เพื่อ reconcile งานเดียว');
}

function formatFailure(error) {
  if (typeof error === "object" && error !== null && "safeForDisplay" in error && error.safeForDisplay === true && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "NOT_FOUND") return "NOT_OUTSTANDING: ไม่พบงานเปลี่ยนรหัสผ่านที่ค้างตรงกับ User และ operation ID นี้ อาจถูกปิดไปแล้วหรือเป็น operation ID เก่า ตรวจสอบด้วย --list";
    if (error.code === "VALIDATION") return "INVALID_INPUT: ข้อมูลไม่ถูกต้อง เหตุผลต้องยาว 5–256 ตัวอักษรและห้ามมีเลขประจำตัวประชาชน รหัสผ่าน หรือ token";
  }
  return "FAILED: reconciliation ไม่สำเร็จและไม่มีการเปลี่ยนสถานะ fence ยังคงอยู่ ลองใหม่ภายหลังหรือตรวจสอบตามคู่มือ operations";
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  console.log("DEMI Password Change Reconciliation");
  const jiti = createJiti(import.meta.url, {
    alias: { "server-only": resolve(repositoryRoot, "node_modules", "server-only", "empty.js") },
    tsconfigPaths: true,
  });
  const passwordChangeService = await jiti.import(resolve(repositoryRoot, "src", "modules", "account-security", "services", "password-change-service.ts"));

  if (options.action === "list") {
    const operations = await passwordChangeService.listUnresolvedPasswordChangeOperations();
    if (operations.length === 0) {
      console.log("ไม่มีงานเปลี่ยนรหัสผ่านที่ค้าง");
      return;
    }
    for (const operation of operations) {
      console.log([
        `userId=${operation.userId}`,
        `operationId=${operation.operationId}`,
        `startedAt=${operation.startedAt.toISOString()}`,
        `reconciliationRequiredAt=${operation.reconciliationRequiredAt?.toISOString() ?? "-"}`,
      ].join(" "));
    }
    return;
  }

  const result = await passwordChangeService.reconcileUnresolvedPasswordChange({
    userId: options.userId,
    operationId: options.operationId,
    operatorNote: options.operatorNote,
  });
  if (result.outcome === "RELEASED") {
    const { workforce, patient, line } = result.revoked;
    console.log(`RELEASED: ยกเลิกลิงก์กู้คืนที่ยังไม่ถูกใช้แล้ว (workforce=${workforce}, patient=${patient}, line=${line}) และปลด fence แล้ว ยังยืนยันไม่ได้ว่ารหัสผ่านใดใช้ได้ หากเจ้าของบัญชีเข้าสู่ระบบไม่ได้ ให้ใช้การกู้คืนรหัสผ่านตามปกติ`);
    return;
  }
  if (result.outcome === "ALREADY_RELEASED") {
    console.log("ALREADY_RELEASED: operation นี้ถูก reconcile ไปแล้ว ไม่มีการเปลี่ยนแปลงเพิ่ม");
    return;
  }
  process.exitCode = 2;
  const retainedMessages = {
    OPERATION_TOO_RECENT: "RETAINED_OPERATION_TOO_RECENT: operation เริ่มไม่ถึง 15 นาที คำขอเดิมอาจยังทำงานอยู่ fence ยังคงอยู่ ลองใหม่ภายหลัง",
    OPERATION_IN_FLIGHT: "RETAINED_OPERATION_IN_FLIGHT: process ที่เปลี่ยนรหัสผ่านยังเชื่อมต่อและถือ lease ของ operation นี้อยู่ fence ยังคงอยู่ ตรวจสอบ process นั้นก่อน แล้วลองใหม่หลังจากจบ",
    RECOVERY_UNRESOLVED: "RETAINED_RECOVERY_UNRESOLVED: บัญชีมีงานรีเซ็ตที่ถูก claim หรือรอ reconcile fence ยังคงอยู่ reconcile งานรีเซ็ตนั้นตามคู่มือก่อน",
  };
  console.log(retainedMessages[result.reason]);
}

try {
  await main();
} catch (error) {
  console.error(`reconciliation ไม่สำเร็จ: ${formatFailure(error)}`);
  process.exitCode = 1;
}
