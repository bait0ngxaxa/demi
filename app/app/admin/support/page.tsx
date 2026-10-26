import { SupportReportCategory, SupportReportStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SupportReportList } from "@/components/support/support-report-list";
import { classNames } from "@/components/ui/class-names";
import { PageHeader } from "@/components/ui/page-header";
import { SUPPORT_REPORT_CATEGORY_LABELS, SUPPORT_REPORT_INBOX_ALL_STATUSES, SUPPORT_REPORT_STATUS_LABELS, type SupportReportInboxStatus } from "@/modules/support/domain/support-report";
import { getAdminSupportInboxContext, type AdminSupportInboxFilters } from "@/modules/support/transport/support-report-page-context";

export const metadata: Metadata = { title: "กล่องแจ้งปัญหา" };

const textLinkClassName = "inline-flex min-h-11 items-center rounded-control font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

/** `status` is always the server-resolved value, so every link names its view explicitly (WB-DF-14 P1). */
type Filters = Omit<AdminSupportInboxFilters, "cursor" | "status"> & { status: SupportReportInboxStatus };
type FilterOption<TValue extends string | undefined> = readonly [value: TValue, label: string];

function stringParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value === undefined ? undefined : "";
}

function inboxHref(filters: Filters, cursor?: string): string {
  const query = new URLSearchParams();
  query.set("status", filters.status);
  if (filters.category) query.set("category", filters.category);
  if (filters.hospitalId) query.set("hospitalId", filters.hospitalId);
  if (cursor) query.set("cursor", cursor);
  return `/app/admin/support?${query.toString()}`;
}

/** The `LocalNavigation` segmented look, as links: a filter belongs in the URL so pages and reloads keep it. */
function FilterSegments<TValue extends string | undefined>({ label, current, options, href }: { label: string; current: TValue; options: readonly FilterOption<TValue>[]; href: (value: TValue) => string }): React.JSX.Element {
  return <div className="space-y-2">
    <p className="text-sm font-medium text-text">{label}</p>
    <nav aria-label={`กรองตาม${label}`} className="flex w-fit max-w-full flex-wrap gap-1 rounded-panel bg-surface-muted p-1">
      {options.map(([value, text]) => {
        const selected = value === current;
        return <Link
          aria-current={selected ? "true" : undefined}
          className={classNames(
            "inline-flex min-h-11 items-center rounded-control px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring",
            selected ? "bg-surface text-brand-strong shadow-surface" : "text-text-muted hover:bg-surface/70 hover:text-text",
          )}
          href={href(value)}
          key={value ?? "all"}
        >{text}</Link>;
      })}
    </nav>
  </div>;
}

const statusOptions: readonly FilterOption<SupportReportInboxStatus>[] = [...Object.values(SupportReportStatus).map((status): FilterOption<SupportReportInboxStatus> => [status, SUPPORT_REPORT_STATUS_LABELS[status]]), [SUPPORT_REPORT_INBOX_ALL_STATUSES, "ทั้งหมด"]];
const categoryOptions: readonly FilterOption<string | undefined>[] = [[undefined, "ทั้งหมด"], ...Object.values(SupportReportCategory).map((category): FilterOption<string | undefined> => [category, SUPPORT_REPORT_CATEGORY_LABELS[category]])];

/** WB-DF-14 (Product Owner 2026-10-26): the platform ADMIN receives every usage-problem report, across all Hospitals. */
export default async function AdminSupportInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;
  const status = stringParam(params.status);
  const category = stringParam(params.category);
  const hospitalId = stringParam(params.hospitalId);
  const requested: AdminSupportInboxFilters = {
    ...(status === undefined ? {} : { status }),
    ...(category === undefined ? {} : { category }),
    ...(hospitalId === undefined ? {} : { hospitalId }),
  };
  const cursor = stringParam(params.cursor);
  // The service resolves a missing status to NEW; the page renders and links that resolved view.
  const page = await getAdminSupportInboxContext(cursor === undefined ? requested : { ...requested, cursor });
  const filters: Filters = {
    status: page.status,
    ...(category === undefined ? {} : { category }),
    ...(hospitalId === undefined ? {} : { hospitalId }),
  };
  return <div className="min-w-0 max-w-5xl space-y-8">
    <PageHeader
      breadcrumbs={[{ href: "/app", label: "หน้าหลัก" }, { label: "ผู้ดูแลระบบ" }, { label: "กล่องแจ้งปัญหา" }]}
      description="รายงานปัญหาการใช้งานจากผู้ใช้ทุกโรงพยาบาล รับทราบและบันทึกเมื่อแก้ไขแล้ว"
      title="กล่องแจ้งปัญหา"
    />
    <div className="flex flex-col gap-5 lg:flex-row lg:flex-wrap lg:gap-8">
      <FilterSegments current={filters.status} href={(value) => inboxHref({ ...filters, status: value })} label="สถานะ" options={statusOptions} />
      <FilterSegments current={filters.category} href={(value) => inboxHref({ ...filters, category: value })} label="หมวดหมู่" options={categoryOptions} />
    </div>
    <section aria-labelledby="support-inbox-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h2 className="text-lg font-semibold text-text" id="support-inbox-heading">รายงานที่ส่งเข้ามา</h2>
        {filters.hospitalId ? <p className="text-sm text-text-muted">เฉพาะโรงพยาบาลที่เลือก · <Link className={textLinkClassName} href={inboxHref({ ...filters, hospitalId: undefined })}>แสดงทุกโรงพยาบาล</Link></p> : null}
      </div>
      <SupportReportList detailHref={(id) => `/app/admin/support/${id}`} emptyText="ไม่มีรายงานปัญหาตามตัวกรองนี้" items={page.items} />
      {page.nextCursor ? <nav aria-label="หน้ารายการรายงานปัญหา"><Link className={textLinkClassName} href={inboxHref(filters, page.nextCursor)}>ดูรายงานเก่ากว่า</Link></nav> : null}
    </section>
  </div>;
}
