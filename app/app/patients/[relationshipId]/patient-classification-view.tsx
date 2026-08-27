"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
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

  return (
    <Alert className="mt-4" variant="success">
      {message}
    </Alert>
  );
}

export function PatientClassificationView({
  context,
}: PatientClassificationViewProps): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<PatientClassificationActionState, FormData>(
    setPatientClassificationAction,
    initialPatientClassificationActionState,
  );
  const [selectedClassification, setSelectedClassification] = useState<PatientClassificationType | "">(
    context.current?.classification ?? "",
  );

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.refresh();
    }
  }, [router, state]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    const currentClassification = context.current?.classification ?? null;

    if (
      currentClassification !== null &&
      selectedClassification !== "" &&
      selectedClassification !== currentClassification &&
      !window.confirm(
        `ยืนยันเปลี่ยนสถานะผู้ป่วยจาก “${getPatientClassificationLabel(currentClassification)}” เป็น “${getPatientClassificationLabel(selectedClassification)}” หรือไม่`,
      )
    ) {
      event.preventDefault();
    }
  }

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

        <p className="mt-4 border-l-2 border-amber-300 pl-3 text-sm leading-6 text-text-muted">
          สถานะนี้เป็นสถานะปัจจุบันของผู้ป่วยและใช้ร่วมกันทุกโรงพยาบาลที่ดูแลผู้ป่วยรายนี้
        </p>

        {context.canManage ? (
          <form action={action} className="mt-5 border-t border-border pt-5" onSubmit={handleSubmit}>
            <input
              name="patientHospitalRelationshipId"
              type="hidden"
              value={context.patient.patientHospitalRelationshipId}
            />
            <label className="block max-w-sm space-y-2 text-sm font-semibold" htmlFor="patient-classification">
              <span>เปลี่ยนสถานะ</span>
              <Select
                disabled={pending}
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
            <Button className="mt-4" disabled={pending} loading={pending} type="submit">
              {pending
                ? "กำลังบันทึก..."
                : context.current && selectedClassification !== context.current.classification
                  ? "ยืนยันเปลี่ยนสถานะ"
                  : "บันทึกสถานะ"}
            </Button>
            <ActionFeedback state={state} />
          </form>
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
