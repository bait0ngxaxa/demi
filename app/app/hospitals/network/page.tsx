import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getOwnerNetworkPageContext } from "@/modules/hospital-service-areas/transport/network-page-context";
import { attachServiceAreaAction, createChildFacilityAction } from "@/modules/hospital-service-areas/transport/server-actions";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { ChildFacilityPanel } from "./child-facility-panel";
import { ChildOwnerInvitationForm, ChildOwnerInviteeFields } from "./child-owner-invitation-form";

export const metadata: Metadata = { title: "จัดการลูกข่าย" };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function resolveActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

export default async function HospitalNetworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const params = await searchParams;
  const requestedHospitalId = firstParam(params.hospitalId);
  const context = await getOwnerNetworkPageContext(actor, { hospitalId: requestedHospitalId, query: firstParam(params.q) });
  if (requestedHospitalId !== undefined && !context.selected) redirect("/app/hospitals/network");
  const selected = context.selected;

  return (
    <div className="content-workspace">
      <PageHeader
        breadcrumbs={[{ label: "หน้าหลัก", href: "/app" }, { label: "จัดการลูกข่าย" }]}
        description="สร้าง รพ.สต. และหน่วยบริการลูกข่ายพร้อมเชิญผู้ดูแลคนแรก เพิ่มหรือนำลูกข่ายออกจากเครือข่าย เมื่อลูกข่ายเปิดใช้งานแล้วผู้ที่มีสิทธิ์ของแม่ข่ายจะดูรายชื่อและข้อมูลผู้ป่วยของลูกข่ายได้แบบอ่านอย่างเดียว"
        title="จัดการลูกข่าย"
      />

      {!selected ? (
        <Alert className="mt-6" variant="info">
          <p className="font-semibold">ยังไม่มีโรงพยาบาลแม่ข่ายที่คุณเป็นเจ้าของ</p>
          <p className="mt-1">
            หน้านี้ใช้ได้เมื่อผู้ดูแลระบบกำหนดให้โรงพยาบาลของคุณเป็นแม่ข่าย และคุณเป็นเจ้าของโรงพยาบาลนั้น หากข้อมูลไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ
          </p>
        </Alert>
      ) : (
        <>
          {context.parents.length > 1 ? (
            <form className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end" method="get">
              <div className="min-w-0 flex-1">
                <label className="text-sm font-semibold text-text" htmlFor="network-parent">โรงพยาบาลแม่ข่าย</label>
                <Select className="mt-2" defaultValue={selected.parent.id} id="network-parent" name="hospitalId">
                  {context.parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
                </Select>
              </div>
              <Button size="compact" type="submit" variant="secondary">เปลี่ยน</Button>
            </form>
          ) : null}

          <section aria-labelledby="network-children-heading" className="mt-8 min-w-0">
            <h2 className="text-xl font-semibold text-text" id="network-children-heading">
              ลูกข่ายของ {selected.parent.name} ({selected.children.length.toLocaleString("th-TH")})
            </h2>
            {selected.children.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีลูกข่ายในเครือข่ายนี้ สร้างหรือเพิ่มลูกข่ายได้ด้านล่าง</p>
            ) : (
              <ul className="mt-4 grid min-w-0 gap-4">
                {selected.children.map((item) => (
                  <li className="min-w-0" key={item.areaId}>
                    <ChildFacilityPanel
                      areaId={item.areaId}
                      attachedAt={item.attachedAt.toISOString()}
                      child={{ id: item.child.id, hospitalCode: item.child.hospitalCode, name: item.child.name, updatedAt: item.child.updatedAt.toISOString() }}
                      invitation={item.invitation ? {
                        inviteeName: item.invitation.inviteeName,
                        delivery: item.invitation.delivery,
                        link: { ...item.invitation.link, expiresAt: item.invitation.link.expiresAt?.toISOString() ?? null },
                      } : null}
                      lastDeclinedAt={item.lastDeclinedAt?.toISOString() ?? null}
                      parentHospitalId={selected.parent.id}
                      registeredByThisParent={item.registeredByThisParent}
                      state={item.state}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="network-create-heading" className="mt-10 min-w-0">
            <h2 className="text-xl font-semibold text-text" id="network-create-heading">สร้างลูกข่ายใหม่</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              สร้าง รพ.สต. หรือหน่วยบริการที่ยังไม่มีในระบบ หน่วยบริการจะอยู่ในเครือข่ายนี้ทันทีในสถานะรอเปิดใช้งาน และเปิดใช้งานเมื่อผู้ดูแลคนแรกยืนยันตัวตนด้วยเลขบัตรประชาชนของตนเอง ผู้ดูแลของลูกข่ายจะจัดการบุคลากรและ อสม. ของหน่วยบริการเอง
            </p>
            <Panel className="mt-4 min-w-0">
              <ChildOwnerInvitationForm
                action={createChildFacilityAction}
                // Rendered per request: a replay of this submission returns the facility it already created.
                hidden={{ parentHospitalId: selected.parent.id, submissionNonce: randomUUID() }}
                idempotent
                submitLabel="สร้างลูกข่ายและเชิญผู้ดูแล"
                submitVariant="primary"
              >
                <div className="max-w-xl min-w-0">
                  <label className="text-sm font-semibold text-text" htmlFor="create-child-name">ชื่อหน่วยบริการ</label>
                  <Input className="mt-2" id="create-child-name" maxLength={200} name="name" required />
                  <p className="mt-1 text-xs text-text-muted">ระบบสร้างรหัสหน่วยบริการให้อัตโนมัติ</p>
                </div>
                <h3 className="mt-6 text-base font-semibold text-text">ผู้ดูแลคนแรก</h3>
                <div className="mt-3">
                  <ChildOwnerInviteeFields idPrefix="create-child" />
                </div>
              </ChildOwnerInvitationForm>
            </Panel>
          </section>

          <section aria-labelledby="network-add-heading" className="mt-10 min-w-0">
            <h2 className="text-xl font-semibold text-text" id="network-add-heading">เพิ่มลูกข่ายที่มีในระบบแล้ว</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              แสดงเฉพาะหน่วยบริการประเภทลูกข่ายที่ผู้ดูแลระบบเพิ่มไว้ ขึ้นทะเบียนใช้งานแล้ว และยังไม่มีแม่ข่าย หากหน่วยบริการที่ต้องการมีแม่ข่ายอื่นอยู่แล้ว กรุณาติดต่อผู้ดูแลระบบเพื่อโอนย้าย
            </p>
            <form className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end" method="get">
              {context.parents.length > 1 ? <input name="hospitalId" type="hidden" value={selected.parent.id} /> : null}
              <div className="min-w-0 flex-1">
                <label className="text-sm font-semibold text-text" htmlFor="network-candidate-query">ค้นหาชื่อหรือรหัส</label>
                <Input className="mt-2" defaultValue={selected.query} id="network-candidate-query" maxLength={100} name="q" />
              </div>
              <Button size="compact" type="submit" variant="secondary">ค้นหา</Button>
            </form>
            {selected.candidates.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-text-muted">
                {selected.query ? "ไม่พบหน่วยบริการที่ตรงกับคำค้นหาและเพิ่มได้" : "ยังไม่มีหน่วยบริการที่เพิ่มเป็นลูกข่ายได้"}
              </p>
            ) : (
              <ul className="mt-4 grid min-w-0 gap-3">
                {selected.candidates.map((candidate) => (
                  <li className="min-w-0" key={candidate.id}>
                    <Panel className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-text">{candidate.name}</p>
                        <p className="mt-1 text-sm text-text-muted">รหัส {candidate.hospitalCode}</p>
                      </div>
                      <NetworkMutationForm
                        action={attachServiceAreaAction}
                        hidden={{ parentHospitalId: selected.parent.id, childHospitalId: candidate.id }}
                        submitLabel="เพิ่มเป็นลูกข่าย"
                        submitVariant="primary"
                      />
                    </Panel>
                  </li>
                ))}
              </ul>
            )}
            {selected.hasMoreCandidates ? (
              <p className="mt-3 text-sm text-text-muted">แสดงบางส่วน พิมพ์ชื่อหรือรหัสเพื่อค้นหาให้แคบลง</p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
