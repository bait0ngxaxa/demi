import { isPasswordPolicyIssueCode, type PasswordPolicyIssueCode } from "./password-policy";

/** One shared hint for every password input that sets or changes a user-owned password (ADR-0030). */
export const PASSWORD_POLICY_HINT =
  "รหัสผ่านอย่างน้อย 8 ตัวอักษร ใช้ตัวอักษร ตัวเลข หรือภาษาไทยก็ได้ ไม่ต้องมีอักขระพิเศษ แนะนำให้ใช้วลีที่จำง่ายแต่เดายาก";

export const PASSWORD_LENGTH_MESSAGE = "รหัสผ่านต้องมีความยาว 8–128 ตัวอักษร";
export const PASSWORD_TOO_MANY_BYTES_MESSAGE =
  "รหัสผ่านยาวเกินที่ระบบรองรับ ภาษาไทยได้ไม่เกินประมาณ 24 ตัวอักษร ภาษาอังกฤษหรือตัวเลขได้ไม่เกิน 72 ตัว กรุณาตั้งให้สั้นลง";
export const PASSWORD_BLOCKLISTED_MESSAGE = "รหัสผ่านนี้ถูกใช้บ่อยหรือเดาง่ายเกินไป กรุณาตั้งรหัสผ่านอื่น";
export const PASSWORD_PERSONAL_INFO_MESSAGE = "รหัสผ่านต้องไม่มีเลขบัตรประชาชน เบอร์โทร HN หรือวันเกิดของคุณ";
/** Fallback when only the identity provider (Supabase `weak_password`) refused the password. */
export const PASSWORD_PROVIDER_POLICY_MESSAGE = "รหัสผ่านนี้ไม่ผ่านนโยบายความปลอดภัย กรุณาตั้งรหัสผ่านที่คาดเดายากกว่านี้";

const messages: Record<PasswordPolicyIssueCode, string> = {
  PASSWORD_TOO_SHORT: PASSWORD_LENGTH_MESSAGE,
  PASSWORD_TOO_LONG: PASSWORD_LENGTH_MESSAGE,
  PASSWORD_TOO_MANY_BYTES: PASSWORD_TOO_MANY_BYTES_MESSAGE,
  PASSWORD_BLOCKLISTED: PASSWORD_BLOCKLISTED_MESSAGE,
  PASSWORD_PERSONAL_INFO: PASSWORD_PERSONAL_INFO_MESSAGE,
};

export function passwordPolicyMessage(reason: PasswordPolicyIssueCode): string {
  return messages[reason];
}

/** The field error for a schema issue on a new-password field: the policy reason, else the length rule. */
export function passwordIssueMessage(issue: { readonly message: string }): string {
  return isPasswordPolicyIssueCode(issue.message) ? passwordPolicyMessage(issue.message) : PASSWORD_LENGTH_MESSAGE;
}
