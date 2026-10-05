export type HospitalContactValues = {
  addressText: string | null;
  phoneNumber: string | null;
};

export type CurrentHospitalContact = HospitalContactValues & {
  updatedAt: Date;
};

export type HospitalContactMutationDecision =
  | { kind: "NOOP_ABSENT" }
  | { kind: "CREATE" }
  | { kind: "NOOP" }
  | { kind: "UPDATE" }
  | { kind: "CONFLICT" };

export function decideHospitalContactMutation(input: {
  current: CurrentHospitalContact | null;
  expectedUpdatedAt: string | null;
  desired: HospitalContactValues;
}): HospitalContactMutationDecision {
  const desiredIsEmpty = input.desired.addressText === null && input.desired.phoneNumber === null;

  if (input.current === null) {
    if (input.expectedUpdatedAt !== null) {
      return { kind: "CONFLICT" };
    }

    return desiredIsEmpty ? { kind: "NOOP_ABSENT" } : { kind: "CREATE" };
  }

  if (
    input.expectedUpdatedAt === null ||
    !Number.isFinite(input.current.updatedAt.getTime()) ||
    new Date(input.expectedUpdatedAt).getTime() !== input.current.updatedAt.getTime()
  ) {
    return { kind: "CONFLICT" };
  }

  if (
    input.current.addressText === input.desired.addressText &&
    input.current.phoneNumber === input.desired.phoneNumber
  ) {
    return { kind: "NOOP" };
  }

  return { kind: "UPDATE" };
}

export function nextHospitalContactVersion(serverNow: Date, previousUpdatedAt: Date): Date {
  const serverNowMs = serverNow.getTime();
  const previousUpdatedAtMs = previousUpdatedAt.getTime();

  if (!Number.isFinite(serverNowMs) || !Number.isFinite(previousUpdatedAtMs)) {
    throw new Error("Invalid Hospital Contact version instant");
  }

  return new Date(Math.max(serverNowMs, previousUpdatedAtMs + 1));
}
