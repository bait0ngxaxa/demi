import type { SupportReportStatus } from "@prisma/client";

import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { SUPPORT_REPORT_STATUS_LABELS } from "@/modules/support/domain/support-report";

const STATUS_VARIANTS: Readonly<Record<SupportReportStatus, StatusVariant>> = {
  NEW: "info",
  ACKNOWLEDGED: "warning",
  RESOLVED: "success",
};

export function SupportReportStatusBadge({ status }: { status: SupportReportStatus }): React.JSX.Element {
  return <StatusBadge variant={STATUS_VARIANTS[status]}>{SUPPORT_REPORT_STATUS_LABELS[status]}</StatusBadge>;
}
