import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import type { HomeSectionResult } from "@/components/home/load-home-section";
import type { ChildOwnerInvitationForActor } from "@/modules/hospital-service-areas/services/child-facility-service";
import {
  acceptChildOwnerInvitationAction,
  declineChildOwnerInvitationAction,
} from "@/modules/hospital-service-areas/transport/server-actions";

/**
 * ADR-0018 (O-D6): an OWNER invitation addressed to this ACTIVE account. Nothing is granted until the person accepts
 * here, in their own session; the server re-checks the invitation on every answer.
 */
export function ChildOwnerInvitations({
  invitations,
}: {
  invitations: HomeSectionResult<ChildOwnerInvitationForActor[]>;
}): React.JSX.Element | null {
  if (invitations.status === "FAILED") {
    return (
      <Alert className="mt-8" variant="warning">
        โหลดคำเชิญเป็นผู้ดูแลหน่วยบริการไม่สำเร็จ กรุณาโหลดหน้าใหม่ภายหลัง
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
        {invitations.value.map((invitation) => (
          <li className="min-w-0" key={invitation.membershipId}>
            <Panel aria-labelledby={`child-owner-invitation-${invitation.membershipId}`} className="min-w-0">
              <h3 className="break-words text-lg font-semibold text-text" id={`child-owner-invitation-${invitation.membershipId}`}>
                คำเชิญเป็นผู้ดูแล {invitation.child.name}
              </h3>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                จาก {invitation.parent.name} (แม่ข่าย) · รหัสหน่วยบริการ {invitation.child.hospitalCode}
              </p>
              <p className="mt-2 text-sm leading-6 text-text">
                เมื่อตอบรับ คุณจะเป็นผู้ดูแลของหน่วยบริการนี้ จัดการบุคลากรและ อสม. ของหน่วยบริการเอง และหน่วยบริการจะเปิดใช้งานในเครือข่ายของแม่ข่าย
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <NetworkMutationForm
                  action={acceptChildOwnerInvitationAction}
                  confirmation={{
                    title: `ตอบรับเป็นผู้ดูแล ${invitation.child.name} หรือไม่`,
                    description: "บัญชีของคุณจะได้รับสิทธิ์ผู้ดูแลหน่วยบริการนี้ทันที",
                    confirmLabel: "ตอบรับ",
                  }}
                  hidden={{ membershipId: invitation.membershipId }}
                  submitLabel="ตอบรับ"
                  submitVariant="primary"
                />
                <NetworkMutationForm
                  action={declineChildOwnerInvitationAction}
                  confirmation={{
                    title: `ปฏิเสธคำเชิญของ ${invitation.child.name} หรือไม่`,
                    description: "แม่ข่ายจะเห็นว่าคุณปฏิเสธ และต้องเชิญใหม่หากเปลี่ยนใจ",
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
        ))}
      </ul>
    </section>
  );
}
