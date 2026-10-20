export type HomeHospitalOption = {
  relationshipId: string;
  hospitalName: string;
};

export function HomeHospitalChip({
  options,
  selectedRelationshipId,
  selectedHospitalName,
}: {
  options: readonly HomeHospitalOption[];
  selectedRelationshipId: string | null;
  selectedHospitalName: string | null;
}): React.JSX.Element {
  if (selectedRelationshipId === null || selectedHospitalName === null) {
    return (
      <p className="mt-3 inline-flex min-h-12 items-center rounded-full border border-white/35 bg-white/10 px-4 text-sm text-white">
        ยังไม่มีโรงพยาบาลที่พร้อมใช้งาน
      </p>
    );
  }

  if (options.length < 2) {
    return (
      <p className="mt-3 inline-flex min-h-12 max-w-full items-center rounded-full border border-white/35 bg-white/10 px-4 text-sm font-medium text-white">
        <span className="mr-2 text-white/75">โรงพยาบาล</span>
        <span className="break-words">{selectedHospitalName}</span>
      </p>
    );
  }

  return (
    <form action="/app/personal" className="mt-3 flex max-w-full flex-wrap items-end gap-2" method="get">
      <div className="min-w-0 flex-1">
        <label className="mb-1 block text-xs font-medium text-white/80" htmlFor="personal-home-hospital">
          โรงพยาบาลปัจจุบัน
        </label>
        <select
          className="min-h-12 w-full max-w-full rounded-control border border-white/40 bg-surface px-3 text-sm font-medium text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          defaultValue={selectedRelationshipId}
          id="personal-home-hospital"
          name="hospital"
        >
          {options.map((option) => (
            <option key={option.relationshipId} value={option.relationshipId}>
              {option.hospitalName}
            </option>
          ))}
        </select>
      </div>
      <button
        className="min-h-12 shrink-0 rounded-control border border-white/50 px-4 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        type="submit"
      >
        เปลี่ยน
      </button>
    </form>
  );
}
