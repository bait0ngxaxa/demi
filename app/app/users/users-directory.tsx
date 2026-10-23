"use client";

import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ActivationMethodFilter, UserDirectoryStatus, UserKind } from "@/modules/user-management/domain/user-management-values";
import type { UserDirectoryPage } from "@/modules/user-management/services/user-directory-service";

import { ACTIVATION_METHOD_LABELS, USER_KIND_LABELS, USER_STATUS_PRESENTATION } from "./user-presentation";

export type UsersDirectoryFilters = {
  kind: UserKind;
  status: UserDirectoryStatus | null;
  method: ActivationMethodFilter | null;
  search: string;
  cursor: string | null;
};

function directoryHref(hospitalId: string, filters: UsersDirectoryFilters, overrides: Partial<UsersDirectoryFilters> = {}): string {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams({ hospitalId, tab: next.kind });
  if (next.status) params.set("status", next.status);
  if (next.method) params.set("method", next.method);
  if (next.search) params.set("search", next.search);
  if (next.cursor) params.set("cursor", next.cursor);
  return `/app/users?${params.toString()}`;
}

const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

export function UsersDirectory({ hospitals, page, filters }: {
  hospitals: { id: string; name: string }[];
  page: UserDirectoryPage;
  filters: UsersDirectoryFilters;
}): React.JSX.Element {
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  const hospitalId = page.hospital.id;
  const kindLabel = USER_KIND_LABELS[filters.kind];

  return (
    <div className="content-workspace break-words">
      <PageHeader
        breadcrumbs={[
          { label: "งานโรงพยาบาล", href: `/app#hospital-workspace-${encodeURIComponent(hospitalId)}` },
          { label: "จัดการผู้ใช้งาน" },
        ]}
        description="ตรวจสอบ แก้ไข ลบรายการที่ยังไม่ได้ใช้ และนำบุคลากร อสม. และผู้ป่วยออกจากระบบ"
        title="จัดการผู้ใช้งาน"
      />

      <div className="pt-8">
        <Panel>
          <label className="block text-sm font-semibold text-ink" htmlFor="users-hospital">โรงพยาบาลที่จัดการ</label>
          <Select
            className="mt-2 max-w-xl"
            disabled={switching}
            id="users-hospital"
            onChange={(event) => startSwitch(() => router.push(directoryHref(event.target.value, filters, { cursor: null })))}
            value={hospitalId}
          >
            {hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name}</option>)}
          </Select>
          {switching ? <p className="mt-2 text-sm text-text-muted" role="status">กำลังเปลี่ยนโรงพยาบาล...</p> : null}
          <p className="mt-2 text-sm leading-6 text-muted">
            แสดงเฉพาะรายการของ {page.hospital.name} ที่คุณเป็นเจ้าของโรงพยาบาล การเพิ่มบุคลากรและนำเข้าผู้ป่วยยังทำที่หน้าเดิม
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={`/app/workforce/new?hospitalId=${encodeURIComponent(hospitalId)}&step=1`}>เพิ่มบุคลากร / อสม.</Link>
            <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={`/app/patients/provision?hospitalId=${encodeURIComponent(hospitalId)}`}>นำเข้าผู้ป่วย</Link>
          </div>
        </Panel>

        <nav aria-label="ประเภทผู้ใช้งาน" className="mt-6 flex flex-wrap gap-2 border-b border-line">
          {(["staff", "osm", "patient"] as const).map((kind) => (
            <Link
              aria-current={filters.kind === kind ? "page" : undefined}
              className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold ${filters.kind === kind ? "border-action-primary text-brand-strong" : "border-transparent text-text-muted hover:text-text"}`}
              href={directoryHref(hospitalId, filters, { kind, cursor: null })}
              key={kind}
            >
              {USER_KIND_LABELS[kind]}
            </Link>
          ))}
        </nav>

        <Panel className="mt-6">
          <Form action="/app/users" className="grid gap-4 sm:grid-cols-[1fr_14rem_14rem_auto] sm:items-end">
            <input name="hospitalId" type="hidden" value={hospitalId} />
            <input name="tab" type="hidden" value={filters.kind} />
            <label className="block space-y-2 text-sm font-semibold" htmlFor="users-search">
              <span>{filters.kind === "patient" ? "ค้นหาชื่อหรือ HN" : "ค้นหาชื่อ"}</span>
              <Input defaultValue={filters.search} id="users-search" maxLength={120} name="search" type="search" />
            </label>
            <label className="block space-y-2 text-sm font-semibold" htmlFor="users-status">
              <span>สถานะ</span>
              <Select defaultValue={filters.status ?? ""} id="users-status" name="status">
                <option value="">ทุกสถานะ</option>
                {(["PENDING", "ACTIVE", "SUSPENDED", "REMOVED"] as const).map((status) => (
                  <option key={status} value={status}>{USER_STATUS_PRESENTATION[status].label}</option>
                ))}
              </Select>
            </label>
            <label className="block space-y-2 text-sm font-semibold" htmlFor="users-method">
              <span>วิธีเปิดใช้งาน</span>
              <Select defaultValue={filters.method ?? ""} id="users-method" name="method">
                <option value="">ทุกวิธี</option>
                {(["SELF_REGISTERED", "INVITE", "ASSISTED", "NOT_ACTIVATED"] as const).map((method) => (
                  <option key={method} value={method}>{ACTIVATION_METHOD_LABELS[method]}</option>
                ))}
              </Select>
            </label>
            <Button type="submit">ค้นหา</Button>
          </Form>
        </Panel>

        <section aria-labelledby="users-heading" className="mt-6 min-w-0 overflow-hidden rounded-panel border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
            <h2 className="text-xl font-semibold tracking-[-0.02em]" id="users-heading">{kindLabel}</h2>
            <StatusBadge>{page.rows.length} รายการในหน้านี้</StatusBadge>
          </div>
          {page.rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm leading-6 text-muted sm:px-6">ไม่พบรายการที่ตรงกับตัวกรอง</p>
          ) : (
            <ul>
              {page.rows.map((row) => {
                const status = USER_STATUS_PRESENTATION[row.status];
                const needsIdentityProof = row.identityAssurance === "CAREGIVER_INVITATION";
                return (
                  <li className="flex flex-col gap-3 border-t border-line px-4 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:px-6" key={row.relationshipId}>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{row.displayName}</p>
                      <p className="mt-1 text-sm text-muted">
                        {row.hospitalNumber ? `HN ${row.hospitalNumber} · ` : null}
                        {ACTIVATION_METHOD_LABELS[row.method]} · เพิ่มเมื่อ {dateFormat.format(row.addedAt)}
                      </p>
                      {row.selfRegisteredAt ? (
                        <p className="mt-1 text-xs font-medium text-brand-strong">ลงทะเบียนเองเมื่อ {dateFormat.format(row.selfRegisteredAt)}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {needsIdentityProof ? (
                        <div className="text-sm">
                          <StatusBadge variant="danger">ต้องยืนยันตัวตนก่อนใช้งาน</StatusBadge>
                          <p className="mt-1 text-xs text-text-muted">บัญชีนี้สร้างผ่านคำเชิญญาติ</p>
                        </div>
                      ) : <StatusBadge variant={status.variant}>{status.label}</StatusBadge>}
                      <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={`/app/users/${row.kind}/${encodeURIComponent(row.relationshipId)}`}>
                        จัดการ
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <nav aria-label={`หน้ารายชื่อ${kindLabel}`} className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-4 sm:px-6">
            {page.nextCursor ? (
              <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={directoryHref(hospitalId, filters, { cursor: page.nextCursor })}>หน้าถัดไป</Link>
            ) : <span className="text-sm text-muted">สิ้นสุดรายการ</span>}
            {filters.cursor ? (
              <Link className="text-sm font-semibold underline" href={directoryHref(hospitalId, filters, { cursor: null })}>กลับหน้าแรก</Link>
            ) : null}
          </nav>
        </section>
      </div>
    </div>
  );
}
