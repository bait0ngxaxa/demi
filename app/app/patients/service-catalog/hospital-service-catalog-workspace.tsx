import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import type { ManagedHospitalServiceCatalog } from "@/modules/patient-service-requests/services/patient-service-catalog-service";

import { HospitalServiceOfferingControl } from "./hospital-service-catalog-controls";

export function HospitalServiceCatalogWorkspace({
  catalogs,
}: {
  catalogs: readonly ManagedHospitalServiceCatalog[];
}): React.JSX.Element {
  return (
    <div className="max-w-4xl">
      <PageHeader
        breadcrumbs={[{ href: "/app", label: "งาน" }, { label: "บริการที่ผู้ป่วยขอได้" }]}
        description="กำหนดว่าผู้ป่วยส่งคำขอประเภทใดให้โรงพยาบาลของคุณได้ การตั้งค่านี้ไม่สร้าง Program หรือมอบหมาย อสม."
        title="บริการที่ผู้ป่วยขอได้"
      />
      <Alert className="mt-6" variant="info">
        เฉพาะเจ้าของโรงพยาบาลโดยตรงเท่านั้นที่เปลี่ยนรายการนี้ได้ หมวดบริการเป็นประเภทคำขอ ไม่ใช่การยืนยันว่าเริ่มให้บริการแล้ว
      </Alert>

      <div className="mt-6 space-y-6">
        {catalogs.map((catalog, index) => (
          <Panel aria-labelledby={`service-catalog-hospital-${index}`} key={catalog.hospitalId}>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id={`service-catalog-hospital-${index}`}>
                {catalog.hospitalName}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">รหัสโรงพยาบาล {catalog.hospitalCode}</p>
            </div>

            <div className="mt-5 border-y border-border">
              {catalog.offerings.map((offering) => (
                <HospitalServiceOfferingControl
                  code={offering.code}
                  enabled={offering.enabled}
                  hospitalId={catalog.hospitalId}
                  key={offering.code}
                />
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
