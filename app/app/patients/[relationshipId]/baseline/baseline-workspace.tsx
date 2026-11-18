"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PatientBaselinePatientSummary } from "@/modules/patient-baseline/services/patient-baseline-access-service";
import type { PatientBaselineProjection } from "@/modules/patient-baseline/services/patient-baseline-query-service";

import { PatientBaselineForm } from "./baseline-form";
import { PatientBaselineView } from "./baseline-view";

type PatientBaselineWorkspaceProps = {
  baseline: PatientBaselineProjection;
  patient: PatientBaselinePatientSummary;
  relationshipId: string;
  /** The actor may record a Baseline here and no Program links this one yet (server-resolved). */
  canEdit: boolean;
  lockedByProgram: boolean;
};

/**
 * The recorded Baseline, with an in-place edit mode until a Program links it. Each edit starts
 * from the latest server values, and a save refreshes the page without a document reload.
 */
export function PatientBaselineWorkspace({
  baseline,
  canEdit,
  lockedByProgram,
  patient,
  relationshipId,
}: PatientBaselineWorkspaceProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) {
      window.scrollTo({ top: 0 });
    } else if (wasEditing.current) {
      // Back on the view after a save or cancel: keep keyboard focus on the control that opened the edit.
      editButton.current?.focus();
    }
    wasEditing.current = editing;
  }, [editing]);

  if (editing && canEdit) {
    return (
      <PatientBaselineForm
        edit={{ baseline, onCancel: () => setEditing(false), onSaved: () => setEditing(false) }}
        patient={patient}
        relationshipId={relationshipId}
      />
    );
  }

  return (
    <PatientBaselineView
      baseline={baseline}
      editAction={
        canEdit ? (
          <Button onClick={() => setEditing(true)} ref={editButton} variant="secondary">
            แก้ไขข้อมูลตั้งต้น
          </Button>
        ) : null
      }
      lockedByProgram={lockedByProgram}
      patient={patient}
    />
  );
}
