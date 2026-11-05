"use client";

import { useId, useState } from "react";

import { AssigneeSearchPicker, type AssigneeOption } from "@/components/assignee/assignee-search-picker";
import { searchWorkAppointmentResponsibleFilterAction } from "@/modules/appointments/transport/assignee-search-actions";

/**
 * The list's responsible-person filter for a direct operator: a server search over the selected Hospital's operators.
 * The chosen person travels in the list form's `responsibleUserId`; the picker's own controls belong to no form.
 */
export function ResponsibleFilterPicker({
  hospitalId,
  selected: initialSelected,
}: {
  hospitalId: string;
  /** The person the URL's filter names, resolved on the server, so it is named even when not on the page shown. */
  selected: AssigneeOption | null;
}): React.JSX.Element {
  const [selected, setSelected] = useState<AssigneeOption | null>(initialSelected);
  const detachedFormId = `${useId()}-responsible-filter`;
  return (
    <fieldset className="min-w-0 sm:col-span-2 lg:col-span-4">
      <legend className="text-sm font-semibold text-text">ผู้รับผิดชอบ</legend>
      {/* "ทุกคน" sends no filter at all. */}
      {selected ? <input name="responsibleUserId" type="hidden" value={selected.id} /> : null}
      <AssigneeSearchPicker
        disabled={false}
        formId={detachedFormId}
        hospitalId={hospitalId}
        inputName="responsible-filter"
        noneOption="ทุกคน"
        onSelect={setSelected}
        search={(query, page) => searchWorkAppointmentResponsibleFilterAction(hospitalId, query, page)}
        selected={selected}
        variant="staff"
      />
    </fieldset>
  );
}
