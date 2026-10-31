import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import type { HomeSectionResult } from "@/components/home/load-home-section";
import type { HospitalOwnerInvitationForActor } from "@/modules/hospital-service-areas/services/child-facility-service";
import {
  acceptChildOwnerInvitationAction,
  declineChildOwnerInvitationAction,
} from "@/modules/hospital-service-areas/transport/server-actions";

function invitationCopy(invitation: HospitalOwnerInvitationForActor): {
  source: string;
  scope: string;
  acceptDescription: string;
  declineDescription: string;
} {
  if (invitation.kind === "PARENT") {
    // ADR-0024: platform ADMIN invites the first or replacement OWNER of a Parent Hospital.
    return {
      source: `จาก ผู้ดูแลระบบ DEMI · รหัสโรงพยาบาล ${invitation.hospital.hospitalCode}`,
      scope: "เมื่อตอบรับ คุณจะเป็นผู้ดูแลของโรงพยาบาลนี้ จัดการบุคลากร อสม. และเครือข่ายลูกข่ายของโรงพยาบาลเอง และโรงพยาบาลจะเปิดใช้งาน",
      acceptDescription: "บัญชีของคุณจะได้รับสิทธิ์ผู้ดูแลโรงพยาบาลนี้ทันที",
      declineDescription: "ผู้ดูแลระบบ DEMI จะเห็นว่าคุณปฏิเสธ และต้องเชิญใหม่หากเปลี่ยนใจ",
    };
  }
  return {
    source: `จาก ${invitation.parent.name} (แม่ข่าย) · รหัสหน่วยบริการ ${invitation.hospital.hospitalCode}`,
    scope: "เมื่อตอบรับ คุณจะเป็นผู้ดูแลของหน่วยบริการนี้ จัดการบุคลากรและ อสม. ของหน่วยบริการเอง และหน่วยบริการจะเปิดใช้งานในเครือข่ายของแม่ข่าย",
    acceptDescription: "บัญชีของคุณจะได้รับสิทธิ์ผู้ดูแลหน่วยบริการนี้ทันที",
    declineDescription: "แม่ข่ายจะเห็นว่าคุณปฏิเสธ และต้องเชิญใหม่หากเปลี่ยนใจ",
  };
}

/**
 * ADR-0018 (O-D6) / ADR-0024: an OWNER invitation addressed to this ACTIVE account, from a Parent OWNER for its Child or
 * from platform ADMIN for a Parent Hospital. Nothing is granted until the person accepts here, in their own session;
 * the server re-checks the invitation on every answer.
 */
export function ChildOwnerInvitations({
  invitations,
}: {
  invitations: HomeSectionResult<HospitalOwnerInvitationForActor[]>;
}): React.JSX.Element | null {
  if (invitations.status === "FAILED") {
    return (
      <Alert className="mt-8" variant="warning">
        โหลดคำเชิญเป็นผู้ดูแลไม่สำเร็จ กรุณาโหลดหน้าใหม่ภายหลัง
      </Alert>
    );
  }
  if (invitations.value.length === 0) return null;

  return (
    <section aria-labelledby="child-owner-invitations-heading" className="mt-8 min-w-0">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="child-owner-invitations-heading">
        คำเชิญที่รอคุณตอบรับ
      </h2>
      <ul className="mt-4 grid min-w-0 gap-4">
        {invitations.value.map((invitation) => {
          const copy = invitationCopy(invitation);
          return (
            <li className="min-w-0" key={invitation.membershipId}>
              <Panel aria-labelledby={`child-owner-invitation-${invitation.membershipId}`} className="min-w-0">
                <h3 className="break-words text-lg font-semibold text-text" id={`child-owner-invitation-${invitation.membershipId}`}>
                  คำเชิญเป็นผู้ดูแล {invitation.hospital.name}
                </h3>
                <p className="mt-1 break-words text-sm leading-6 text-text-muted">{copy.source}</p>
                <p className="mt-2 text-sm leading-6 text-text">{copy.scope}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <NetworkMutationForm
                    action={acceptChildOwnerInvitationAction}
                    confirmation={{
                      title: `ตอบรับเป็นผู้ดูแล ${invitation.hospital.name} หรือไม่`,
                      description: copy.acceptDescription,
                      confirmLabel: "ตอบรับ",
                    }}
                    hidden={{ membershipId: invitation.membershipId }}
                    submitLabel="ตอบรับ"
                    submitVariant="primary"
                  />
                  <NetworkMutationForm
                    action={declineChildOwnerInvitationAction}
                    confirmation={{
                      title: `ปฏิเสธคำเชิญของ ${invitation.hospital.name} หรือไม่`,
                      description: copy.declineDescription,
                      confirmLabel: "ปฏิเสธ",
                      destructive: true,
                    }}
                    hidden={{ membershipId: invitation.membershipId }}
                    submitLabel="ปฏิเสธ"
                    submitVariant="ghost"
                  />
                </div>
              </Panel>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
