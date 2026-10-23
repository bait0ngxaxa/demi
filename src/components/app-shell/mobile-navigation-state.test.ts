import { describe, expect, it } from "vitest";

import {
  getWorkspaceContextForPathname,
  resolveSelectedWorkspaceContext,
} from "./navigation-state";
import { resolveActiveMobileTabId } from "./mobile-navigation-state";
import type { MobileNavigationTab } from "./mobile-tab-projection";

const workTabs: MobileNavigationTab[] = [
  {
    id: "home",
    href: "/app",
    label: "หน้าแรก",
    accessibleLabel: "หน้าหลักงาน",
    icon: "home",
    match: "exact",
    activeRoute: "navigation-item",
  },
  {
    id: "appointments",
    href: "/app/appointments",
    label: "นัดหมาย",
    accessibleLabel: "รายการนัดหมาย",
    icon: "appointments",
    match: "prefix",
    activeRoute: "navigation-item",
  },
  {
    id: "patients",
    href: "/app/patients/assigned",
    label: "ผู้ป่วย",
    accessibleLabel: "เพื่อนที่ดูแล",
    icon: "patients",
    match: "exact",
    activeRoute: "assigned-patients",
  },
  {
    id: "screening",
    href: "/app/patients/assigned?task=screening",
    label: "คัดกรอง",
    accessibleLabel: "คัดกรองผู้ป่วย",
    icon: "screening",
    match: "exact",
    activeRoute: "osm-screening",
  },
  {
    id: "followup",
    href: "/app/patients/assigned?task=followup",
    label: "ติดตาม",
    accessibleLabel: "ติดตามผู้ป่วย",
    icon: "followup",
    match: "exact",
    activeRoute: "osm-followup",
  },
  {
    id: "admin-hospitals",
    href: "/app/admin/hospitals",
    label: "รพ.",
    accessibleLabel: "การกำกับดูแลโรงพยาบาล",
    icon: "hospital",
    match: "prefix",
    activeRoute: "navigation-item",
  },
  {
    id: "hospital-reports",
    href: "/app/hospitals/reporting",
    label: "รายงาน",
    accessibleLabel: "รายงานโรงพยาบาล",
    icon: "reports",
    match: "prefix",
    activeRoute: "navigation-item",
  },
  {
    id: "more",
    href: "/app/more",
    label: "เพิ่มเติม",
    accessibleLabel: "เปิดเมนูเพิ่มเติม",
    icon: "more",
    match: "prefix",
    activeRoute: "more",
  },
];

const personalTabs: MobileNavigationTab[] = [
  {
    id: "home",
    href: "/app/personal",
    label: "หน้าแรก",
    accessibleLabel: "หน้าส่วนตัว",
    icon: "home",
    match: "exact",
    activeRoute: "personal-home",
  },
  {
    id: "appointments",
    href: "/app/personal/appointments",
    label: "นัดหมาย",
    accessibleLabel: "นัดหมาย",
    icon: "appointments",
    match: "prefix",
    activeRoute: "navigation-item",
  },
  {
    id: "more",
    href: "/app/more",
    label: "เพิ่มเติม",
    accessibleLabel: "เปิดเมนูเพิ่มเติม",
    icon: "more",
    match: "prefix",
    activeRoute: "more",
  },
];

const hospitalPatientTabs: MobileNavigationTab[] = [
  {
    id: "patients",
    href: "/app/patients",
    label: "ผู้ป่วย",
    accessibleLabel: "ผู้ป่วยในโรงพยาบาล",
    icon: "patients",
    match: "exact",
    activeRoute: "patient-detail",
  },
  {
    id: "more",
    href: "/app/more",
    label: "เพิ่มเติม",
    accessibleLabel: "เปิดเมนูเพิ่มเติม",
    icon: "more",
    match: "prefix",
    activeRoute: "more",
  },
];

describe("mobile navigation active route", () => {
  it("keeps Home exact and matches nested destinations on segment boundaries", () => {
    expect(resolveActiveMobileTabId("/app", "", workTabs)).toBe("home");
    expect(resolveActiveMobileTabId("/app/workforce", "", workTabs)).toBeNull();
    expect(resolveActiveMobileTabId("/app/admin/hospitals/child-id", "", workTabs)).toBe(
      "admin-hospitals",
    );
    expect(resolveActiveMobileTabId("/app/admin/hospitals-other", "", workTabs)).toBeNull();
    expect(resolveActiveMobileTabId("/app/hospitals/reporting/export", "", workTabs)).toBe(
      "hospital-reports",
    );
  });

  it("distinguishes the assigned Patient list and its valid task query modes", () => {
    expect(resolveActiveMobileTabId("/app/patients/assigned", "", workTabs)).toBe("patients");
    expect(resolveActiveMobileTabId("/app/patients/assigned", "task=screening", workTabs)).toBe(
      "screening",
    );
    expect(resolveActiveMobileTabId("/app/patients/assigned", "?task=followup", workTabs)).toBe(
      "followup",
    );
    expect(resolveActiveMobileTabId("/app/patients/assigned", "task=unknown", workTabs)).toBe(
      "patients",
    );
    expect(
      resolveActiveMobileTabId(
        "/app/patients/assigned",
        "task=screening&task=followup",
        workTabs,
      ),
    ).toBe("patients");
    expect(resolveActiveMobileTabId("/app/personal", "task=screening", personalTabs)).toBe("home");
  });

  it("associates Patient detail, screening, follow-up, and Program follow-up routes", () => {
    const relationshipId = "55555555-5555-4555-8555-555555555555";

    expect(resolveActiveMobileTabId("/app/patients", "", hospitalPatientTabs)).toBe("patients");
    expect(resolveActiveMobileTabId("/app/appointments", "tab=HISTORY", workTabs)).toBe("appointments");
    expect(resolveActiveMobileTabId(`/app/patients/${relationshipId}/appointments/appointment-id`, "", workTabs)).toBe("appointments");
    expect(resolveActiveMobileTabId(`/app/patients/${relationshipId}`, "", workTabs)).toBe(
      "patients",
    );
    expect(
      resolveActiveMobileTabId(`/app/patients/${relationshipId}/screenings/history`, "", workTabs),
    ).toBe("screening");
    expect(
      resolveActiveMobileTabId(`/app/patients/${relationshipId}/followups/followup-id`, "", workTabs),
    ).toBe("followup");
    expect(
      resolveActiveMobileTabId(
        `/app/patients/${relationshipId}/programs/program-id/followups/followup-id`,
        "",
        workTabs,
      ),
    ).toBe("followup");
    expect(
      resolveActiveMobileTabId(`/app/patients/${relationshipId}/programs/program-id`, "", workTabs),
    ).toBe("patients");
  });

  it("marks only the More route active and falls back safely on invalid task modes", () => {
    for (const pathname of [
      "/app/more",
      "/app/more/secondary",
    ]) {
      expect(resolveActiveMobileTabId(pathname, "", workTabs)).toBe("more");
    }
    expect(resolveActiveMobileTabId("/app/settings", "", workTabs)).toBeNull();
    expect(resolveActiveMobileTabId("/app/patients/assigned/other", "task=screening", workTabs)).toBeNull();
  });

  it("updates active selection as route history moves between task modes and details", () => {
    const historyRoutes = [
      ["/app/patients/assigned", "task=screening", "screening"],
      ["/app/patients/assigned", "task=followup", "followup"],
      ["/app/patients/assigned", "task=screening", "screening"],
      ["/app/patients/assigned", "", "patients"],
    ] as const;

    for (const [pathname, search, expectedTab] of historyRoutes) {
      expect(resolveActiveMobileTabId(pathname, search, workTabs)).toBe(expectedTab);
    }
  });

  it("switches route-derived workspace without persisting a preference", () => {
    const available = ["personal", "work"] as const;
    const personalContext = resolveSelectedWorkspaceContext(
      available,
      getWorkspaceContextForPathname("/app/personal/appointments"),
    );
    const workContext = resolveSelectedWorkspaceContext(
      available,
      getWorkspaceContextForPathname("/app/patients/assigned?task=screening"),
    );

    expect(personalContext).toBe("personal");
    expect(workContext).toBe("work");
    expect(resolveActiveMobileTabId("/app/personal", "", personalTabs)).toBe("home");
    expect(resolveActiveMobileTabId("/app", "", workTabs)).toBe("home");
    expect(resolveSelectedWorkspaceContext(["work"], "personal")).toBe("work");
  });
});
