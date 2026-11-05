import { z } from "zod";

import type { ServerSearchPageResult } from "./server-search-result";

/** One person an assignee picker offers: a user id (or, for the Patient form, an OSM relationship id). */
export type AssigneeOption = {
  id: string;
  displayName: string;
  /** Shown after the name, e.g. a contact phone or a profession. */
  detail?: string | null;
};

export type AssigneeSearchResult = ServerSearchPageResult<AssigneeOption>;

/** People shown per page of a searchable assignee picker (อสม. or Hospital staff). */
export const ASSIGNEE_SEARCH_PAGE_SIZE = 10;

/** The longest name search an assignee picker sends. */
export const ASSIGNEE_SEARCH_MAX_LENGTH = 120;

/** A trimmed name search; blank means "the first page of everyone eligible". */
export const assigneeSearchTermSchema = z
  .string()
  .trim()
  .max(ASSIGNEE_SEARCH_MAX_LENGTH)
  .optional()
  .transform((value) => value || undefined);
