import type { MobileNavigationIcon } from "./mobile-tab-projection";

/**
 * UI-01 customer menus for the general Patient (Personal workspace), with the customer's exact labels and order.
 * Destinations live in `application-navigation.ts`; Work roles keep their own role navigation.
 */
export const CUSTOMER_PRIMARY_MENU = [
  { id: "home", label: "หน้าหลัก", icon: "home" },
  { id: "health", label: "ข้อมูลสุขภาพ", icon: "care" },
  { id: "appointments", label: "นัดหมาย", icon: "appointments" },
  { id: "followup", label: "ติดตาม", icon: "followup" },
  { id: "profile", label: "โปรไฟล์", icon: "profile" },
] as const satisfies readonly { id: string; label: string; icon: MobileNavigationIcon }[];

/** Customer wording is kept exactly, including "Food & Finess". */
export const CUSTOMER_TOP_MENU = [
  { id: "appointment-history", label: "ประวัติการนัดหมาย", icon: "appointments" },
  { id: "family", label: "ครอบครัวของฉัน", icon: "family" },
  { id: "medications", label: "ยา", icon: "medications" },
  { id: "food-fitness", label: "Food & Finess", icon: "wellness" },
  { id: "contact", label: "ติดต่อเรา", icon: "contact" },
] as const satisfies readonly { id: string; label: string; icon: MobileNavigationIcon }[];

export type CustomerPrimaryMenuId = (typeof CUSTOMER_PRIMARY_MENU)[number]["id"];
export type CustomerTopMenuId = (typeof CUSTOMER_TOP_MENU)[number]["id"];
export type CustomerMenuId = CustomerPrimaryMenuId | CustomerTopMenuId;

export function getCustomerMenuIcon(id: CustomerMenuId): MobileNavigationIcon {
  return [...CUSTOMER_PRIMARY_MENU, ...CUSTOMER_TOP_MENU].find((entry) => entry.id === id)?.icon ?? "default";
}
