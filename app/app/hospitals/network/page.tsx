import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getOwnerNetworkPageContext } from "@/modules/hospital-service-areas/transport/network-page-context";
import { attachServiceAreaAction, endServiceAreaAction } from "@/modules/hospital-service-areas/transport/server-actions";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

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

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(value);
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
        description="เพิ่มหรือนำ รพ.สต. และหน่วยบริการลูกข่ายออกจากเครือข่ายของโรงพยาบาลแม่ข่าย เมื่อเพิ่มแล้วผู้ที่มีสิทธิ์ของแม่ข่ายจะดูรายชื่อและข้อมูลผู้ป่วยของลูกข่ายได้แบบอ่านอย่างเดียว"
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
              ลูกข่ายของ {selected.parent.name} ({selected.areas.length.toLocaleString("th-TH")})
            </h2>
            {selected.areas.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีลูกข่ายในเครือข่ายนี้ ค้นหาและเพิ่มลูกข่ายได้ด้านล่าง</p>
            ) : (
              <ul className="mt-4 grid min-w-0 gap-4">
                {selected.areas.map((area) => (
                  <li className="min-w-0" key={area.areaId}>
                    <Panel aria-labelledby={`network-area-${area.areaId}`} className="min-w-0">
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="break-words text-lg font-semibold text-text" id={`network-area-${area.areaId}`}>{area.child.name}</h3>
                          <p className="mt-1 text-sm text-text-muted">
                            รหัส {area.child.hospitalCode} · อยู่ในเครือข่ายตั้งแต่ {formatDate(area.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className={buttonClassName({ variant: "secondary", size: "compact" })}
                            href={`/app/patients?hospitalId=${encodeURIComponent(area.child.id)}`}
                            prefetch={false}
                          >
                            ดูผู้ป่วย
                          </Link>
                          <Link
                            className={buttonClassName({ variant: "ghost", size: "compact" })}
                            href={`/app/hospitals/reporting?target=${encodeURIComponent(`PARENT_CHILD:${selected.parent.id}:${area.child.id}`)}`}
                            prefetch={false}
                          >
                            รายงานสรุป
                          </Link>
                        </div>
                      </div>
                      <details className="mt-4 border-t border-border pt-4">
                        <summary className="cursor-pointer text-sm font-semibold text-danger">นำออกจากเครือข่าย</summary>
                        <NetworkMutationForm
                          action={endServiceAreaAction}
                          className="mt-3"
                          confirmation={{
                            title: `นำ ${area.child.name} ออกจากเครือข่ายหรือไม่`,
                            description: "สิทธิ์ดูผู้ป่วยและรายงานสรุปของลูกข่ายนี้จะสิ้นสุดทันที ข้อมูลของลูกข่ายจะไม่ถูกลบ และเพิ่มกลับได้ภายหลัง",
                            confirmLabel: "นำออกจากเครือข่าย",
                            destructive: true,
                          }}
                          hidden={{ parentHospitalId: selected.parent.id, areaId: area.areaId, confirm: "true" }}
                          submitLabel="นำออกจากเครือข่าย"
                          submitVariant="danger"
                        >
                          <label className="text-sm font-semibold text-text" htmlFor={`end-reason-${area.areaId}`}>เหตุผล</label>
                          <textarea
                            className={`${inputClassName} mt-2 min-h-24 py-3`}
                            id={`end-reason-${area.areaId}`}
                            maxLength={500}
                            name="endReason"
                            required
                          />
                        </NetworkMutationForm>
                      </details>
                    </Panel>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="network-add-heading" className="mt-10 min-w-0">
            <h2 className="text-xl font-semibold text-text" id="network-add-heading">เพิ่มลูกข่าย</h2>
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
