import { HospitalContentStatus, type HospitalContentCategory } from "@prisma/client";

export type HospitalContentEditableFields = {
  title: string;
  body: string;
  category: HospitalContentCategory;
  sourceText: string | null;
};

export type HospitalContentMutationCurrent = HospitalContentEditableFields & {
  status: HospitalContentStatus;
  updatedAt: Date;
};

export type HospitalContentMutationCommand = "EDIT" | "PUBLISH" | "WITHDRAW" | "ARCHIVE";
export type HospitalContentMutationDecision = "UPDATED" | "NOOP" | "PUBLISHED" | "WITHDRAWN" | "ARCHIVED" | "CONFLICT";

function fieldsEqual(current: HospitalContentEditableFields, desired: HospitalContentEditableFields): boolean {
  return (
    current.title === desired.title &&
    current.body === desired.body &&
    current.category === desired.category &&
    current.sourceText === desired.sourceText
  );
}

export function decideHospitalContentMutation(input: {
  command: HospitalContentMutationCommand;
  current: HospitalContentMutationCurrent;
  expectedUpdatedAt: string;
  desired?: HospitalContentEditableFields;
}): HospitalContentMutationDecision {
  if (new Date(input.expectedUpdatedAt).getTime() !== input.current.updatedAt.getTime()) {
    return "CONFLICT";
  }

  if (input.command === "EDIT") {
    if (input.current.status !== HospitalContentStatus.DRAFT || !input.desired) {
      return "CONFLICT";
    }

    return fieldsEqual(input.current, input.desired) ? "NOOP" : "UPDATED";
  }

  if (input.command === "PUBLISH") {
    return input.current.status === HospitalContentStatus.DRAFT ? "PUBLISHED" : "CONFLICT";
  }

  if (input.command === "WITHDRAW") {
    return input.current.status === HospitalContentStatus.PUBLISHED ? "WITHDRAWN" : "CONFLICT";
  }

  return input.current.status === HospitalContentStatus.ARCHIVED ? "CONFLICT" : "ARCHIVED";
}

export const hospitalContentMutationInternals = { fieldsEqual };
