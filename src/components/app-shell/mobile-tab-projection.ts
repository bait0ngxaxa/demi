import { CUSTOMER_PRIMARY_MENU, getCustomerMenuIcon } from "./customer-navigation";
import type {
  ApplicationNavigationGroup,
  ApplicationNavigationItem,
  ApplicationWorkspaceContext,
} from "./navigation-types";

export type MobileNavigationIcon =
  | "home"
  | "appointments"
  | "wellness"
  | "care"
  | "patients"
  | "screening"
  | "followup"
  | "hospital"
  | "workforce"
  | "reports"
  | "review"
  | "more"
  | "default"
  | "family"
  | "knowledge"
  | "medications"
  | "measurements"
  | "profile"
  | "services"
  | "settings"
  | "support"
  | "provision"
  | "activation"
  | "assign"
  | "requests"
  | "export"
  | "areas"
  | "contact"
  | "publish";

export type MobileNavigationMatch = "exact" | "prefix";

export type MobileNavigationTab = {
  id: string;
  href: string | null;
  label: string;
  accessibleLabel: string;
  icon: MobileNavigationIcon;
  match: MobileNavigationMatch;
  activeRoute:
    | "navigation-item"
    | "personal-home"
    | "assigned-patients"
    | "osm-screening"
    | "osm-followup"
    | "patient-detail"
    | "more";
};

export type MobileNavigationProjection = {
  availableWorkspaces: readonly ApplicationWorkspaceContext[];
  tabsByWorkspace: Readonly<
    Record<ApplicationWorkspaceContext, readonly MobileNavigationTab[]>
  >;
};

const moreTab: MobileNavigationTab = {
  id: "more",
  href: "/app/more",
  label: "เพิ่มเติม",
  accessibleLabel: "เปิดเมนูเพิ่มเติม",
  icon: "more",
  match: "prefix",
  activeRoute: "more",
};

function isGroupAvailableInWorkspace(
  group: ApplicationNavigationGroup,
  workspace: ApplicationWorkspaceContext,
): boolean {
  return group.workspace === undefined || group.workspace === "all" || group.workspace === workspace;
}

function findNavigationItem(
  navigation: readonly ApplicationNavigationGroup[],
  workspace: ApplicationWorkspaceContext,
  href: string,
): ApplicationNavigationItem | undefined {
  for (const group of navigation) {
    const item = group.items.find(
      (candidate) =>
        candidate.href === href && isGroupAvailableInWorkspace(group, workspace),
    );

    if (item) {
      return item;
    }
  }

  return undefined;
}

function hasWorkspaceNavigation(
  navigation: readonly ApplicationNavigationGroup[],
  workspace: ApplicationWorkspaceContext,
): boolean {
  return navigation.some((group) => group.workspace === workspace);
}

function tabFromItem(
  item: ApplicationNavigationItem,
  options: Pick<MobileNavigationTab, "id" | "label" | "accessibleLabel" | "icon" | "activeRoute"> & {
    match?: MobileNavigationMatch;
    href?: string;
  },
): MobileNavigationTab {
  return {
    id: options.id,
    href: options.href ?? item.href,
    label: options.label,
    accessibleLabel: options.accessibleLabel,
    icon: options.icon,
    match: options.match ?? item.match,
    activeRoute: options.activeRoute,
  };
}

function projectPersonalTabs(
  navigation: readonly ApplicationNavigationGroup[],
): MobileNavigationTab[] {
  const home = findNavigationItem(navigation, "personal", "/app/personal");
  if (!home) {
    return [];
  }

  const tabs: MobileNavigationTab[] = [
    tabFromItem(home, {
      id: "home",
      label: "หน้าแรก",
      accessibleLabel: "หน้าส่วนตัว",
      icon: "home",
      match: "exact",
      activeRoute: "personal-home",
    }),
  ];

  const sections = [
    {
      href: "/app/personal/appointments",
      id: "appointments",
      label: "นัดหมาย",
      accessibleLabel: "นัดหมาย",
      icon: "appointments",
    },
    {
      href: "/app/personal/wellness",
      id: "wellness",
      label: "สุขภาพ",
      accessibleLabel: "สุขภาพ",
      icon: "wellness",
    },
    {
      href: "/app/personal/care",
      id: "care",
      label: "ดูแล",
      accessibleLabel: "ข้อมูลการดูแล",
      icon: "care",
    },
  ] as const;

  for (const section of sections) {
    const item = findNavigationItem(navigation, "personal", section.href);
    if (item) {
      tabs.push(tabFromItem(item, { ...section, match: "prefix", activeRoute: "navigation-item" }));
    }
  }

  return tabs;
}

function projectWorkTabs(
  navigation: readonly ApplicationNavigationGroup[],
): MobileNavigationTab[] {
  const tabs: MobileNavigationTab[] = [];
  const home = findNavigationItem(navigation, "work", "/app");
  if (home) {
    tabs.push(
      tabFromItem(home, {
        id: "home",
        label: "หน้าแรก",
        accessibleLabel: "หน้าหลักงาน",
        icon: "home",
        match: "exact",
        activeRoute: "navigation-item",
      }),
    );
  }

  const assignedPatients = findNavigationItem(navigation, "work", "/app/patients/assigned");
  const patientDirectory = assignedPatients ?? findNavigationItem(navigation, "work", "/app/patients");
  if (patientDirectory) {
    tabs.push(
      tabFromItem(patientDirectory, {
        id: "patients",
        label: "ผู้ป่วย",
        accessibleLabel: patientDirectory.label,
        icon: "patients",
        match: "exact",
        activeRoute: assignedPatients ? "assigned-patients" : "patient-detail",
      }),
    );
  }

  if (assignedPatients) {
    tabs.push(
      tabFromItem(assignedPatients, {
        id: "screening",
        href: `${assignedPatients.href}?task=screening`,
        label: "คัดกรอง",
        accessibleLabel: "คัดกรองผู้ป่วย",
        icon: "screening",
        match: "exact",
        activeRoute: "osm-screening",
      }),
      tabFromItem(assignedPatients, {
        id: "followup",
        href: `${assignedPatients.href}?task=followup`,
        label: "ติดตาม",
        accessibleLabel: "ติดตามผู้ป่วย",
        icon: "followup",
        match: "exact",
        activeRoute: "osm-followup",
      }),
    );
  }

  const remainingCandidates = [
    {
      href: "/app/admin/hospitals",
      id: "admin-hospitals",
      label: "รพ.",
      accessibleLabel: "การกำกับดูแลโรงพยาบาล",
      icon: "hospital",
    },
    {
      href: "/app/admin/reporting",
      id: "admin-reports",
      label: "รายงาน",
      accessibleLabel: "รายงานระบบ",
      icon: "reports",
    },
    {
      href: "/app/admin/hospital-onboarding",
      id: "admin-review",
      label: "คำขอ",
      accessibleLabel: "คำขอขึ้นทะเบียนโรงพยาบาล",
      icon: "review",
    },
    {
      href: "/app/workforce",
      id: "workforce",
      label: "บุคลากร",
      accessibleLabel: "จัดการบุคลากร",
      icon: "workforce",
    },
  ] as const;

  for (const candidate of remainingCandidates) {
    const item = findNavigationItem(navigation, "work", candidate.href);
    if (item) {
      tabs.push(tabFromItem(item, { ...candidate, activeRoute: "navigation-item" }));
    }
  }

  const hospitalReport =
    findNavigationItem(navigation, "work", "/app/hospitals/reporting") ??
    findNavigationItem(navigation, "work", "/app/hospitals/reporting/export");
  if (hospitalReport) {
    tabs.push(
      tabFromItem(hospitalReport, {
        id: "hospital-reports",
        label: "รายงาน",
        accessibleLabel: hospitalReport.label,
        icon: "reports",
        activeRoute: "navigation-item",
      }),
    );
  }

  const hospitalOperation = [
    "/app/hospitals/contact",
    "/app/hospitals/contacts",
    "/app/hospitals/knowledge",
  ]
    .map((href) => findNavigationItem(navigation, "work", href))
    .find((item) => item !== undefined);
  if (hospitalOperation) {
    tabs.push(
      tabFromItem(hospitalOperation, {
        id: "hospital-work",
        label: "งาน รพ.",
        accessibleLabel: hospitalOperation.label,
        icon: "hospital",
        activeRoute: "navigation-item",
      }),
    );
  }

  return tabs;
}

/**
 * UI-01: the Patient's customer bottom menu is the `primary` section itself, five tabs with no "เพิ่มเติม" slot.
 * The โปรไฟล์ tab opens the More hub, so it keeps the `more` id and active route.
 */
function projectCustomerTabs(
  navigation: readonly ApplicationNavigationGroup[],
  workspace: ApplicationWorkspaceContext,
): MobileNavigationTab[] | null {
  const primary = navigation.find((group) => group.id === "primary" && group.workspace === workspace);
  if (!primary) {
    return null;
  }

  return primary.items.flatMap((item): MobileNavigationTab[] => {
    const entry = CUSTOMER_PRIMARY_MENU.find(({ id }) => id === item.menuId);
    if (!entry) {
      return [];
    }
    const isProfile = entry.id === "profile";

    return [tabFromItem(item, {
      id: isProfile ? "more" : entry.id,
      label: entry.label,
      accessibleLabel: entry.label,
      icon: getCustomerMenuIcon(entry.id),
      activeRoute: isProfile ? "more" : entry.id === "home" ? "personal-home" : "navigation-item",
    })];
  });
}

export function projectMobileNavigation(
  navigation: readonly ApplicationNavigationGroup[],
): MobileNavigationProjection {
  const availableWorkspaces = (["personal", "work"] as const).filter((workspace) =>
    hasWorkspaceNavigation(navigation, workspace),
  );
  const personalTabs = availableWorkspaces.includes("personal")
    ? projectCustomerTabs(navigation, "personal") ?? [...projectPersonalTabs(navigation).slice(0, 4), moreTab]
    : [];
  const workTabs = availableWorkspaces.includes("work")
    ? [...projectWorkTabs(navigation).slice(0, 4), moreTab]
    : [];

  return {
    availableWorkspaces,
    tabsByWorkspace: {
      personal: personalTabs,
      work: workTabs,
    },
  };
}

export function projectMoreNavigation(
  navigation: readonly ApplicationNavigationGroup[],
  primaryTabs: readonly MobileNavigationTab[],
): readonly ApplicationNavigationGroup[] {
  // Full hrefs: the OSM task tabs and their navigation items share the `?task=` query. The More tab is listed too:
  // the Patient's โปรไฟล์ menu item opens this same hub, so it is never a row inside it.
  const primaryHrefs = new Set(
    primaryTabs.flatMap(({ href }) => (href ? [href] : [])),
  );

  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !primaryHrefs.has(item.href)),
    }))
    .filter(({ items }) => items.length > 0);
}
