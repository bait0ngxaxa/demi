import { createHash } from "node:crypto";

export type ActivationSlipView = {
  maskedName: string;
  hospitalName: string;
  expiresAt: Date;
  qrDataUrl: string;
};

export type ActivationSlipFailureView = {
  reason: "NOT_PENDING" | "IN_USE" | "UNAVAILABLE";
};

const PRINT_SCRIPT = "document.getElementById('print')?.addEventListener('click',()=>window.print());";

// The page has no external resources; only this one inline script and inline styles are allowed.
export const ACTIVATION_SLIPS_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
  `script-src 'sha256-${createHash("sha256").update(PRINT_SCRIPT, "utf8").digest("base64")}'`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const failureLabels: Record<ActivationSlipFailureView["reason"], string> = {
  NOT_PENDING: "ไม่อยู่ในสถานะรอเปิดใช้งาน",
  IN_USE: "กำลังมีการใช้งานลิงก์เดิมอยู่",
  UNAVAILABLE: "ระบบไม่พร้อมออกใบเปิดใช้งาน",
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatExpiry(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function renderSlip(slip: ActivationSlipView): string {
  return `<article class="slip">
  <p class="hospital">${escapeHtml(slip.hospitalName)}</p>
  <h2>ใบเปิดใช้งานบัญชี DEMI</h2>
  <p class="name">${escapeHtml(slip.maskedName)}</p>
  <img alt="คิวอาร์โค้ดเปิดใช้งานบัญชี" height="150" src="${escapeHtml(slip.qrDataUrl)}" width="150">
  <p class="steps">สแกน QR → กรอกเลขบัตรประชาชน → ตั้งรหัสผ่าน</p>
  <p class="expiry">ใช้ได้ครั้งเดียว หมดอายุ ${escapeHtml(formatExpiry(slip.expiresAt))}</p>
  <p class="warning">ห้ามส่งต่อหรือถ่ายรูปใบนี้ให้ผู้อื่น</p>
</article>`;
}

export function renderActivationSlipsPage(input: {
  slips: readonly ActivationSlipView[];
  failures: readonly ActivationSlipFailureView[];
}): string {
  const failureSummary = input.failures.length
    ? `<section class="no-print notice" role="alert"><p>ไม่สามารถออกใบเปิดใช้งานได้ ${input.failures.length} รายการ</p><ul>${[
        ...new Set(input.failures.map(({ reason }) => failureLabels[reason])),
      ]
        .map((label) => `<li>${escapeHtml(label)}</li>`)
        .join("")}</ul></section>`
    : "";

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>ใบเปิดใช้งานบัญชี DEMI</title>
<style>
@page { size: A4; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, "Noto Sans Thai", sans-serif; color: #111; background: #fff; }
header { padding: 16px; }
header button { min-height: 44px; padding: 0 20px; font: inherit; font-weight: 600; cursor: pointer; }
.notice { margin: 0 16px 16px; padding: 12px 16px; border: 1px solid #b45309; background: #fffbeb; }
.sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; padding: 0 16px 16px; }
.slip { break-inside: avoid; border: 1px dashed #555; padding: 5mm; text-align: center; min-height: 62mm; }
.slip h2 { margin: 2mm 0; font-size: 14pt; }
.slip p { margin: 1.5mm 0; }
.hospital { font-weight: 600; }
.name { font-size: 13pt; letter-spacing: 0.02em; }
.steps { font-weight: 600; }
.expiry, .warning { font-size: 9pt; }
@media print { .no-print { display: none !important; } .sheet { padding: 0; } }
@media (max-width: 480px) { .sheet { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header class="no-print">
<p>ใบเปิดใช้งาน ${input.slips.length} ใบ · ลิงก์ในใบนี้ใช้ได้ครั้งเดียว กรุณาพิมพ์แล้วปิดหน้านี้ ระบบจะไม่แสดงใบเดิมซ้ำ</p>
<button id="print" type="button">พิมพ์ใบเปิดใช้งาน</button>
</header>
${failureSummary}
<main class="sheet">
${input.slips.map(renderSlip).join("\n")}
</main>
<script>${PRINT_SCRIPT}</script>
</body>
</html>`;
}

export function renderActivationSlipsError(message: string): string {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>ไม่สามารถออกใบเปิดใช้งาน</title></head><body><p>${escapeHtml(message)}</p></body></html>`;
}
