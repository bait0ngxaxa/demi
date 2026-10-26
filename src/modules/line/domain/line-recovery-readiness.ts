const MAX_REACHABILITY_AGE_MS = 24 * 60 * 60 * 1000;

export type LineRecoveryReadiness =
  | { status: "UNLINKED"; recoveryConfigured: boolean }
  | { status: "READY"; recoveryConfigured: true; observedAt: string }
  | {
      status: "UNCONFIRMED";
      recoveryConfigured: true;
      reason: "STATUS_UNAVAILABLE" | "FRIENDSHIP_UNCONFIRMED" | "STALE_OBSERVATION";
      observedAt: string | null;
      reachability: "UNKNOWN" | "FRIEND" | "NOT_FRIEND" | null;
    }
  | { status: "UNAVAILABLE"; recoveryConfigured: false };

export function resolveLineRecoveryReadiness(input: {
  accountStatus: "LINKED" | "UNLINKED" | "INELIGIBLE" | "UNAVAILABLE";
  reachability: "UNKNOWN" | "FRIEND" | "NOT_FRIEND" | null;
  reachabilityObservedAt: Date | null;
  recoveryConfigured: boolean;
  now: Date;
}): LineRecoveryReadiness {
  if (input.accountStatus === "UNLINKED") {
    return { status: "UNLINKED", recoveryConfigured: input.recoveryConfigured };
  }
  if (!input.recoveryConfigured) return { status: "UNAVAILABLE", recoveryConfigured: false };
  if (input.accountStatus !== "LINKED") {
    return {
      status: "UNCONFIRMED",
      recoveryConfigured: true,
      reason: "STATUS_UNAVAILABLE",
      observedAt: null,
      reachability: null,
    };
  }

  const observedAt = input.reachabilityObservedAt;
  const observedAtIso = observedAt && Number.isFinite(observedAt.getTime()) ? observedAt.toISOString() : null;
  if (!observedAt || input.reachability !== "FRIEND") {
    return {
      status: "UNCONFIRMED",
      recoveryConfigured: true,
      reason: "FRIENDSHIP_UNCONFIRMED",
      observedAt: observedAtIso,
      reachability: input.reachability,
    };
  }

  if (!observedAtIso) {
    return {
      status: "UNCONFIRMED",
      recoveryConfigured: true,
      reason: "STALE_OBSERVATION",
      observedAt: null,
      reachability: input.reachability,
    };
  }

  const observationAge = input.now.getTime() - observedAt.getTime();
  if (!Number.isFinite(observationAge) || observationAge < 0 || observationAge > MAX_REACHABILITY_AGE_MS) {
    return {
      status: "UNCONFIRMED",
      recoveryConfigured: true,
      reason: "STALE_OBSERVATION",
      observedAt: observedAtIso,
      reachability: input.reachability,
    };
  }

  return { status: "READY", recoveryConfigured: true, observedAt: observedAtIso };
}
