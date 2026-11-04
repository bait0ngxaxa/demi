import { Alert } from "@/components/ui/alert";
import type { WorkforceDetail } from "@/modules/workforce/services/workforce-service";

import { WorkforcePasswordResetControl } from "../../workforce-password-reset-control";
import { OsmRelationshipControls } from "./osm-relationship-controls";
import { StaffMembershipControls } from "./staff-membership-controls";
import { WorkforceActivationControl } from "./workforce-activation-control";
import { WorkforceReleaseControl } from "./workforce-release-control";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

/**
 * The workforce relationship actions (activation link/assist, lifecycle, grants, password reset, release). Shared by
 * the workforce detail page and the UM-1 user management detail page so both run the same controls and rules.
 */
export function WorkforceManagementControls({ detail }: { detail: WorkforceDetail }): React.JSX.Element {
  const isStaff = detail.kind === "staff";

  return (
    <>
      {detail.activationRequired ? (
        <Alert variant="warning">
          <p className="font-semibold">บัญชียังไม่เปิดใช้งาน</p>
          <p className="mt-1">
            การเปิดใช้งานบัญชีดำเนินการผ่านลิงก์เฉพาะจากโรงพยาบาล
          </p>
          {detail.activationExpiresAt ? (
            <p className="mt-1 text-sm">ลิงก์ล่าสุดหมดอายุ: {formatDate(detail.activationExpiresAt)}</p>
          ) : null}
        </Alert>
      ) : null}

      {detail.viewerScope === "OWNER" && detail.activationRequired && detail.relationshipStatus !== "ENDED" ? (
        detail.activationInProgress ? (
          <Alert variant="warning">
            <p className="font-semibold">กำลังเปิดใช้งานบัญชี</p>
            <p className="mt-1">มีการเปิดลิงก์แล้วและกำลังตรวจสอบผล กรุณารอสักครู่ หากค้างนานให้ติดต่อแอดมินโรงพยาบาลที่ส่งลิงก์</p>
          </Alert>
        ) : detail.kind === "staff" && detail.membershipType === "OWNER" ? null : (
        <WorkforceActivationControl
          key={`${detail.hospital.id}:${detail.relationshipId}`}
          activationLinkUsable={detail.activationLinkUsable}
          hospitalId={detail.hospital.id}
          kind={isStaff ? "HOSPITAL_MEMBER" : "OSM"}
          maskedName={`${Array.from(detail.displayName)[0] ?? "*"}***`}
          relationshipId={detail.relationshipId}
          userId={detail.userId}
        />
        )
      ) : null}

      {detail.viewerScope === "MEMBER" ? (
        <Alert variant="info">
          <p className="font-semibold">มุมมองสำหรับเจ้าหน้าที่โรงพยาบาล</p>
          <p className="mt-1">
            ในหน้านี้ เจ้าหน้าที่ดูข้อมูล อสม. ได้ การเปลี่ยนสิทธิ์ ยกเลิกลิงก์ และรีเซ็ตรหัสผ่านทำได้เฉพาะแอดมินโรงพยาบาล
          </p>
        </Alert>
      ) : null}

      {detail.viewerScope !== "OWNER" ? null : isStaff ? (
        <StaffMembershipControls
          accountStatus={detail.accountStatus}
          actions={detail.actions}
          expectedUpdatedAt={detail.relationshipUpdatedAt.toISOString()}
          membershipType={detail.membershipType}
          ownerGovernance={detail.ownerGovernance}
          profession={detail.profession}
          relationshipId={detail.relationshipId}
          relationshipStatus={detail.relationshipStatus}
          targetHospitalId={detail.hospital.id}
        />
      ) : (
        <OsmRelationshipControls
          accountStatus={detail.accountStatus}
          actions={detail.actions}
          currentAssignmentCount={detail.currentAssignmentCount ?? 0}
          expectedUpdatedAt={detail.relationshipUpdatedAt.toISOString()}
          lifecycleBlockReason={detail.lifecycleBlockReason}
          relationshipId={detail.relationshipId}
          relationshipStatus={detail.relationshipStatus}
          targetHospitalId={detail.hospital.id}
        />
      )}

      {detail.viewerScope === "OWNER" && detail.relationshipStatus !== "ENDED" ? (
        <WorkforcePasswordResetControl
          relationshipId={detail.relationshipId}
          targetKind={detail.kind === "staff" ? "staff" : "osm"}
          subjectLabel={isStaff ? "เจ้าหน้าที่รายนี้" : "อสม. รายนี้"}
        />
      ) : null}

      {detail.viewerScope === "OWNER" && detail.relationshipStatus !== "ENDED" ? (
        <WorkforceReleaseControl
          hospitalId={detail.hospital.id}
          hospitalName={detail.hospital.name}
          kind={detail.kind}
          relationshipId={detail.relationshipId}
          resourceName={detail.displayName}
          updatedAt={detail.relationshipUpdatedAt.toISOString()}
        />
      ) : null}
    </>
  );
}
