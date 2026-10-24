"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { Alert } from "@/components/ui/alert";
import { workforceContactPhoneSchema } from "@/modules/workforce/schemas/workforce-schemas";
import { updateWorkforceContactPhoneAction, type WorkforceContactPhoneActionState } from "@/modules/workforce/transport/server-actions";
import { classifyWorkforceState, formString, standardNotice, useScopedMutation, useScopedMutationSession, workforceStateMessage } from "../../scoped-mutation";

const initialState: WorkforceContactPhoneActionState = { status: "IDLE" };
const notice = standardNotice({ success: "บันทึกเบอร์ติดต่อแล้ว", conflict: "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด", forbidden: "ไม่มีสิทธิ์แก้ไขเบอร์ติดต่อ" });

export function WorkforceContactPhoneControl(props: {
  kind: "staff" | "osm";
  relationshipId: string;
  targetHospitalId: string;
  expectedUpdatedAt: string;
  contactPhone: string | null;
  ended: boolean;
}): React.JSX.Element {
  const session = useScopedMutationSession<WorkforceContactPhoneActionState>({ scope: props.relationshipId, snapshot: props.expectedUpdatedAt, refreshOnSuccess: true });
  const mutation = useScopedMutation(session, {
    kind: "contact-phone", action: updateWorkforceContactPhoneAction, initialState,
    classify: (state, formData) => classifyWorkforceState(state, state.status === "SUCCESS" && state.result.relationshipId === formString(formData, "relationshipId") && state.result.hospitalId === formString(formData, "targetHospitalId")),
    notice, message: workforceStateMessage,
    resultSnapshot: (state) => state.status === "SUCCESS" ? state.result.updatedAt : null,
  });
  return <Panel>
    <h2 className="text-lg font-semibold">เบอร์ติดต่อ</h2>
    <p className="mt-2 text-sm text-muted">{props.contactPhone ?? "ยังไม่ได้ระบุเบอร์ติดต่อ"}</p>
    {!props.ended ? <form action={mutation.action} className="mt-4 space-y-4" onSubmit={(event) => {
      const input = event.currentTarget.elements.namedItem("contactPhone");
      if (input instanceof HTMLInputElement) {
        const parsed = workforceContactPhoneSchema.safeParse(input.value);
        input.setCustomValidity(parsed.success ? "" : parsed.error.issues[0].message);
        if (!input.reportValidity()) event.preventDefault();
      }
    }}>
      <input name="kind" type="hidden" value={props.kind} />
      <input name="relationshipId" type="hidden" value={props.relationshipId} />
      <input name="targetHospitalId" type="hidden" value={props.targetHospitalId} />
      <input name="expectedUpdatedAt" type="hidden" value={props.expectedUpdatedAt} />
      <label className="block space-y-2 text-sm font-semibold"><span>เบอร์ติดต่อใหม่</span>
        <Input key={props.expectedUpdatedAt} name="contactPhone" defaultValue={props.contactPhone ?? ""} inputMode="tel" autoComplete="tel" maxLength={32} required disabled={mutation.pending || session.locked} onChange={(event) => event.target.setCustomValidity("")} aria-describedby={props.kind === "osm" ? "edit-osm-phone-help" : undefined} />
      </label>
      {props.kind === "osm" ? <p className="text-sm text-muted" id="edit-osm-phone-help">เบอร์นี้จะแสดงให้ผู้ป่วยที่ อสม. ดูแลเห็น</p> : null}
      {mutation.state.status === "ERROR" ? <Alert variant="danger" role="alert">{mutation.state.message}</Alert> : null}
      <UnknownOutcomeAlert active={mutation.unknownOutcome || session.unconfirmed} recovery={{ kind: "reload", label: "โหลดข้อมูลล่าสุด", message: "กรุณาตรวจสอบเบอร์ติดต่อล่าสุดก่อนบันทึกอีกครั้ง" }} />
      <Button type="submit" loading={mutation.pending} disabled={mutation.pending || session.locked}>บันทึกเบอร์ติดต่อ</Button>
    </form> : null}
  </Panel>;
}
