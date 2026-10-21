import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { HomeContentSection } from "@/components/home/home-content-section";
import { HomeHospitalContact } from "@/components/home/home-hospital-contact";
import { HomeHero, HomeNextAppointment } from "@/components/home/home-hero";
import { HomeHospitalChip, type HomeHospitalOption } from "@/components/home/home-hospital-chip";
import { HomeShortcutGrid, type HomeShortcut } from "@/components/home/home-shortcut-grid";
import { HomeSupportLink } from "@/components/home/home-top-menu";
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

/** The selected Hospital narrows the same deep links the former shortcuts used; other entries keep their href. */
function withSelectedHospital(shortcut: HomeShortcut, relationshipId: string | null): HomeShortcut {
  if (!relationshipId) {
    return shortcut;
  }
  if (shortcut.href === "/app/personal/appointments") {
    return { ...shortcut, href: `/app/personal/appointments/${encodeURIComponent(relationshipId)}` };
  }
  if (shortcut.href === "/app/personal#personal-hospital-contact") {
    return { ...shortcut, href: `/app/personal?hospital=${encodeURIComponent(relationshipId)}#personal-hospital-contact` };
  }

  return shortcut;
}

export function PatientPersonalHome({
  activeHospitals,
  knowledgeFailed = false,
  knowledgeItems,
  menu = [],
  newsFailed = false,
  newsItems,
  nextAppointment,
  patient,
  selectedHospital,
}: {
  activeHospitals?: readonly HomeHospitalOption[];
  knowledgeFailed?: boolean;
  knowledgeItems?: readonly HospitalContentPatientListItem[];
  /** UI-01 top-menu entries from the navigation projection (`projectHomeTopMenu`). */
  menu?: readonly HomeShortcut[];
  newsFailed?: boolean;
  newsItems?: readonly HospitalContentPatientListItem[];
  nextAppointment?: { href: string; scheduledAt: Date } | null | "UNAVAILABLE";
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
  const displayName = getPersistedDisplayName(patient);
  const retryHref = `/app/personal${currentHospital ? `?hospital=${encodeURIComponent(currentHospital.relationshipId)}` : ""}`;

  return (
    <div className="min-w-0 max-w-5xl">
      <HomeHero
        chip={(
          <HomeHospitalChip
            action="/app/personal"
            fieldName="hospital"
            groups={[{
              label: null,
              options: (activeHospitals ?? []).map(({ relationshipId, hospitalName }) => ({ value: relationshipId, label: hospitalName })),
            }]}
            selectId="personal-home-hospital"
            selectedLabel={currentHospital?.hospitalName ?? null}
            selectedValue={currentHospital?.relationshipId ?? null}
          />
        )}
        headingId="personal-home-heading"
        title={displayName ? `สวัสดี, ${displayName}` : "สวัสดี"}
      >
        <HomeNextAppointment nextAppointment={nextAppointment ?? null} />
      </HomeHero>
      <HomeShortcutGrid shortcuts={menu.map((shortcut) => withSelectedHospital(shortcut, currentHospital?.relationshipId ?? null))} />
      {/* Two columns once the workspace is at least 64rem wide; one column below (UI-4.1). */}
      <div className="grid min-w-0 gap-x-8 @5xl/workspace:grid-cols-2">
        <HomeContentSection
          allHref={`/app/personal/news${currentHospital ? `?hospital=${encodeURIComponent(currentHospital.relationshipId)}` : ""}`}
          emptyMessage={currentHospital
            ? `ยังไม่มีข่าวสารจาก${currentHospital.hospitalName}`
            : "ยังไม่มีโรงพยาบาลที่พร้อมแสดงข่าวสาร"}
          failure={newsFailed ? { message: "โหลดข่าวสารไม่สำเร็จ", retryHref } : undefined}
          heading="ข่าวสาร"
          id="personal-home-news-heading"
          itemHrefBase="/app/personal/knowledge"
          items={newsItems ?? []}
        />
        <HomeContentSection
          allHref={`/app/personal/knowledge${currentHospital ? `?hospital=${encodeURIComponent(currentHospital.relationshipId)}` : ""}`}
          emptyMessage={currentHospital
            ? `ยังไม่มีสื่อความรู้จาก${currentHospital.hospitalName}`
            : "ยังไม่มีโรงพยาบาลที่พร้อมแสดงสื่อความรู้"}
          failure={knowledgeFailed ? { message: "โหลดสื่อความรู้ไม่สำเร็จ", retryHref } : undefined}
          heading="สื่อความรู้"
          id="personal-home-knowledge-heading"
          itemHrefBase="/app/personal/knowledge"
          items={knowledgeItems ?? []}
        />
      </div>
      {currentHospital?.hospitalContact.status === "AVAILABLE" ? (
        <HomeHospitalContact contact={currentHospital.hospitalContact.contact} hospitalName={currentHospital.hospitalName} />
      ) : currentHospital ? (
        // The ติดต่อเรา menu opens this anchor, so a Hospital without a shown contact still says so here.
        <section aria-labelledby="personal-hospital-contact-heading" className="mt-8 min-w-0 border-t border-border pt-6" id="personal-hospital-contact">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="personal-hospital-contact-heading">ติดต่อโรงพยาบาล</h2>
          <p className="mt-1 break-words text-sm leading-6 text-text-muted">{currentHospital.hospitalName}</p>
          <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีข้อมูลติดต่อ</p>
        </section>
      ) : null}
      <HomeSupportLink />
    </div>
  );
}
