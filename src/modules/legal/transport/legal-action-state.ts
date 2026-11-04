import type { ConsentDecision, LegalAcceptanceSource, LegalChannel } from "@prisma/client";

import type { ConsentDocumentKind } from "../domain/legal-documents";

export type LegalActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; versionId?: string }
  | { status: "ERROR"; code: "LEGAL_VERSION_CHANGED" | "VALIDATION" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE"; message: string };

export const initialLegalActionState: LegalActionState = { status: "IDLE" };

export type UserLegalHistoryState =
  | { status: "IDLE" }
  | { status: "NOT_FOUND" }
  | { status: "ERROR"; message: string }
  | {
      status: "FOUND";
      displayName: string;
      acceptances: Array<{ id: string; acceptedAt: string; terms: string; privacy: string; source: string; channel: string }>;
      consentEvents: Array<{ id: string; kind: ConsentDocumentKind; decision: ConsentDecision; decidedAt: string; versionLabel: string; channel: string }>;
    };

export const initialUserLegalHistoryState: UserLegalHistoryState = { status: "IDLE" };

export const LEGAL_ACCEPTANCE_SOURCE_LABELS: Readonly<Record<LegalAcceptanceSource, string>> = {
  SELF_REGISTRATION: "ลงทะเบียนด้วยเลขบัตร",
  PATIENT_ACTIVATION: "เปิดใช้งานบัญชีผู้ป่วย",
  WORKFORCE_ACTIVATION: "เปิดใช้งานบัญชีเจ้าหน้าที่โรงพยาบาล/อสม.",
  HOSPITAL_ONBOARDING: "ขอใช้งานสำหรับโรงพยาบาล",
  CAREGIVER_ACCOUNT: "สร้างบัญชีผู้ดูแล",
  SETTINGS: "ยอมรับในการตั้งค่า",
  ADMIN_BOOTSTRAP: "สร้างผู้ดูแลระบบ DEMI คนแรก",
};

export const LEGAL_CHANNEL_LABELS: Readonly<Record<LegalChannel, string>> = {
  WEB: "เว็บ",
  LIFF: "LINE",
};

export const CONSENT_DECISION_LABELS: Readonly<Record<ConsentDecision, string>> = {
  GIVEN: "ให้ความยินยอม",
  WITHDRAWN: "ถอนความยินยอม",
};
