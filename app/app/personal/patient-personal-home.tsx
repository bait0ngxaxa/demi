import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { HomeContentSection } from "@/components/home/home-content-section";
import { HomeHospitalContact } from "@/components/home/home-hospital-contact";
import { HomeHero } from "@/components/home/home-hero";
import type { HomeHospitalOption } from "@/components/home/home-hospital-chip";
import { HomeShortcutGrid, type HomeShortcut } from "@/components/home/home-shortcut-grid";
import type { HospitalContentPatientListItem } from "@/modules/hospital-content/types/hospital-content-patient-projections";
import type { PatientHospitalContactProjection } from "@/modules/hospital-contact/types/hospital-contact-projections";

type PatientPresentation = {
  person: { givenName: string | null; familyName: string | null };
};
type PatientHomeRelationship = HomeHospitalOption & {
  hospitalContact:
    | { status: "AVAILABLE"; contact: PatientHospitalContactProjection }
    | { status: "UNAVAILABLE" };
};

function getPersistedDisplayName(patient: PatientPresentation): string | null {
  const name = [patient.person.givenName, patient.person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return name || null;
}

function createShortcuts(
  selectedHospital: PatientHomeRelationship | null,
  hasHospitalContact: boolean,
): HomeShortcut[] {
  const relationshipId = selectedHospital?.relationshipId;
  const personalSelection = relationshipId
    ? `?hospital=${encodeURIComponent(relationshipId)}`
    : "";
  const shortcuts: HomeShortcut[] = [
    {
      href: relationshipId
        ? `/app/personal/care/${encodeURIComponent(relationshipId)}`
        : "/app/personal/care",
      icon: "care",
      label: "การดูแล",
    },
    {
      href: relationshipId
        ? `/app/personal/appointments/${encodeURIComponent(relationshipId)}`
        : "/app/personal/appointments",
      icon: "appointments",
      label: "นัดหมาย",
    },
    { href: "/app/personal/medications", icon: "medications", label: "ยาของฉัน" },
    { href: "/app/personal/wellness", icon: "wellness", label: "บันทึกสุขภาพ" },
    { href: "/app/personal/measurements", icon: "measurements", label: "ตัวฉันตอนนี้" },
    { href: "/app/personal/services", icon: "services", label: "ขอรับบริการ" },
    { href: "/app/family", icon: "family", label: "ครอบครัว" },
  ];

  if (relationshipId && hasHospitalContact) {
    shortcuts.push({
      href: `/app/personal${personalSelection}#personal-hospital-contact`,
      icon: "hospital",
      label: "ติดต่อ รพ.",
    });
  }

  return shortcuts;
}

export function PatientPersonalHome({
  activeHospitals,
  knowledgeItems,
  newsItems,
  nextAppointment,
  patient,
  selectedHospital,
}: {
  activeHospitals?: readonly HomeHospitalOption[];
  knowledgeItems?: readonly HospitalContentPatientListItem[];
  newsItems?: readonly HospitalContentPatientListItem[];
  nextAppointment?: { href: string; scheduledAt: Date } | null;
  patient: PatientPresentation | null;
  selectedHospital?: PatientHomeRelationship | null;
}): React.JSX.Element {
  if (patient === null) {
    return (
      <div className="min-w-0 max-w-4xl">
        <PageHeader description="ดูข้อมูลและจัดการรายการส่วนตัวของคุณ" title="พื้นที่ส่วนตัว" />
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ข้อมูลผู้ป่วยยังไม่พร้อมแสดง</p>
          <p className="mt-1">ยังไม่พบข้อมูลโปรไฟล์ที่เชื่อมกับบัญชีนี้ หากต้องการตรวจสอบข้อมูล กรุณาติดต่อโรงพยาบาลที่ลงทะเบียนให้คุณ</p>
        </Alert>
      </div>
    );
  }

  const currentHospital = selectedHospital ?? null;
  const hasHospitalContact = currentHospital?.hospitalContact.status === "AVAILABLE";
  const shortcuts = createShortcuts(currentHospital, hasHospitalContact);

  return (
    <div className="min-w-0 max-w-5xl">
      <HomeHero
        activeHospitals={activeHospitals ?? []}
        displayName={getPersistedDisplayName(patient)}
        nextAppointment={nextAppointment ?? null}
        selectedHospital={currentHospital
          ? { relationshipId: currentHospital.relationshipId, hospitalName: currentHospital.hospitalName }
          : null}
      />
      <HomeShortcutGrid shortcuts={shortcuts} />
      <HomeContentSection
        allHref={`/app/personal/news${currentHospital ? `?hospital=${encodeURIComponent(currentHospital.relationshipId)}` : ""}`}
        emptyMessage={currentHospital
          ? `ยังไม่มีข่าวสารจาก${currentHospital.hospitalName}`
          : "ยังไม่มีโรงพยาบาลที่พร้อมแสดงข่าวสาร"}
        heading="ข่าวสาร"
        id="personal-home-news-heading"
        items={newsItems ?? []}
      />
      <HomeContentSection
        allHref={`/app/personal/knowledge${currentHospital ? `?hospital=${encodeURIComponent(currentHospital.relationshipId)}` : ""}`}
        emptyMessage={currentHospital
          ? `ยังไม่มีสื่อความรู้จาก${currentHospital.hospitalName}`
          : "ยังไม่มีโรงพยาบาลที่พร้อมแสดงสื่อความรู้"}
        heading="สื่อความรู้"
        id="personal-home-knowledge-heading"
        items={knowledgeItems ?? []}
      />
      {currentHospital?.hospitalContact.status === "AVAILABLE" ? (
        <HomeHospitalContact contact={currentHospital.hospitalContact.contact} hospitalName={currentHospital.hospitalName} />
      ) : null}
    </div>
  );
}
