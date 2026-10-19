export function confirmMobileNavigation(): boolean {
  const main = document.getElementById("application-main-content");
  if (!main) {
    return true;
  }

  const hasUnknownOutcome = main.querySelector(
    '[data-navigation-guard="unknown-outcome"]',
  ) !== null;
  const hasPendingAction = main.querySelector(
    'button[aria-busy="true"][disabled]',
  ) !== null;

  if (!hasUnknownOutcome && !hasPendingAction) {
    return true;
  }

  const message = hasUnknownOutcome
    ? "ระบบยังยืนยันผลการบันทึกไม่ได้ หากเปลี่ยนหน้า คุณอาจต้องกลับมาตรวจสอบสถานะก่อนดำเนินการต่อ ต้องการเปลี่ยนหน้าหรือไม่?"
    : "มีรายการกำลังดำเนินการอยู่ หากเปลี่ยนหน้าในตอนนี้ คุณอาจต้องตรวจสอบผลก่อนดำเนินการต่อ ต้องการเปลี่ยนหน้าหรือไม่?";

  return window.confirm(message);
}
