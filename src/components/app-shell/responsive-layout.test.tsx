import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";
import { ProtectedApplicationShellSkeleton } from "./app-shell-skeleton";
import { PageHeader } from "../ui/page-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("./logout-button", () => ({ LogoutButton: () => <button>ออกจากระบบ</button> }));

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("responsive shell contract", () => {
  it("provides one focusable main landmark and a skip destination without a stale sidebar offset", () => {
    const html = renderToStaticMarkup(<AppShell navigation={[]} roleLabels={[]}><h1>พื้นที่ทำงาน</h1></AppShell>);
    expect(html.match(/<main\s/g)).toHaveLength(1);
    expect(html).toContain('href="#application-main-content"');
    expect(html).toMatch(/<main[^>]+id="application-main-content"[^>]+tabindex="-1"/);
    expect(html).toContain("@container/workspace");
    expect(html).toContain("min-w-0 flex-1");
    expect(source("src/components/app-shell/app-shell.tsx")).not.toMatch(/(?:ml|pl|left)-app-sidebar/);
  });

  it("keeps header and main gutters aligned during shell loading", () => {
    for (const html of [
      renderToStaticMarkup(<AppShell navigation={[]} roleLabels={[]}>ข้อมูล</AppShell>),
      renderToStaticMarkup(<ProtectedApplicationShellSkeleton />),
    ]) {
      expect(html).toMatch(/<header[^>]+px-4 sm:px-6 lg:px-8/);
      expect(html).toMatch(/<main[^>]+px-4 py-8 sm:px-6 sm:py-10 lg:px-8/);
    }
  });

  it("keeps collapsed navigation inert and the restore control outside it", () => {
    const sidebar = source("src/components/app-shell/app-sidebar.tsx");
    expect(sidebar).toContain("inert={expanded ? undefined : true}");
    expect(sidebar).toContain("ระบบบริการสุขภาพ");
    expect(sidebar.indexOf("<DesktopSidebarToggle")).toBeLessThan(sidebar.indexOf("<nav"));
    expect(sidebar).toContain("motion-reduce:transition-none");
    expect(sidebar).toContain("useSyncExternalStore");
  });

  it("uses one mobile bottom navigation while retaining the desktop sidebar", () => {
    const navigation = [
      {
        label: null,
        workspace: "work" as const,
        items: [{ href: "/app", label: "หน้าหลัก", match: "exact" as const }],
      },
    ];
    const html = renderToStaticMarkup(
      <AppShell navigation={navigation} roleLabels={["อสม."]}>เนื้อหา</AppShell>,
    );

    expect(html).toContain('aria-label="เมนูหลักบนมือถือ"');
    expect(html).toContain("app-mobile-bottom-navigation");
    expect(html).toContain("hidden h-svh shrink-0");
    expect(html).toContain("lg:flex lg:flex-col");
    const header = html.match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).toContain('class="hidden lg:block"');
    expect(header).toContain("ออกจากระบบ");
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain('aria-label="เปิดเมนูหลัก"');
    expect(html).not.toContain('id="mobile-application-navigation"');
    expect(source("app/globals.css")).toContain("env(safe-area-inset-bottom, 0px)");
    expect(source("app/globals.css")).toContain("--app-mobile-bottom-navigation-height");
    expect(source("app/app/layout.tsx")).toContain('viewportFit: "cover"');
  });

  it("uses opt-in workspace/detail policies while preserving reading form constraints", () => {
    for (const path of ["app/app/page.tsx", "app/app/workforce/workforce-workspace.tsx", "app/app/patients/patient-directory-view.tsx", "app/app/hospitals/reporting/hospital-report-workspace.tsx"]) {
      expect(source(path)).toContain("content-workspace");
    }
    const detail = source("app/app/patients/[relationshipId]/page.tsx");
    expect(detail).toContain("content-detail");
    expect(detail).toContain("@5xl/workspace:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]");
    expect(detail).toContain("@5xl/workspace:col-span-2");
    expect(source("app/app/patients/provision/patient-provisioning-workspace.tsx")).toContain('<Panel className="max-w-4xl">');
    const assigned = source("app/app/patients/assigned/assigned-patient-directory-view.tsx");
    expect(assigned).toContain("@5xl/workspace:col-span-3");
    expect(assigned).not.toMatch(/\slg:col-span-3/);
  });

  it("allows long breadcrumb text and header actions to wrap without changing exact return URLs", () => {
    const html = renderToStaticMarkup(<PageHeader title="รายละเอียดผู้ป่วย" description="ข้อมูลในโรงพยาบาลนี้" breadcrumbs={[
      { label: "โรงพยาบาลชื่อยาวสำหรับตรวจการตัดบรรทัด", href: "/app#hospital-workspace-H" },
      { label: "รายละเอียดผู้ป่วย" },
    ]} actions={<button>กลับไปยังโรงพยาบาล</button>} />);
    expect(html).toContain('href="/app#hospital-workspace-H"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("min-w-0 max-w-full");
    expect(html).toContain("flex-wrap items-end");
    expect(source("app/globals.css")).toContain(
      "scroll-padding-top: calc(var(--app-header-height) + env(safe-area-inset-top, 0px) + 1.5rem)",
    );
  });
});
