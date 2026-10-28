"use client";

import { useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActivationPresentation } from "@/components/workforce/activation-presentation";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { initialWorkforceActivationActionState, type WorkforceActivationActionState } from "@/modules/workforce/transport/action-state";
import { regenerateWorkforceActivationAction, startAssistedWorkforceActivationAction } from "@/modules/workforce/transport/server-actions";
import { classifyWorkforceState, standardNotice, useScopedMutation, useScopedMutationSession, type MutationNotice, type MutationVerdict } from "../../scoped-mutation";

function activationRequestMatches(state: WorkforceActivationActionState, formData: FormData): boolean {
  return state.status === "SUCCESS" &&
    state.result.userId === formData.get("userId") &&
    state.result.hospitalId === formData.get("targetHospitalId") &&
    state.result.kind === formData.get("kind");
}

function conflictMessage(state: WorkforceActivationActionState): string | null {
  return state.status === "ERROR" ? state.message : null;
}

function activationNotice(kind: "remote" | "assisted"): (verdict: MutationVerdict) => MutationNotice | null {
  if (kind === "remote") {
    return standardNotice({
      success: "ออกลิงก์เปิดใช้งานใหม่แล้ว",
      conflict: "ไม่สามารถออกลิงก์ใหม่ได้ กรุณาตรวจสอบสถานะล่าสุด",
      forbidden: "ไม่มีสิทธิ์ออกลิงก์เปิดใช้งานใหม่",
    });
  }

  return standardNotice({
    conflict: "ไม่สามารถเริ่มการเปิดใช้งานแบบช่วยเหลือได้ กรุณาตรวจสอบสถานะล่าสุด",
    forbidden: "ไม่มีสิทธิ์เริ่มการเปิดใช้งานแบบช่วยเหลือ",
  });
}

export function WorkforceActivationControl({
  userId,
  hospitalId,
  relationshipId,
  kind,
  maskedName,
  activationLinkUsable,
}: {
  userId: string;
  hospitalId: string;
  relationshipId: string;
  kind: "HOSPITAL_MEMBER" | "OSM";
  maskedName: string;
  activationLinkUsable: boolean;
}): React.JSX.Element {
  const session = useScopedMutationSession<WorkforceActivationActionState>({ scope: `${hospitalId}:${relationshipId}` });
  const [hasUsableLink, setHasUsableLink] = useState(activationLinkUsable);
  const [handoff, setHandoff] = useState<Extract<WorkforceActivationActionState, { status: "SUCCESS" }>['result'] | null>(null);
  const [replacementRequest, setReplacementRequest] = useState<"remote" | "assisted" | null>(null);
  const remoteFormRef = useRef<HTMLFormElement>(null);
  const assistedFormRef = useRef<HTMLFormElement>(null);
  const confirmedReplacementRef = useRef(false);
  const navigatedAssistedUrls = useRef<Set<string>>(new Set());

  const remote = useScopedMutation(session, {
    kind: "remote",
    action: regenerateWorkforceActivationAction,
    initialState: initialWorkforceActivationActionState,
    classify: (state, formData) => classifyWorkforceState(state, activationRequestMatches(state, formData)),
    notice: activationNotice("remote"),
    message: conflictMessage,
    onSettled: ({ state, verdict }) => {
      if (verdict === "SUCCESS" && state.status === "SUCCESS") {
        setHandoff(state.result);
        setHasUsableLink(true);
      }
    },
    isBlocked: () => handoff !== null,
  });
  const assisted = useScopedMutation(session, {
    kind: "assisted",
    action: startAssistedWorkforceActivationAction,
    initialState: initialWorkforceActivationActionState,
    classify: (state, formData) => classifyWorkforceState(state, activationRequestMatches(state, formData)),
    notice: activationNotice("assisted"),
    message: conflictMessage,
    onSettled: ({ state, verdict }) => {
      if (verdict !== "SUCCESS" || state.status !== "SUCCESS") return;
      const { activationUrl } = state.result;
      if (navigatedAssistedUrls.current.has(activationUrl)) return;
      navigatedAssistedUrls.current.add(activationUrl);
      window.location.replace(activationUrl);
    },
    isBlocked: () => handoff !== null,
  });
  const latestState = session.latest?.state;
  const remoteError = session.latest?.kind === "remote" && latestState?.status === "ERROR" ? latestState : null;
  const assistedError = session.latest?.kind === "assisted" && latestState?.status === "ERROR" ? latestState : null;

  function confirmReplacement(
    kind: "remote" | "assisted",
    event: React.FormEvent<HTMLFormElement>,
  ): void {
    if (confirmedReplacementRef.current) {
      confirmedReplacementRef.current = false;
      return;
    }

    if (hasUsableLink) {
      event.preventDefault();
      setReplacementRequest(kind);
    }
  }

  function submitConfirmedReplacement(): void {
    const form = replacementRequest === "remote" ? remoteFormRef.current : assistedFormRef.current;
    if (!form) {
      return;
    }

    confirmedReplacementRef.current = true;
    setReplacementRequest(null);
    form.requestSubmit();
  }

  function renderRequestFields(): React.JSX.Element {
    return <><input name="userId" type="hidden" value={userId} /><input name="targetHospitalId" type="hidden" value={hospitalId} /><input name="kind" type="hidden" value={kind} /></>;
  }

  return (
    <section className="rounded-panel border border-border bg-surface p-4 sm:p-6" aria-labelledby="workforce-activation-heading">
      <h2 className="text-xl font-semibold" id="workforce-activation-heading">เปิดใช้งานบัญชี</h2>
      <p className="mt-2 text-sm leading-6 text-muted">ออกลิงก์ใหม่หรือช่วยเปิดใช้งานบนเครื่องนี้ได้จากหน้ารายละเอียดบุคลากร</p>
      {handoff ? (
        <div className="mt-4">
          <ActivationPresentation
            activationUrl={handoff.activationUrl}
            expiresAt={handoff.activationExpiresAt}
            maskedName={maskedName}
            onFinish={() => setHandoff(null)}
            title={handoff.activationMode === "ASSISTED" ? "เตรียมการเปิดใช้งานแบบช่วยเหลือแล้ว" : "ลิงก์เปิดใช้งานพร้อมส่งมอบ"}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={remote.action} onSubmit={(event) => confirmReplacement("remote", event)} ref={remoteFormRef}>
            {renderRequestFields()}
            <Button disabled={remote.pending || assisted.pending || session.unconfirmed} loading={remote.pending} type="submit">ออกลิงก์ใหม่</Button>
          </form>
          <form action={assisted.action} onSubmit={(event) => confirmReplacement("assisted", event)} ref={assistedFormRef}>
            {renderRequestFields()}
            <Button disabled={remote.pending || assisted.pending || session.unconfirmed} loading={assisted.pending} type="submit" variant="secondary">ช่วยเปิดใช้งานบนเครื่องนี้</Button>
          </form>
        </div>
      )}
      {hasUsableLink && !handoff ? <Alert className="mt-3" variant="warning">มีลิงก์ที่ยังใช้ได้ การออกลิงก์ใหม่จะยกเลิกลิงก์เดิม</Alert> : null}
      <UnknownOutcomeAlert
        active={(remote.unknownOutcome || assisted.unknownOutcome || session.unconfirmed) && !handoff}
        className="mt-3"
        recovery={{
          kind: "reload",
          label: "โหลดรายละเอียดใหม่",
          message: "ระบบยังยืนยันผลการออกลิงก์ไม่ได้ ลิงก์อาจถูกสร้างแล้วแต่เรียกคืนไม่ได้ กรุณาโหลดรายละเอียดใหม่เพื่อตรวจสอบก่อนออกลิงก์อีกครั้ง",
        }}
      />
      {remoteError && !session.unconfirmed ? <Alert className="mt-3" role="alert" variant={remoteError.code === "CONFLICT" ? "warning" : "danger"}>{remoteError.message}</Alert> : null}
      {assistedError && !session.unconfirmed ? <Alert className="mt-3" role="alert" variant={assistedError.code === "CONFLICT" ? "warning" : "danger"}>{assistedError.message}</Alert> : null}
      <ConfirmDialog
        cancelLabel="ยกเลิก"
        confirmLabel="ดำเนินการต่อ"
        confirmVariant="destructive"
        description="ลิงก์ที่ยังใช้ได้จะถูกยกเลิกและแสดงซ้ำไม่ได้ ต้องการออกลิงก์ใหม่หรือไม่"
        onCancel={() => setReplacementRequest(null)}
        onConfirm={submitConfirmedReplacement}
        open={replacementRequest !== null}
        title="ยืนยันการออกลิงก์"
      />
    </section>
  );
}
