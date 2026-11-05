import { ConflictError } from "@/shared/errors/application-error";

/**
 * The whole bulk batch was rejected because some selected relationships are no longer active
 * patients of the Hospital or already have a current OSM. Carries only ids the caller submitted,
 * sorted, so the owner can drop exactly those and confirm the rest again.
 */
export class BulkAssignmentSelectionUnavailableError extends ConflictError {
  readonly unavailableRelationshipIds: string[];

  constructor(unavailableRelationshipIds: readonly string[]) {
    super("Some selected patients are unavailable for bulk assignment");
    this.name = "BulkAssignmentSelectionUnavailableError";
    this.unavailableRelationshipIds = [...new Set(unavailableRelationshipIds)].sort();
  }
}
