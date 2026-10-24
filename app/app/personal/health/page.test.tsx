import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connection } from "next/server";
import { getPatientPersonalHomePageContext } from "@/modules/patient-self/transport/patient-self-page-context";
import { getOwnPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { getPatientHealthInformation } from "@/modules/patient-hospital-profile/services/patient-health-history-service";
import { getOwnCurrentAssignedOsm, getOwnLatestStaffMeasurements } from "@/modules/patient-self/services/patient-self-health-query-service";
import { getOwnLatestPatientGoalPlan, getOwnNextAppointmentForRelationship } from "@/modules/patient-self/services/patient-self-care-query-service";
import { listOwnActiveMedicationSummaries } from "@/modules/medications/services/personal-medication-query-service";
import { listOwnPatientSelfMeasurements } from "@/modules/patient-self-measurements/services/patient-self-measurement-service";
import { PATIENT_ACCESS_UNAVAILABLE } from "@/modules/patient-self/transport/patient-access-unavailable";
import { InfrastructureError } from "@/shared/errors/application-error";
import Page from "./page";
import Loading from "./loading";
import ErrorPage from "../error";

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/modules/patient-self/transport/patient-self-page-context", () => ({ getPatientPersonalHomePageContext: vi.fn() }));
vi.mock("@/modules/patient-hospital-profile/services/patient-hospital-profile-service", () => ({ getOwnPatientHospitalProfile: vi.fn() }));
vi.mock("@/modules/patient-hospital-profile/services/patient-health-history-service", () => ({ getPatientHealthInformation: vi.fn() }));
vi.mock("@/modules/patient-self/services/patient-self-health-query-service", () => ({ getOwnCurrentAssignedOsm: vi.fn(), getOwnLatestStaffMeasurements: vi.fn() }));
vi.mock("@/modules/patient-self/services/patient-self-care-query-service", () => ({ getOwnLatestPatientGoalPlan: vi.fn(), getOwnNextAppointmentForRelationship: vi.fn() }));
vi.mock("@/modules/medications/services/personal-medication-query-service", () => ({ listOwnActiveMedicationSummaries: vi.fn() }));
vi.mock("@/modules/patient-self-measurements/services/patient-self-measurement-service", () => ({ listOwnPatientSelfMeasurements: vi.fn() }));

const id = "44444444-4444-4444-8444-444444444444";
const second = "55555555-5555-4555-8555-555555555555";
const ended = "66666666-6666-4666-8666-666666666666";
const actor = { userId: "user", personId: "person", roles: ["PATIENT" as const], hospitalMemberships: [], osmHospitalRelationships: [] };
const hospital = (relationshipId: string, hospitalName: string, careEndedAt: Date | null = null) => ({
  relationshipId, hospitalName, hospitalId: relationshipId, hospitalCode: "H", hospitalNumber: null, careEndedAt,
  hospitalStatus: "ACTIVE" as const, hospitalContact: { status: "AVAILABLE" as const,
    contact: { hospital: { hospitalCode: "H", name: hospitalName }, addressText: null, phoneNumber: "021234567" } },
});
const date = new Date("2026-10-20T00:00:00Z");

describe("PH-1 patient health page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue({ actor, person: { givenName: "สมชาย", familyName: "ใจดี" },
      hospitalRelationships: [hospital(id, "โรงพยาบาล ก"), hospital(second, "โรงพยาบาล ข"), hospital(ended, "โรงพยาบาลเดิม", date)] });
    vi.mocked(getOwnPatientHospitalProfile).mockResolvedValue({ relationshipId: id, hospitalName: "โรงพยาบาล ก", person: { givenName: "สมชาย", familyName: "ใจดี" },
      profile: { gender: null, phoneNumber: null, addressText: null, emergencyContactName: null, emergencyContactPhone: null, occupation: null, educationLevel: null }, emergencyContactRelationship: null, source: "HOSPITAL_LOCAL", version: 1 });
    vi.mocked(getPatientHealthInformation).mockResolvedValue({ history: null, dateOfBirth: null });
    vi.mocked(getOwnLatestStaffMeasurements).mockResolvedValue({ weight: null, heightCm: null, waistCircumference: null, bmi: null });
    vi.mocked(listOwnPatientSelfMeasurements).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(listOwnActiveMedicationSummaries).mockResolvedValue({ items: [], hasMore: false });
    vi.mocked(getOwnNextAppointmentForRelationship).mockResolvedValue(null);
    vi.mocked(getOwnCurrentAssignedOsm).mockResolvedValue(null);
    vi.mocked(getOwnLatestPatientGoalPlan).mockResolvedValue(null);
  });
  it("renders all 13 items in Canva order with explicit empty states and the measurement route intact", async () => {
    const html = renderToStaticMarkup(await Page());
    expect([...html.matchAll(/data-health-item="(\d+)"/g)].map((match) => Number(match[1]))).toEqual(Array.from({ length: 13 }, (_, index) => index + 1));
    for (const label of ["ชื่อ-สกุล", "อายุ", "น้ำหนัก", "ส่วนสูง", "BMI", "รอบเอว", "โรคประจำตัว", "ประวัติครอบครัว (พ่อแม่และญาติสายตรง)", "ผู้ติดต่อกรณีฉุกเฉิน", "ยาที่รับประทาน", "การนัดหมาย", "อสม.ผู้ดูแล + เบอร์ติดต่อ", "แผนสุขภาพ",
      "โรงพยาบาลยังไม่ได้บันทึก", "ยังไม่มีนัดหมายถัดไป", "ยังไม่มี อสม.ผู้ดูแล", "คุณยังไม่ได้บันทึกค่าที่วัดเอง", 'href="/app/personal/measurements"']) expect(html).toContain(label);
    expect(connection).toHaveBeenCalledOnce();
  });
  it.each([undefined, "not-a-uuid", "99999999-9999-4999-8999-999999999999", ended, [id, second]])("defaults an invalid/unavailable locator %j to Personal Home's first active relationship", async (relationshipId) => {
    await Page({ searchParams: Promise.resolve({ relationshipId }) });
    expect(getOwnLatestStaffMeasurements).toHaveBeenCalledWith(actor, id);
    expect(getOwnCurrentAssignedOsm).toHaveBeenCalledWith(actor, id);
  });
  it("switches all relationship data to a validated own hospital and renders its selected option", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ relationshipId: second }) }));
    for (const read of [getOwnPatientHospitalProfile, getPatientHealthInformation, getOwnLatestStaffMeasurements, getOwnNextAppointmentForRelationship, getOwnCurrentAssignedOsm, getOwnLatestPatientGoalPlan]) expect(read).toHaveBeenCalledWith(actor, second);
    expect(html).toContain(`value="${second}" selected=""`);
    expect(html).toContain('action="/app/personal/health"');
    expect(html).toContain('name="relationshipId"');
    expect(html).not.toContain("โรงพยาบาลเดิม");
  });
  it("keeps self-reported values separate, shows BMI as a value, and links contacts, medication, appointment and plan", async () => {
    vi.mocked(getOwnLatestStaffMeasurements).mockResolvedValue({ weight: { value: 70, date, source: "ติดตามผล" }, heightCm: { value: 160, date, source: "ข้อมูลตั้งต้น" }, waistCircumference: null,
      bmi: { value: 27.3, date, source: "ติดตามผล", heightDate: date, heightSource: "ข้อมูลตั้งต้น" } });
    vi.mocked(listOwnPatientSelfMeasurements).mockResolvedValue({ items: [{ measurementId: "self", measuredAt: date, createdAt: date,
      weight: 55, bloodSugar: null, systolicBloodPressure: null, diastolicBloodPressure: null, note: null, canDelete: false }], nextCursor: null });
    vi.mocked(getOwnCurrentAssignedOsm).mockResolvedValue({ displayName: "สมศรี อสม.", contactPhone: "0812345678" });
    vi.mocked(listOwnActiveMedicationSummaries).mockResolvedValue({ items: [{ id: "med", medicationName: "ยาทดสอบ", instructionText: "ครั้งละ 1 เม็ด หลังอาหาร",
      status: "ACTIVE", stoppedAt: null, createdAt: date.toISOString(), updatedAt: date.toISOString(), schedules: [{ localTime: "08:00" }] }], hasMore: false });
    vi.mocked(getOwnNextAppointmentForRelationship).mockResolvedValue({ appointmentId: "appt", scheduledAt: date });
    vi.mocked(getOwnLatestPatientGoalPlan).mockResolvedValue({ relationship: { relationshipId: id, hospitalName: "โรงพยาบาล ก", hospitalCode: "H", hospitalNumber: null, hospitalStatus: "ACTIVE", careEndedAt: null },
      goalPlanId: "plan", roundNumber: 1, createdAt: date, primaryGoalLabel: "เคลื่อนไหว", program: null, primaryGoalNote: null, weeklyNote: null,
      items: [{ activityLabel: "เดิน", targetDays: 3, targetValue: null, targetUnit: null }] });
    const html = renderToStaticMarkup(await Page());
    for (const value of ["70 กก.", "27.3", "ข้อมูลตั้งต้น", "ค่าที่วัดเอง · ไม่ใช่ค่าที่บันทึกโดยเจ้าหน้าที่", "55 กก.", "สมศรี อสม.", 'href="tel:0812345678"', "ครั้งละ 1 เม็ด หลังอาหาร", "08:00", `/app/personal/appointments/${id}/appt`, `/app/personal/care/${id}/goal-plans/plan`, "เดิน"]) expect(html).toContain(value);
    expect(html.indexOf("70 กก.")).toBeLessThan(html.indexOf("ค่าที่วัดเอง ·"));
    expect(html.indexOf("55 กก.")).toBeGreaterThan(html.indexOf("ค่าที่วัดเอง ·"));
    expect(html).not.toContain("น้ำหนักเกิน");
  });
  it("shows hospital phone when assigned OSM has no phone", async () => {
    vi.mocked(getOwnCurrentAssignedOsm).mockResolvedValue({ displayName: "อสม. ทดสอบ", contactPhone: null });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("ยังไม่มีเบอร์ อสม.");
    expect(html).toContain('href="tel:021234567"');
  });
  it("renders age, tri-state history, family history and emergency contact from the selected hospital", async () => {
    vi.mocked(getPatientHealthInformation).mockResolvedValue({ dateOfBirth: new Date("1980-01-01"),
      history: { id: "history", patientHospitalRelationshipId: id, diabetes: "YES", hypertension: "NO", otherConditions: "หอบหืด",
        familyHypertension: "UNKNOWN", familyDiabetes: "YES", familyHeartDisease: "NO", familyStroke: "YES", diagnosisYear: null,
        version: 1, createdAt: date, updatedAt: date } });
    const profile = await getOwnPatientHospitalProfile(actor, id);
    vi.mocked(getOwnPatientHospitalProfile).mockResolvedValue({ ...profile,
      profile: { ...profile.profile, emergencyContactName: "ญาติ ใจดี", emergencyContactPhone: "0891234567" } });
    const html = renderToStaticMarkup(await Page());
    for (const value of ["ปี", "เบาหวาน: มี", "ความดันโลหิตสูง: ไม่มี", "หอบหืด", "ความดันโลหิตสูง: ไม่ทราบ", "โรคหัวใจ: ไม่มี", "อัมพฤกษ์/อัมพาต: มี", "ญาติ ใจดี", 'href="tel:0891234567"']) expect(html).toContain(value);
  });
  it("does not read summary data for a non-patient or an account with no active hospital", async () => {
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue(PATIENT_ACCESS_UNAVAILABLE);
    expect(renderToStaticMarkup(await Page())).toContain("บัญชีนี้ยังเปิดข้อมูลผู้ป่วยไม่ได้");
    expect(getOwnLatestStaffMeasurements).not.toHaveBeenCalled();
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue(null);
    expect(renderToStaticMarkup(await Page())).toContain("ยังไม่มีโรงพยาบาลที่พร้อมแสดงข้อมูลสุขภาพ");
    expect(getOwnCurrentAssignedOsm).not.toHaveBeenCalled();
  });
  it("uses loading and sanitized retry error states; data failures never masquerade as empty records", async () => {
    expect(renderToStaticMarkup(<Loading />)).toContain("กำลังโหลดข้อมูลสุขภาพ");
    const html = renderToStaticMarkup(<ErrorPage error={new Error("private data")} retry={() => undefined} />);
    expect(html).toContain("ลองอีกครั้ง"); expect(html).not.toContain("private data");
    vi.mocked(getOwnLatestStaffMeasurements).mockRejectedValue(new InfrastructureError());
    await expect(Page()).rejects.toBeInstanceOf(InfrastructureError);
  });
});
