"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { notify } from "@/components/ui/notify";
import { getPatientClassificationLabel, patientClassificationSourceLabels } from "@/modules/patient-classification/presentation/patient-classification-labels";
import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";
import {
  initialPatientClassificationActionState,
  type PatientClassificationActionState,
} from "@/modules/patient-classification/transport/action-state";
import { setPatientClassificationAction } from "@/modules/patient-classification/transport/server-actions";
import type { PatientClassificationPageContext } from "@/modules/patient-classification/services/patient-classification-query-service";

type PatientClassificationViewProps = {
  context: PatientClassificationPageContext;
};

/** Thrown inside the awaited wrapper so the shared hook reports an unconfirmed outcome. */
class UnconfirmedClassification extends Error {}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function ActionFeedback({ state }: { state: PatientClassificationActionState }): React.JSX.Element | null {
  if (state.status === "IDLE") {
    return null;
  }

  if (state.status === "ERROR") {
    return (
      <Alert className="mt-4" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
        <p className="font-semibold">บันทึกสถานะผู้ป่วยไม่สำเร็จ</p>
        <p className="mt-1">{state.message}</p>
      </Alert>
    );
  }

  const message =
    state.result.operation === "CREATED"
      ? "บันทึกสถานะผู้ป่วยแล้ว"
      : state.result.operation === "CHANGED"
        ? "เปลี่ยนสถานะผู้ป่วยแล้ว"
        : "สถานะผู้ป่วยเป็นค่าเดียวกับข้อมูลปัจจุบัน ระบบไม่สร้างประวัติซ้ำ";

  // CREATED and CHANGED are announced by their Toast; NOOP has no Toast and stays a live status.
  return (
    <Alert className="mt-4" role={state.result.operation === "NOOP" ? "status" : "none"} variant="success">
      {message}
    </Alert>
  );
}

export function PatientClassificationView({
  context,
}: PatientClassificationViewProps): React.JSX.Element {
  const router = useRouter();
  const relationshipId = context.patient.patientHospitalRelationshipId;
  const activeRelationshipId = useRef(relationshipId);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    activeRelationshipId.current = relationshipId;
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [relationshipId]);

  // Classification is classified and announced here, once per awaited submission, so retained
  // action state, rerenders and remounts can never replay a Toast or a refresh.
  const setAndNotify = async (
    previous: PatientClassificationActionState,
    formData: FormData,
  ): Promise<PatientClassificationActionState> => {
    const submittedRelationshipId = formData.get("patientHospitalRelationshipId");
    const submittedClassification = formData.get("classification");
    try {
      const result = await setPatientClassificationAction(previous, formData);

      if (result.status === "IDLE" || (result.status === "ERROR" && result.code === "UNAVAILABLE")) {
        throw new UnconfirmedClassification();
      }
      if (
        result.status === "SUCCESS" &&
        (result.result.classification !== submittedClassification ||
          (result.result.operation !== "CREATED" &&
            result.result.operation !== "CHANGED" &&
            result.result.operation !== "NOOP"))
      ) {
        throw new UnconfirmedClassification();
      }

      const current = mounted.current && activeRelationshipId.current === submittedRelationshipId;
      if (!current) {
        return result;
      }
      if (result.status === "SUCCESS") {
        if (result.result.operation === "CREATED") {
          notify.success("บันทึกสถานะผู้ป่วยแล้ว");
        } else if (result.result.operation === "CHANGED") {
          notify.success("เปลี่ยนสถานะผู้ป่วยแล้ว");
        }
        router.refresh();
      } else if (result.code === "CONFLICT") {
        notify.warning("สถานะผู้ป่วยเปลี่ยนแปลงแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
        router.refresh();
      } else if (result.code === "FORBIDDEN") {
        notify.error("ไม่มีสิทธิ์เปลี่ยนสถานะผู้ป่วยนี้");
      }
      return result;
    } finally {
      inFlight.current = false;
    }
  };

  const [state, dispatchClassification, pending, unknownOutcome] = useMutationActionState<
    PatientClassificationActionState,
    FormData
  >(setAndNotify, initialPatientClassificationActionState);
  const [selectedClassification, setSelectedClassification] = useState<PatientClassificationType | "">(
    context.current?.classification ?? "",
  );
  const requiresConfirmation = Boolean(
    context.current && selectedClassification && selectedClassification !== context.current.classification,
  );
  // ConfirmableActionForm reports an unconfirmed result itself, but only for a submission it
  // confirmed; the create path has no confirmation, so it needs its own recovery message.
  const [confirmedSubmission, setConfirmedSubmission] = useState(false);
  const action = useCallback(
    (formData: FormData): void => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      setConfirmedSubmission(requiresConfirmation);
      dispatchClassification(formData);
    },
    [dispatchClassification, requiresConfirmation],
  );

  return (
    <section className="mt-6">
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">สถานะผู้ป่วย</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              สถานะปัจจุบันของผู้ป่วย ใช้สำหรับการคัดกรองและรายงานการดูแล
            </p>
          </div>
          <StatusBadge variant={context.current ? "info" : "neutral"}>
            {getPatientClassificationLabel(context.current?.classification)}
          </StatusBadge>
        </div>

        {context.canManage ? (
          <ConfirmableActionForm
            action={action}
            className="mt-5 border-t border-border pt-5"
            confirmation={{
              title: "ยืนยันการเปลี่ยนสถานะผู้ป่วย",
              description: context.current && selectedClassification
                ? `เปลี่ยนจาก “${getPatientClassificationLabel(context.current.classification)}” เป็น “${getPatientClassificationLabel(selectedClassification)}” หรือไม่`
                : "ยืนยันการบันทึกสถานะผู้ป่วย",
              confirmLabel: "เปลี่ยนสถานะ",
            }}
            outcome={unknownOutcome ? "unknown" : state.status === "SUCCESS" ? "success" : state.status === "ERROR" ? "error" : "idle"}
            pending={pending}
            requiresConfirmation={requiresConfirmation}
            resultKey={state}
          >
            <input
              name="patientHospitalRelationshipId"
              type="hidden"
              value={context.patient.patientHospitalRelationshipId}
            />
            <label className="block max-w-sm space-y-2 text-sm font-semibold" htmlFor="patient-classification">
              <span>เปลี่ยนสถานะ</span>
              <Select
                disabled={pending || unknownOutcome}
                id="patient-classification"
                name="classification"
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "RISK" || value === "DIABETES") {
                    setSelectedClassification(value);
                  }
                }}
                required
                value={selectedClassification}
              >
                <option disabled value="">เลือกสถานะผู้ป่วย</option>
                <option value="RISK">กลุ่มเสี่ยง</option>
                <option value="DIABETES">เบาหวาน</option>
              </Select>
            </label>
            <p className="mt-2 max-w-xl text-xs leading-5 text-text-muted">
              การเลือกค่าเดิมจะไม่สร้างประวัติซ้ำ การเปลี่ยนค่าจะบันทึกผู้ดำเนินการและเวลาจากระบบ
            </p>
            <Button className="mt-4" disabled={pending || unknownOutcome} loading={pending} type="submit" variant="secondary">
              {pending
                ? "กำลังบันทึก..."
                : context.current && selectedClassification !== context.current.classification
                  ? "ยืนยันเปลี่ยนสถานะ"
                  : "บันทึกสถานะ"}
            </Button>
            <ActionFeedback state={state} />
            <UnknownOutcomeAlert active={unknownOutcome && !confirmedSubmission} className="mt-4" recovery={{ kind: "reload" }} />
          </ConfirmableActionForm>
        ) : null}

        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-base font-semibold text-text">ประวัติการเปลี่ยนสถานะ</h3>
          {context.history.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <thead className="bg-canvas text-xs font-semibold text-text-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3" scope="col">วันที่/เวลา</th>
                    <th className="whitespace-nowrap px-3 py-3" scope="col">สถานะเดิม</th>
                    <th className="whitespace-nowrap px-3 py-3" scope="col">สถานะใหม่</th>
                    <th className="whitespace-nowrap px-3 py-3" scope="col">ผู้ดำเนินการ</th>
                    <th className="whitespace-nowrap px-3 py-3" scope="col">แหล่งที่มา</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {context.history.map((item, index) => (
                    <tr key={`${item.changedAt.toISOString()}-${index}`}>
                      <td className="whitespace-nowrap px-3 py-3 text-text-muted">{formatDateTime(item.changedAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-text-muted">
                        {getPatientClassificationLabel(item.fromClassification)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-text">
                        {getPatientClassificationLabel(item.toClassification)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-text-muted">{item.changedByDisplayName}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-text-muted">
                        {patientClassificationSourceLabels[item.source]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-text-muted">ยังไม่มีประวัติการจัดประเภทผู้ป่วย</p>
          )}
        </div>
      </Panel>
    </section>
  );
}
