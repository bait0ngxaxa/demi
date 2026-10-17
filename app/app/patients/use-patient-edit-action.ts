"use client";

import { useCallback, useEffect, useRef } from "react";

import { notify } from "@/components/ui/notify";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import type { HospitalPatientEditState } from "@/modules/patient-hospital-profile/transport/hospital-patient-edit-actions";

type PatientEditCopy = {
  success: string;
  conflict: string;
  forbidden: string;
};

/** Thrown inside the awaited wrapper so the shared hook reports an unconfirmed outcome. */
class UnconfirmedPatientEdit extends Error {}

const initialState: HospitalPatientEditState = { status: "IDLE", message: "" };

/**
 * Patient profile, health history and name edits. The result is classified by `code`, never by
 * message text. Only a confirmed SUCCESS, CONFLICT or FORBIDDEN gives a Toast; UNAVAILABLE, a
 * thrown request and IDLE are not proof that nothing was saved, so they use the reload recovery
 * and the form stays locked. An error without a code (older contract) stays inline only.
 * Feedback is dropped when the form unmounted or now shows another relationship.
 */
export function usePatientEditAction(
  relationshipId: string,
  action: (state: HospitalPatientEditState, formData: FormData) => Promise<HospitalPatientEditState>,
  copy: PatientEditCopy,
) {
  const activeRelationshipId = useRef(relationshipId);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    activeRelationshipId.current = relationshipId;
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [relationshipId]);

  const submitEdit = async (
    previous: HospitalPatientEditState,
    formData: FormData,
  ): Promise<HospitalPatientEditState> => {
    const submittedRelationshipId = relationshipId;
    try {
      const result = await action(previous, formData);
      const current = mounted.current && activeRelationshipId.current === submittedRelationshipId;

      if (result.status === "IDLE" || (result.status === "ERROR" && result.code === "UNAVAILABLE")) {
        throw new UnconfirmedPatientEdit();
      }
      if (!current) {
        return result;
      }
      if (result.status === "SUCCESS") {
        notify.success(copy.success);
      } else if (result.code === "CONFLICT") {
        notify.warning(copy.conflict);
      } else if (result.code === "FORBIDDEN") {
        notify.error(copy.forbidden);
      }
      return result;
    } finally {
      inFlight.current = false;
    }
  };

  const [state, dispatchEdit, pending, unknownOutcome] = useMutationActionState<HospitalPatientEditState, FormData>(
    submitEdit,
    initialState,
  );
  // Block a second submit that arrives before React re-renders the pending state.
  const dispatch = useCallback(
    (formData: FormData): void => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      dispatchEdit(formData);
    },
    [dispatchEdit],
  );

  return { state, dispatch, pending, unknownOutcome };
}
