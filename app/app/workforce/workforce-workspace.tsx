"use client";

import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button, buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import type {
  WorkforceHospital,
  WorkforceListResult,
  WorkforceListRow,
} from "@/modules/workforce/services/workforce-service";

export type WorkforceTab = "staff" | "osm" | "pending";

type WorkforceWorkspaceProps = {
  hospitals: WorkforceHospital[];
  selectedHospitalId: string;
  workforce: WorkforceListResult;
  tab: WorkforceTab;
};

const kindName = (row: WorkforceListRow): string => row.kind === "OSM"
  ? "อสม."
  : `บุคลากรโรงพยาบาล · ${row.profession ? {
      DOCTOR: "แพทย์",
      NURSE: "พยาบาล",
      COORDINATOR: "ผู้ประสานงาน",
      OTHER: "อื่น ๆ",
    }[row.profession] : "ยังไม่ระบุวิชาชีพ"}`;

function statusFor(row: WorkforceListRow): { label: string; variant: StatusVariant } {
  if (row.relationshipStatus === "ENDED") return { label: "นำออกจากระบบถาวรแล้ว", variant: "neutral" };
  if (row.accountStatus === "SUSPENDED" || row.relationshipStatus === "SUSPENDED") {
    return { label: "ถูกระงับ", variant: "danger" };
  }
  if (row.accountStatus === "ACTIVE" && row.relationshipStatus === "ACTIVE") {
    return { label: "พร้อมใช้งาน", variant: "success" };
  }
  if (row.accountStatus === "INVITED" || row.relationshipStatus === "INVITED") {
    return { label: "รอตอบรับคำเชิญ", variant: "neutral" };
  }
  return { label: row.activationStatus === "IN_PROGRESS" ? "กำลังเปิดใช้งาน" : "รอเปิดใช้งาน", variant: "warning" };
}

function directoryHref(
  selectedHospitalId: string,
  tab: WorkforceTab,
  search: string,
  status: string | null,
  selfRegistration: "ALL" | "SELF_REGISTERED",
  cursors: { staffCursor: string | null; osmCursor: string | null },
): string {
  const params = new URLSearchParams({ hospitalId: selectedHospitalId, tab });
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (selfRegistration !== "ALL") params.set("selfRegistration", selfRegistration);
  if (cursors.staffCursor) params.set("staffCursor", cursors.staffCursor);
  if (cursors.osmCursor) params.set("osmCursor", cursors.osmCursor);
  return `/app/workforce?${params.toString()}`;
}

export function WorkforceWorkspace({
  hospitals,
  selectedHospitalId,
  workforce,
  tab,
}: WorkforceWorkspaceProps): React.JSX.Element {
  const router = useRouter();
  const [hospitalSwitching, startHospitalSwitch] = useTransition();
  const pageInfo = workforce.pageInfo;
  const rows = workforce.rows.filter((row) => {
    if (tab === "staff") return row.kind === "HOSPITAL_MEMBER";
    if (tab === "osm") return row.kind === "OSM";
    return row.activationRequired;
  });
  const selectedTitle = tab === "staff" ? "บุคลากรโรงพยาบาล" : tab === "osm" ? "อสม." : "รอเปิดใช้งาน";
  const importParams = new URLSearchParams({ hospitalId: selectedHospitalId });
  if (pageInfo.search) importParams.set("search", pageInfo.search);
  if (pageInfo.status) importParams.set("status", pageInfo.status);
  if (pageInfo.staffCursor) importParams.set("staffCursor", pageInfo.staffCursor);
  if (pageInfo.osmCursor) importParams.set("osmCursor", pageInfo.osmCursor);
  const importHref = `/app/workforce/import?${importParams.toString()}`;
  const addHref = `/app/workforce/new?hospitalId=${encodeURIComponent(selectedHospitalId)}&step=1`;

  return (
    <div className="content-workspace break-words">
      <PageHeader
        actions={<Link className={buttonClassName({ variant: "primary" })} href={addHref}>เพิ่มบุคลากร / อสม.</Link>}
        breadcrumbs={[
          { label: "งานโรงพยาบาล", href: `/app?hospitalId=${encodeURIComponent(selectedHospitalId)}` },
          { label: "จัดการบุคลากร" },
        ]}
        description="จัดการรายชื่อบุคลากรโรงพยาบาลและ อสม. ในโรงพยาบาลที่คุณเป็นเจ้าของ"
        title="จัดการบุคลากรโรงพยาบาล"
      />

      <div className="pt-8">
        <Panel>
          <label className="block text-sm font-semibold text-ink" htmlFor="targetHospitalId">
            โรงพยาบาลที่จัดการ
          </label>
          <Select
            className="mt-2 max-w-xl"
            disabled={hospitalSwitching}
            id="targetHospitalId"
            onChange={(event) => {
              const params = new URLSearchParams({ hospitalId: event.target.value, tab });
              if (pageInfo.search) params.set("search", pageInfo.search);
              if (pageInfo.status) params.set("status", pageInfo.status);
              if (pageInfo.selfRegistration !== "ALL") params.set("selfRegistration", pageInfo.selfRegistration);
              startHospitalSwitch(() => router.push(`/app/workforce?${params.toString()}`));
            }}
            value={selectedHospitalId}
          >
            {hospitals.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>{hospital.name}</option>
            ))}
          </Select>
          {hospitalSwitching ? <p className="mt-2 text-sm text-text-muted" role="status">กำลังเปลี่ยนโรงพยาบาล...</p> : null}
          <p className="mt-2 text-sm leading-6 text-muted">
            รายชื่อและการดำเนินการเป็นของ {workforce.hospital.name} เท่านั้น ใช้สิทธิ์เจ้าของโรงพยาบาลโดยตรง ไม่ใช่รายชื่อผู้ใช้ทั้งระบบ
          </p>
        </Panel>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link className={buttonClassName({ variant: "secondary" })} href={importHref}>นำเข้าหลายคน / พิมพ์ใบ</Link>
          <Link className={buttonClassName({ variant: "primary" })} href={addHref}>เพิ่มบุคลากร / อสม.</Link>
        </div>

        <nav aria-label="ประเภทบุคลากร" className="mt-6 flex flex-wrap gap-2 border-b border-line">
          {([
            ["staff", "บุคลากร"],
            ["osm", "อสม."],
            ["pending", `รอเปิดใช้งาน (${workforce.pendingCount})`],
          ] as const).map(([value, label]) => (
            <Link
              aria-current={tab === value ? "page" : undefined}
              className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold ${tab === value ? "border-action-primary text-brand-strong" : "border-transparent text-text-muted hover:text-text"}`}
              href={directoryHref(selectedHospitalId, value, pageInfo.search, pageInfo.status, pageInfo.selfRegistration, {
                staffCursor: pageInfo.staffCursor,
                osmCursor: pageInfo.osmCursor,
              })}
              key={value}
            >
              {label}
            </Link>
          ))}
        </nav>

        <Panel className="mt-6">
          <Form action="/app/workforce" className="grid gap-4 sm:grid-cols-[1fr_16rem_16rem_auto] sm:items-end">
            <input name="hospitalId" type="hidden" value={selectedHospitalId} />
            <input name="tab" type="hidden" value={tab} />
            <label className="block space-y-2 text-sm font-semibold" htmlFor="workforce-search">
              <span>ค้นหาชื่อ</span>
              <Input defaultValue={pageInfo.search} id="workforce-search" maxLength={120} name="search" type="search" />
            </label>
            <label className="block space-y-2 text-sm font-semibold" htmlFor="workforce-status">
              <span>สถานะความสัมพันธ์</span>
              <Select defaultValue={pageInfo.status ?? ""} id="workforce-status" name="status">
                <option value="">ทุกสถานะ</option>
                <option value="PROVISIONED">รอเปิดใช้งาน</option>
                <option value="INVITED">รอตอบรับ</option>
                <option value="ACTIVE">ใช้งานอยู่</option>
                <option value="SUSPENDED">ถูกระงับ</option>
                <option value="ENDED">นำออกแล้ว</option>
              </Select>
            </label>
            <label className="block space-y-2 text-sm font-semibold" htmlFor="workforce-self-registration">
              <span>ลงทะเบียนด้วยตนเอง</span>
              <Select defaultValue={pageInfo.selfRegistration} id="workforce-self-registration" name="selfRegistration">
                <option value="ALL">ทุกคน</option>
                <option value="SELF_REGISTERED">ลงทะเบียนเองแล้ว</option>
              </Select>
            </label>
            <Button type="submit">ค้นหา</Button>
          </Form>
          <p className="mt-3 text-sm text-muted">แสดงครั้งละไม่เกิน {pageInfo.pageSize} รายการต่อประเภท</p>
        </Panel>

        <section className="mt-6 min-w-0 overflow-hidden rounded-panel border border-border bg-surface" aria-labelledby="workforce-roster-heading">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
            <h2 className="text-xl font-semibold tracking-[-0.02em]" id="workforce-roster-heading">{selectedTitle}</h2>
            <StatusBadge>{rows.length} รายการ</StatusBadge>
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm leading-6 text-muted sm:px-6">
              {tab === "pending" ? "ไม่มีรายชื่อที่รอเปิดใช้งาน" : "ไม่พบรายการในหน้านี้หรือไม่ตรงกับการค้นหา"}
            </p>
          ) : (
            <ul>
              {rows.map((row) => {
                const status = statusFor(row);
                const kindPath = row.kind === "OSM" ? "osm" : "staff";
                return (
                  <li className="flex flex-col gap-3 border-t border-line px-4 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:px-6" key={`${row.kind}-${row.id}`}>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{row.displayName}</p>
                      <p className="mt-1 text-sm text-muted">{kindName(row)}</p>
                      {row.activationExpiresAt ? (
                        <p className="mt-1 text-xs text-muted">ลิงก์ล่าสุดหมดอายุ {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(row.activationExpiresAt)}</p>
                      ) : null}
                      {row.selfRegisteredAt ? (
                        <p className="mt-1 text-xs font-medium text-brand-strong">ลงทะเบียนเองเมื่อ {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(row.selfRegisteredAt)}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                      <Link
                        className={buttonClassName({ variant: "secondary", size: "compact" })}
                        href={`/app/workforce/${kindPath}/${encodeURIComponent(row.id)}`}
                      >
                        ดูรายละเอียด
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <nav aria-label={`หน้ารายชื่อ${selectedTitle}`} className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-4 sm:px-6">
            {tab !== "osm" && pageInfo.staffNextCursor ? (
              <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={directoryHref(selectedHospitalId, tab, pageInfo.search, pageInfo.status, pageInfo.selfRegistration, { staffCursor: pageInfo.staffNextCursor, osmCursor: pageInfo.osmCursor })}>หน้าถัดไป · บุคลากร</Link>
            ) : null}
            {tab !== "staff" && pageInfo.osmNextCursor ? (
              <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={directoryHref(selectedHospitalId, tab, pageInfo.search, pageInfo.status, pageInfo.selfRegistration, { staffCursor: pageInfo.staffCursor, osmCursor: pageInfo.osmNextCursor })}>หน้าถัดไป · อสม.</Link>
            ) : null}
            {(!pageInfo.staffNextCursor || tab === "osm") && (!pageInfo.osmNextCursor || tab === "staff") ? <span className="text-sm text-muted">สิ้นสุดรายการ</span> : null}
            {(pageInfo.staffCursor || pageInfo.osmCursor) ? (
              <Link className="text-sm font-semibold underline" href={directoryHref(selectedHospitalId, tab, pageInfo.search, pageInfo.status, pageInfo.selfRegistration, { staffCursor: null, osmCursor: null })}>กลับหน้าแรก</Link>
            ) : null}
          </nav>
        </section>
      </div>
    </div>
  );
}
