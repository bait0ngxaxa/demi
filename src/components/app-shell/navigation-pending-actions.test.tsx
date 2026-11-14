import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, onNavigate, ...props }: { href: string; children: ReactNode; prefetch?: boolean; onNavigate?: unknown }) => {
    void prefetch; void onNavigate;
    return createElement("a", { ...props, href }, children);
  }, useLinkStatus: () => ({ pending: false }),
}));
import { ActionRequiredDot } from "@/components/ui/action-required-dot";
import { NavigationList } from "./navigation-list";
import { MoreMenuNavigation } from "./more-menu-navigation";
import { MobileBottomNavigation } from "./mobile-bottom-navigation";
import { projectMobileNavigation, projectMoreNavigation } from "./mobile-tab-projection";
import { withNavigationPendingActions } from "./navigation-pending-actions";
import type { ApplicationNavigationGroup } from "./navigation-types";
import type { PendingActionIndicator } from "@/modules/pending-actions/services/pending-action-service";

const navigation: ApplicationNavigationGroup[] = [{ id: "care", label: "งาน", workspace: "work", items: [
  { href: "/app", label: "หน้าหลัก", match: "exact" },
  { href: "/app/appointments", label: "รายการนัดหมาย", match: "prefix" },
  { href: "/app/patients/service-requests", label: "คำขอรับบริการ", match: "prefix" },
] }];
const indicators = [
  { navigationHref: "/app/appointments", href: "/app/appointments?tab=PENDING_REQUESTS&hospitalId=mine", count: 7, label: "คำขอนัดหมายรอพิจารณา" },
  { navigationHref: "/app/patients/service-requests", href: "/app/patients/service-requests?group=PENDING", count: 2, label: "คำขอรับบริการรอพิจารณา" },
];
const ready = (items: readonly PendingActionIndicator[]) => ({ status: "READY" as const, checkedAt: 0, indicators: items });

describe("shared pending action presentation", () => {
  it("hides zero and negative counts and enables pulse only with safe motion", () => {
    for (const count of [0, -1]) expect(renderToStaticMarkup(<ActionRequiredDot action={{ count, label: "งาน" }} />)).toBe("");
    const html = renderToStaticMarkup(<ActionRequiredDot action={{ count: 1, label: "งาน" }} />);
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain('class="sr-only">งาน 1 รายการ');
  });

  it("preserves hierarchy and exposes no unauthorized destination", () => {
    const groups = withNavigationPendingActions(navigation, ready([...indicators, { ...indicators[0], navigationHref: "/forbidden" }]));
    expect(groups.flatMap(({ items }) => items.map(({ href, label }) => ({ href, label })))).toEqual(
      navigation.flatMap(({ items }) => items.map(({ href, label }) => ({ href, label }))),
    );
    expect(groups.flatMap(({ items }) => items)).toHaveLength(3);
  });

  it("keeps desktop expanded, collapsed, bottom navigation and More consistent", () => {
    const groups = withNavigationPendingActions(navigation, ready(indicators));
    const projection = projectMobileNavigation(groups);
    const tabs = projection.tabsByWorkspace.work;
    expect(tabs.find(({ id }) => id === "appointments")?.pendingAction?.count).toBe(7);
    // Appointment is in a bottom tab; only the service-request queue contributes to More.
    expect(tabs.find(({ id }) => id === "more")?.pendingAction?.count).toBe(2);
    const more = projectMoreNavigation(groups, tabs);
    const surfaces = [
      renderToStaticMarkup(<NavigationList groups={groups} />),
      renderToStaticMarkup(<NavigationList collapsed groups={groups} />),
      renderToStaticMarkup(<MobileBottomNavigation projection={projection} />),
      renderToStaticMarkup(<MoreMenuNavigation groups={more} selectedWorkspace="work" />),
    ];
    for (const html of surfaces) {
      expect(html).toContain("คำขอนัดหมายรอพิจารณา 7 รายการ");
      expect(html).toContain("tab=PENDING_REQUESTS&amp;hospitalId=mine");
      expect(html).not.toContain(">7</span>");
    }
    expect(surfaces[3]).toContain("คำขอรับบริการรอพิจารณา 2 รายการ");
  });

  it("removes indicators only when a subsequent server calculation reports zero", () => {
    const first = withNavigationPendingActions(navigation, ready(indicators));
    expect(renderToStaticMarkup(<NavigationList groups={first} />)).toContain("คำขอนัดหมายรอพิจารณา 7 รายการ");
    expect(renderToStaticMarkup(<NavigationList groups={first} />)).toContain("คำขอนัดหมายรอพิจารณา 7 รายการ");
    const completed = withNavigationPendingActions(navigation, ready(indicators.map((indicator) => ({ ...indicator, count: 0 }))));
    expect(renderToStaticMarkup(<NavigationList groups={completed} />)).not.toContain("animate-pulse");
  });

  it("adds no synthetic indicator when the calculation is unavailable", () => {
    const groups = withNavigationPendingActions(navigation, { status: "UNAVAILABLE", checkedAt: 0 });
    expect(groups).toBe(navigation);
    const projection = projectMobileNavigation(groups);
    expect(projection.tabsByWorkspace.work.some(({ pendingAction }) => pendingAction !== undefined)).toBe(false);
    expect(renderToStaticMarkup(<NavigationList groups={groups} />)).not.toContain("sr-only");
  });

  it("names the multi-Hospital aggregate identically on every navigation surface", () => {
    const multi = [{ ...indicators[0], count: 8, hospitalQueue: { tab: "PENDING_REQUESTS" as const, hospitals: [
      { hospitalId: "a", count: 2 }, { hospitalId: "b", count: 4 }, { hospitalId: "c", count: 2 }, { hospitalId: "idle", count: 0 },
    ] } }, indicators[1]];
    const groups = withNavigationPendingActions(navigation, ready(multi));
    const projection = projectMobileNavigation(groups);
    const surfaces = [
      renderToStaticMarkup(<NavigationList groups={groups} />),
      renderToStaticMarkup(<NavigationList collapsed groups={groups} />),
      renderToStaticMarkup(<MobileBottomNavigation projection={projection} />),
      renderToStaticMarkup(<MoreMenuNavigation groups={projectMoreNavigation(groups, projection.tabsByWorkspace.work)} selectedWorkspace="work" />),
    ];
    for (const html of surfaces) {
      expect(html).toContain("คำขอนัดหมายรอพิจารณา รวม 8 รายการ จาก 3 โรงพยาบาล");
      expect(html).not.toContain("idle");
    }
    const single = withNavigationPendingActions(navigation, ready([{ ...indicators[0], count: 2, hospitalQueue: { tab: "PENDING_REQUESTS" as const, hospitals: [{ hospitalId: "a", count: 2 }, { hospitalId: "b", count: 0 }] } }]));
    expect(renderToStaticMarkup(<NavigationList groups={single} />)).toContain("คำขอนัดหมายรอพิจารณา 2 รายการ");
    expect(renderToStaticMarkup(<NavigationList groups={single} />)).not.toContain("จาก");
  });
});
