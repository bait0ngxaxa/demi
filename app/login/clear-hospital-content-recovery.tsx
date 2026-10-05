"use client";

import { useEffect } from "react";

import { clearHospitalContentCreateRecoveryMarkers } from "@/modules/hospital-content/transport/create-recovery-storage";

export function ClearHospitalContentRecoveryOnLogin(): null {
  useEffect(() => {
    try {
      clearHospitalContentCreateRecoveryMarkers(window.sessionStorage);
    } catch {
      // Session storage may be unavailable; recovery remains account-bound.
    }
  }, []);

  return null;
}
