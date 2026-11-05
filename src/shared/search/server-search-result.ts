/** One page of a server-side search, as a search server action answers it. */
export type ServerSearchPageResult<T> =
  | {
      status: "OK";
      items: T[];
      /** The page the server answered, clamped to the last page. */
      page: number;
      totalPages: number;
      hasPreviousPage: boolean;
      hasNextPage: boolean;
    }
  | { status: "ERROR"; message: string };
