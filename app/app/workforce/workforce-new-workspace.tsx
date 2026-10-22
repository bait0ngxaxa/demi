"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { ActivationPresentation } from "@/components/workforce/activation-presentation";
import type { WorkforceHospital } from "@/modules/workforce/services/workforce-service";
import {
  initialWorkforceActivationActionState,
  initialWorkforceProvisionActionState,
  type WorkforceActivationActionState,
  type WorkforceProvisionActionState,
  type WorkforceProvisionResultState,
} from "@/modules/workforce/transport/action-state";
import {
  provisionHospitalMemberAction,
  provisionOsmAction,
  regenerateWorkforceActivationAction,
  startAssistedWorkforceActivationAction,
} from "@/modules/workforce/transport/server-actions";
import {
  classifyWorkforceState,
  formString,
  standardNotice,
  useScopedMutation,
  useScopedMutationSession,
  type MutationNotice,
  type MutationVerdict,
} from "./scoped-mutation";

type ProvisionKind = "HOSPITAL_MEMBER" | "OSM";
type Delivery = "REMOTE" | "ASSISTED" | "LATER";
type Step = 1 | 2 | 3;
type Handoff = {
  activationUrl: string;
  activationExpiresAt: string;
  activationMode: "REMOTE" | "ASSISTED";
  maskedName: string;
};

type Draft = {
  givenName: string;
  familyName: string;
  nationalId: string;
  profession: string;
};

const professionLabels = {
  DOCTOR: "แพทย์",
  NURSE: "พยาบาล",
  COORDINATOR: "ผู้ประสานงาน",
  OTHER: "อื่น ๆ",
} as const;

function maskName(draft: Draft): string {
  const maskPart = (value: string): string => `${Array.from(value.trim())[0] ?? "*"}***`;
  return `${maskPart(draft.givenName)} ${maskPart(draft.familyName)}`;
}

function provisionMatches(state: WorkforceProvisionActionState, formData: FormData): boolean {
  return state.status === "SUCCESS" &&
    state.result.kind === formString(formData, "kind") &&
    state.result.hospitalId === formString(formData, "targetHospitalId");
}

function provisionNotice(verdict: MutationVerdict, state: WorkforceProvisionActionState): MutationNotice | null {
  if (verdict === "SUCCESS" && state.status === "SUCCESS") {
    return { level: "success", message: state.result.kind === "OSM" ? "เพิ่มข้อมูล อสม. แล้ว" : "เพิ่มข้อมูลบุคลากรแล้ว" };
  }
  if (verdict === "CONFLICT") return { level: "warning", message: "ไม่สามารถเพิ่มรายการได้ กรุณาตรวจสอบรายชื่อล่าสุด" };
  if (verdict === "FORBIDDEN") return { level: "error", message: "ไม่มีสิทธิ์เพิ่มบุคลากรหรือ อสม. ในโรงพยาบาลนี้" };
  return null;
}

function activationMatches(state: WorkforceActivationActionState, formData: FormData): boolean {
  return state.status === "SUCCESS" &&
    state.result.userId === formString(formData, "userId") &&
    state.result.hospitalId === formString(formData, "targetHospitalId") &&
    state.result.kind === formString(formData, "kind");
}

export function WorkforceNewWorkspace({
  hospitals,
  selectedHospitalId,
  initialKind,
  initialStep,
}: {
  hospitals: WorkforceHospital[];
  selectedHospitalId: string;
  initialKind: ProvisionKind | null;
  initialStep: Step;
}): React.JSX.Element {
  const router = useRouter();
  const [kind, setKind] = useState<ProvisionKind | null>(initialKind);
  const [step, setStep] = useState<Step>(initialStep);
  const [draft, setDraft] = useState<Draft>({ givenName: "", familyName: "", nationalId: "", profession: "" });
  const [delivery, setDelivery] = useState<Delivery>("REMOTE");
  const [created, setCreated] = useState<WorkforceProvisionResultState | null>(null);
  const [outcome, setOutcome] = useState<"LATER" | "INVITED" | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const handoffContext = useRef<{ maskedName: string } | null>(null);
  const navigatedAssistedUrls = useRef<Set<string>>(new Set());

  const activationSession = useScopedMutationSession<WorkforceActivationActionState>({ scope: selectedHospitalId });
  const remote = useScopedMutation(activationSession, {
    kind: "remote",
    action: regenerateWorkforceActivationAction,
    initialState: initialWorkforceActivationActionState,
    classify: (state, formData) => classifyWorkforceState(state, activationMatches(state, formData)),
    notice: standardNotice({ success: "ออกลิงก์เปิดใช้งานแล้ว", conflict: "ออกลิงก์ไม่ได้ กรุณาตรวจสอบสถานะล่าสุด", forbidden: "ไม่มีสิทธิ์ออกลิงก์เปิดใช้งาน" }),
    onSettled: ({ state, verdict }) => {
      if (verdict === "SUCCESS" && state.status === "SUCCESS") {
        const context = handoffContext.current;
        setHandoff({ ...state.result, maskedName: context?.maskedName ?? "* ***" });
      }
    },
  });
  const assisted = useScopedMutation(activationSession, {
    kind: "assisted",
    action: startAssistedWorkforceActivationAction,
    initialState: initialWorkforceActivationActionState,
    classify: (state, formData) => classifyWorkforceState(state, activationMatches(state, formData)),
    notice: standardNotice({ conflict: "เริ่มการช่วยเปิดใช้งานไม่ได้ กรุณาตรวจสอบสถานะล่าสุด", forbidden: "ไม่มีสิทธิ์ช่วยเปิดใช้งานบัญชีนี้" }),
    onSettled: ({ state, verdict }) => {
      if (verdict !== "SUCCESS" || state.status !== "SUCCESS") return;
      const { activationUrl } = state.result;
      if (navigatedAssistedUrls.current.has(activationUrl)) return;
      navigatedAssistedUrls.current.add(activationUrl);
      window.location.replace(activationUrl);
    },
  });

  const provisionSession = useScopedMutationSession<WorkforceProvisionActionState>({ scope: selectedHospitalId });
  const provision = useScopedMutation(provisionSession, {
    kind: "provision",
    action: (previous, formData) => formString(formData, "kind") === "OSM"
      ? provisionOsmAction(previous, formData)
      : provisionHospitalMemberAction(previous, formData),
    initialState: initialWorkforceProvisionActionState,
    classify: (state, formData) => classifyWorkforceState(state, provisionMatches(state, formData)),
    notice: provisionNotice,
    onSettled: ({ state, verdict, formData }) => {
      if (verdict !== "SUCCESS" || state.status !== "SUCCESS") return;
      const result = state.result;
      setCreated(result);

      if (result.accountStatus === "ACTIVE" || result.accountStatus === "INVITED" || result.relationshipStatus === "INVITED") {
        setOutcome("INVITED");
        return;
      }
      if (formString(formData, "delivery") === "LATER") {
        setOutcome("LATER");
        return;
      }

      const mode = formString(formData, "delivery") === "ASSISTED" ? "ASSISTED" : "REMOTE";
      handoffContext.current = { maskedName: maskName(draft) };
      const activationForm = new FormData();
      activationForm.set("userId", result.userId);
      activationForm.set("targetHospitalId", result.hospitalId);
      activationForm.set("kind", result.kind);
      (mode === "ASSISTED" ? assisted.action : remote.action)(activationForm);
    },
  });

  function setRouteStep(nextStep: Step, nextKind = kind): void {
    setStep(nextStep);
    const params = new URLSearchParams({ hospitalId: selectedHospitalId, step: String(nextStep) });
    if (nextKind) params.set("kind", nextKind);
    router.replace(`/app/workforce/new?${params.toString()}`, { scroll: false });
  }

  function submitDetails(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!kind) return;
    setRouteStep(3);
  }

  const relationshipHref = created
    ? `/app/workforce/${created.kind === "OSM" ? "osm" : "staff"}/${encodeURIComponent(created.relationshipId)}`
    : `/app/workforce?hospitalId=${encodeURIComponent(selectedHospitalId)}&tab=pending`;
  const failureState = provision.state.status === "ERROR" ? provision.state : null;
  const activationFailure = remote.state.status === "ERROR" ? remote.state : assisted.state.status === "ERROR" ? assisted.state : null;
  const readyForProvision = kind !== null && draft.givenName.trim().length > 0 && draft.familyName.trim().length > 0 &&
    /^[0-9]{13}$/u.test(draft.nationalId) && (kind === "OSM" || Object.hasOwn(professionLabels, draft.profession));

  return (
    <div className="content-workspace mx-auto max-w-3xl break-words">
      <PageHeader
        breadcrumbs={[{ label: "จัดการบุคลากร", href: `/app/workforce?hospitalId=${encodeURIComponent(selectedHospitalId)}` }, { label: "เพิ่มบุคลากร / อสม." }]}
        description={`เพิ่มรายชื่อสำหรับ ${hospitals.find(({ id }) => id === selectedHospitalId)?.name ?? "โรงพยาบาล"}`}
        title="เพิ่มบุคลากร / อสม."
      />

      <ol aria-label="ขั้นตอนการเพิ่มบุคลากร" className="mt-6 grid grid-cols-3 gap-2">
        {([ [1, "ประเภท"], [2, "ข้อมูล"], [3, "วิธีส่งมอบ"] ] as const).map(([number, label]) => (
          <li aria-current={step === number ? "step" : undefined} className={`flex min-h-14 items-center gap-2 border-b-2 px-2 py-2 text-sm ${step === number ? "border-action-primary font-semibold text-brand-strong" : "border-border text-text-muted"}`} key={number}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step === number ? "bg-brand-soft text-brand-strong" : "bg-surface-muted"}`}>{number}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      {handoff ? (
        <div className="mt-6">
          <ActivationPresentation
            activationUrl={handoff.activationUrl}
            expiresAt={handoff.activationExpiresAt}
            maskedName={handoff.maskedName}
            onFinish={() => router.push(`/app/workforce?hospitalId=${encodeURIComponent(selectedHospitalId)}&tab=pending`)}
            title={handoff.activationMode === "ASSISTED" ? "พร้อมช่วยเปิดใช้งานบนเครื่องนี้" : "ส่งคำเชิญแล้ว · ลิงก์พร้อมส่งมอบ"}
          />
          <Link
            className={`${buttonClassName({ variant: "secondary" })} mt-4`}
            href={`/app/workforce/new?hospitalId=${encodeURIComponent(selectedHospitalId)}&step=1`}
            onClick={(event) => {
              event.preventDefault();
              setHandoff(null);
              setDraft({ givenName: "", familyName: "", nationalId: "", profession: "" });
              setCreated(null);
              setOutcome(null);
              setKind(null);
              setStep(1);
              router.push(`/app/workforce/new?hospitalId=${encodeURIComponent(selectedHospitalId)}&step=1`);
            }}
          >เพิ่มบุคลากร / อสม. อีกคน</Link>
        </div>
      ) : outcome ? (
        <Panel className="mt-6">
          <Alert variant="success">
            <p className="font-semibold">{outcome === "LATER" ? "เพิ่มรายชื่อแล้ว · รอเปิดใช้งาน" : "ส่งคำเชิญแล้ว ผู้ใช้ต้องเข้าสู่ระบบเพื่อยอมรับ"}</p>
            <p className="mt-1">{maskName(draft)}</p>
          </Alert>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className={buttonClassName({ variant: "primary" })} href={relationshipHref}>ดูรายละเอียด</Link>
            <Link className={buttonClassName({ variant: "secondary" })} href={`/app/workforce?hospitalId=${encodeURIComponent(selectedHospitalId)}&tab=pending`}>กลับรายชื่อ</Link>
          </div>
        </Panel>
      ) : (
        <Panel className="mt-6">
          <p className="text-sm leading-6 text-muted">โรงพยาบาลที่เลือก: <strong className="text-text">{hospitals.find(({ id }) => id === selectedHospitalId)?.name ?? "โรงพยาบาล"}</strong></p>
          {step === 1 ? (
            <fieldset className="mt-5 space-y-3">
              <legend className="text-lg font-semibold">เลือกประเภทบุคลากร</legend>
              {([ ["HOSPITAL_MEMBER", "บุคลากรโรงพยาบาล"], ["OSM", "อสม."] ] as const).map(([value, label]) => (
                <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 ${kind === value ? "border-action-primary bg-brand-soft" : "border-border bg-surface"}`} key={value}>
                  <input checked={kind === value} name="workforce-kind" onChange={() => setKind(value)} type="radio" value={value} />
                  <span className="font-semibold">{label}</span>
                </label>
              ))}
              <Button className="mt-3 w-full" disabled={!kind} onClick={() => setRouteStep(2)} type="button">ถัดไป</Button>
            </fieldset>
          ) : null}

          {step === 2 ? (
            <form className="mt-5 space-y-4" onSubmit={submitDetails}>
              <h2 className="text-lg font-semibold">กรอกข้อมูล{kind === "OSM" ? " อสม." : "บุคลากรโรงพยาบาล"}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold"><span>ชื่อ</span><Input autoComplete="given-name" maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, givenName: event.target.value }))} required value={draft.givenName} /></label>
                <label className="space-y-2 text-sm font-semibold"><span>นามสกุล</span><Input autoComplete="family-name" maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, familyName: event.target.value }))} required value={draft.familyName} /></label>
              </div>
              <label className="block space-y-2 text-sm font-semibold"><span>เลขบัตรประชาชน</span><Input autoComplete="off" inputMode="numeric" maxLength={13} onChange={(event) => setDraft((current) => ({ ...current, nationalId: event.target.value }))} pattern="[0-9]{13}" required value={draft.nationalId} /></label>
              {kind === "HOSPITAL_MEMBER" ? (
                <label className="block space-y-2 text-sm font-semibold"><span>วิชาชีพ</span>
                  <Select onChange={(event) => setDraft((current) => ({ ...current, profession: event.target.value }))} required value={draft.profession}>
                    <option disabled value="">เลือกวิชาชีพ</option>
                    {Object.entries(professionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </label>
              ) : null}
              <div className="flex flex-wrap justify-between gap-3 pt-2">
                <Button onClick={() => setRouteStep(1)} type="button" variant="secondary">ย้อนกลับ</Button>
                <Button disabled={!readyForProvision} type="submit">ถัดไป</Button>
              </div>
            </form>
          ) : null}

          {step === 3 ? (
            <div className="mt-5">
              <h2 className="text-lg font-semibold">เลือกวิธีส่งมอบ</h2>
              <p className="mt-1 text-sm text-muted">{maskName(draft)}</p>
              <form action={provision.action} className="mt-4 space-y-3">
                <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
                <input name="kind" type="hidden" value={kind ?? ""} />
                <input name="givenName" type="hidden" value={draft.givenName} />
                <input name="familyName" type="hidden" value={draft.familyName} />
                <input name="nationalId" type="hidden" value={draft.nationalId} />
                {kind === "HOSPITAL_MEMBER" ? <input name="profession" type="hidden" value={draft.profession} /> : null}
                <input name="deferActivation" type="hidden" value="true" />
                {([
                  ["REMOTE", "ส่งคำเชิญ (ลิงก์ / QR)", "ออกลิงก์ใช้ครั้งเดียวให้ผู้ใช้ตั้งรหัสผ่านเอง"],
                  ["ASSISTED", "ช่วยตั้งรหัสผ่านบนเครื่องนี้", "ออกลิงก์ช่วยเหลือชั่วคราวและออกจากระบบผู้ดูแลก่อนส่งมอบเครื่อง"],
                  ["LATER", "ทำภายหลัง", "เพิ่มรายชื่อโดยยังไม่ออกลิงก์"],
                ] as const).map(([value, label, description]) => (
                  <label className={`flex min-h-16 cursor-pointer gap-3 rounded-control border px-4 py-3 ${delivery === value ? "border-action-primary bg-brand-soft" : "border-border bg-surface"}`} key={value}>
                    <input checked={delivery === value} name="delivery" onChange={() => setDelivery(value)} type="radio" value={value} />
                    <span><span className="block font-semibold">{label}</span><span className="mt-1 block text-sm text-muted">{description}</span></span>
                  </label>
                ))}
                {failureState && !provisionSession.unconfirmed ? <Alert role="alert" variant={failureState.code === "CONFLICT" ? "warning" : "danger"}>{failureState.message}</Alert> : null}
                <UnknownOutcomeAlert active={provision.unknownOutcome || provisionSession.unconfirmed} recovery={{ kind: "reload", label: "ตรวจสอบรายชื่อ", message: "ผลการเพิ่มอาจบันทึกแล้ว กรุณาตรวจสอบรายชื่อก่อนเริ่มรายการใหม่" }} />
                {activationFailure && !activationSession.unconfirmed ? <Alert role="alert" variant={activationFailure.code === "CONFLICT" ? "warning" : "danger"}>{activationFailure.message}</Alert> : null}
                <UnknownOutcomeAlert active={remote.unknownOutcome || assisted.unknownOutcome || activationSession.unconfirmed} recovery={{ kind: "reload", label: "ตรวจสอบรายละเอียด", message: "เพิ่มรายชื่อแล้ว แต่ระบบยังยืนยันผลการออกลิงก์ไม่ได้ กรุณาตรวจสอบรายละเอียดบุคลากรก่อนออกลิงก์อีกครั้ง" }} />
                {created ? <Link className="text-sm font-semibold underline" href={relationshipHref}>ดูรายละเอียดรายชื่อที่เพิ่มแล้ว</Link> : null}
                <div className="flex flex-wrap justify-between gap-3 pt-2">
                  <Button disabled={provision.pending || provisionSession.unconfirmed || activationSession.locked} onClick={() => setRouteStep(2)} type="button" variant="secondary">ย้อนกลับ</Button>
                  <Button className="min-w-44" disabled={!readyForProvision || provision.pending || provisionSession.unconfirmed || activationSession.locked || outcome !== null} loading={provision.pending || remote.pending || assisted.pending} type="submit">
                    {provision.pending ? "กำลังบันทึก..." : remote.pending || assisted.pending ? "กำลังเตรียมลิงก์..." : "ยืนยันและดำเนินการ"}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
