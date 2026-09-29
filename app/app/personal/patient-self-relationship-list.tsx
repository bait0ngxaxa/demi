import type { PatientSelfContext } from "@/modules/patient-self/services/patient-self-query-service";

type PatientSelfHospitalRelationship = PatientSelfContext["hospitalRelationships"][number];

export function PatientSelfRelationshipList({
  relationships,
}: {
  relationships: readonly PatientSelfHospitalRelationship[];
}): React.JSX.Element {
  return (
    <section aria-labelledby="patient-self-hospitals-heading" className="mt-8">
      <h2
        className="text-xl font-semibold tracking-[-0.02em] text-text"
        id="patient-self-hospitals-heading"
      >
        โรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย
      </h2>
      {relationships.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {relationships.map((relationship) => (
            <li className="min-w-0 py-4" key={`${relationship.hospitalCode}-${relationship.hospitalName}`}>
              <h3 className="break-words font-semibold text-text">{relationship.hospitalName}</h3>
              <dl className="mt-2 grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-text-muted">รหัสโรงพยาบาล</dt>
                  <dd className="mt-0.5 break-words font-medium text-text">{relationship.hospitalCode}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-text-muted">รหัสผู้ป่วยที่โรงพยาบาล</dt>
                  <dd className="mt-0.5 break-words font-medium text-text">
                    {relationship.hospitalNumber ?? "ยังไม่ได้บันทึก"}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-text-muted">
          ยังไม่มีความสัมพันธ์กับโรงพยาบาลที่พร้อมใช้งาน
        </p>
      )}
    </section>
  );
}
