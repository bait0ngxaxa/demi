"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { notify } from "@/components/ui/notify";
import type { WorkforceErrorCode } from "@/modules/workforce/transport/action-state";

const useCommittedLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * What a settled request proves.
 * - `SUCCESS`: the server confirmed the intended change.
 * - `CONFLICT` / `FORBIDDEN`: the server confirmed it refused the change.
 * - `REJECTED`: confirmed invalid input; feedback stays inline.
 * - `UNCONFIRMED`: nothing is proven (`UNAVAILABLE`, `IDLE`, mismatched success, thrown request).
 */
export type MutationVerdict = "SUCCESS" | "CONFLICT" | "FORBIDDEN" | "REJECTED" | "UNCONFIRMED";

export type MutationNotice = { level: "success" | "warning" | "error"; message: string };

export type ScopedSubmission<State> = {
  id: number;
  kind: string;
  scope: string;
  snapshot: string;
  status: "PENDING" | MutationVerdict;
  state: State | null;
  message: string | null;
  resultSnapshot: string | null;
};

export type MutationDefinition<State> = {
  kind: string;
  action: (previous: State, formData: FormData) => Promise<State>;
  initialState: State;
  classify: (state: State, formData: FormData) => MutationVerdict;
  /** Static Thai summary for a confirmed verdict. It never receives user or credential data. */
  notice?: (verdict: MutationVerdict, state: State, formData: FormData) => MutationNotice | null;
  /** Inline text for a confirmed refusal. */
  message?: (state: State) => string | null;
  /** Authoritative marker (for example `updatedAt`) that the refreshed page props will carry. */
  resultSnapshot?: (state: State) => string | null;
  /** Runs for the current submission even if the displayed scope changed; `inScope` says whether it still matches. */
  onSettled?: (event: {
    submissionId: number;
    state: State;
    verdict: MutationVerdict;
    formData: FormData;
    inScope: boolean;
  }) => void;
  /** An extra lock owned by the caller (for example another workflow in the same page), read at submit time. */
  isBlocked?: () => boolean;
};

type Settlement<State> = {
  submission: ScopedSubmission<State>;
  state: State | null;
  verdict: MutationVerdict;
  notice: MutationNotice | null;
  message: string | null;
  resultSnapshot: string | null;
  settle?: (inScope: boolean) => void;
};

type SessionController<State> = {
  acquire: (extraBlocked: boolean) => boolean;
  begin: (kind: string) => ScopedSubmission<State>;
  finish: (settlement: Settlement<State>) => void;
};

export type ScopedMutationSession<State> = {
  controller: SessionController<State>;
  /** Latest submission of any mutation in this session, whatever scope it was submitted in. */
  latest: ScopedSubmission<State> | null;
  scope: string;
  /** True while a request is in flight, an unconfirmed outcome is unresolved, or the page awaits its refresh. */
  locked: boolean;
  unconfirmed: boolean;
};

/**
 * One session owns the "latest submission" of a group of mutations. Feedback, Toasts, locks and the
 * single page refresh all derive from that record, never from retained action state, so an older
 * result cannot refresh, toast or display after a newer one.
 */
export function useScopedMutationSession<State>({
  scope,
  snapshot = "",
  refreshOnSuccess = false,
  lockOnUnconfirmed = true,
  lockOnSuccess = false,
}: {
  scope: string;
  /** Authoritative page value that changes once the refreshed data arrives. */
  snapshot?: string;
  refreshOnSuccess?: boolean;
  /** Bulk replay is the sanctioned recovery for an unconfirmed outcome, so it must stay available. */
  lockOnUnconfirmed?: boolean;
  /** A terminal change (permanent release) must never be submitted a second time from this page. */
  lockOnSuccess?: boolean;
}): ScopedMutationSession<State> {
  const router = useRouter();
  const mountedRef = useRef(false);
  const scopeRef = useRef(scope);
  const snapshotRef = useRef(snapshot);
  const sequenceRef = useRef(0);
  const blockedRef = useRef(false);
  const latestRef = useRef<ScopedSubmission<State> | null>(null);
  const refreshedRef = useRef<number | null>(null);
  const [latest, setLatest] = useState<ScopedSubmission<State> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useCommittedLayoutEffect(() => {
    scopeRef.current = scope;
    snapshotRef.current = snapshot;
  }, [scope, snapshot]);

  const unconfirmed = latest?.status === "UNCONFIRMED";
  const awaitingRefresh =
    refreshOnSuccess &&
    latest?.status === "SUCCESS" &&
    latest.scope === scope &&
    snapshot === latest.snapshot &&
    snapshot !== latest.resultSnapshot;
  const lockedBySuccess = lockOnSuccess && latest?.status === "SUCCESS" && latest.scope === scope;
  const locked =
    latest?.status === "PENDING" || (lockOnUnconfirmed && unconfirmed) || awaitingRefresh || lockedBySuccess;

  useCommittedLayoutEffect(() => {
    blockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    if (
      !refreshOnSuccess ||
      latest?.status !== "SUCCESS" ||
      latest.scope !== scope ||
      refreshedRef.current === latest.id
    ) {
      return;
    }

    refreshedRef.current = latest.id;
    router.refresh();
  }, [latest, refreshOnSuccess, router, scope]);

  const controller = useMemo<SessionController<State>>(
    () => ({
      acquire(extraBlocked: boolean): boolean {
        if (blockedRef.current || extraBlocked) {
          return false;
        }

        blockedRef.current = true;
        return true;
      },
      begin(kind: string): ScopedSubmission<State> {
        sequenceRef.current += 1;
        const submission: ScopedSubmission<State> = {
          id: sequenceRef.current,
          kind,
          scope: scopeRef.current,
          snapshot: snapshotRef.current,
          status: "PENDING",
          state: null,
          message: null,
          resultSnapshot: null,
        };
        blockedRef.current = true;
        latestRef.current = submission;
        setLatest(submission);
        return submission;
      },
      finish({ submission, state, verdict, notice, message, resultSnapshot, settle }: Settlement<State>): void {
        if (!mountedRef.current || latestRef.current?.id !== submission.id) {
          return;
        }

        const completed: ScopedSubmission<State> = {
          ...submission,
          status: verdict,
          state,
          message,
          resultSnapshot,
        };
        latestRef.current = completed;
        setLatest(completed);
        blockedRef.current =
          verdict === "SUCCESS"
            ? refreshOnSuccess || lockOnSuccess
            : verdict === "UNCONFIRMED"
              ? lockOnUnconfirmed
              : false;

        const inScope = scopeRef.current === submission.scope;
        settle?.(inScope);

        if (inScope && notice) {
          notify[notice.level](notice.message);
        }
      },
    }),
    [lockOnSuccess, lockOnUnconfirmed, refreshOnSuccess],
  );

  return { controller, latest, scope, locked, unconfirmed };
}

/**
 * One mutation inside a session. `action` is a guarded form action: it acquires the session lock
 * synchronously, so a rapid second submit never reaches the Server Action. The wrapped request is
 * awaited here, which is the only place its Toast is emitted.
 */
export function useScopedMutation<State>(
  session: ScopedMutationSession<State>,
  definition: MutationDefinition<State>,
): {
  state: Awaited<State>;
  action: (formData: FormData) => void;
  pending: boolean;
  unknownOutcome: boolean;
} {
  const definitionRef = useRef(definition);
  useCommittedLayoutEffect(() => {
    definitionRef.current = definition;
  });
  const { controller } = session;

  const run = useCallback(
    async (previous: Awaited<State>, formData: FormData): Promise<Awaited<State>> => {
      const current = definitionRef.current;
      const submission = controller.begin(current.kind);
      let result: State;

      try {
        result = await current.action(previous as State, formData);
      } catch (error) {
        unstable_rethrow(error);
        controller.finish({
          submission,
          state: null,
          verdict: "UNCONFIRMED",
          notice: null,
          message: null,
          resultSnapshot: null,
        });
        throw error;
      }

      const verdict = current.classify(result, formData);
      controller.finish({
        submission,
        state: result,
        verdict,
        notice: current.notice?.(verdict, result, formData) ?? null,
        message: verdict === "CONFLICT" || verdict === "FORBIDDEN" || verdict === "REJECTED"
          ? current.message?.(result) ?? null
          : null,
        resultSnapshot: verdict === "SUCCESS" ? current.resultSnapshot?.(result) ?? null : null,
        settle: (inScope) =>
          current.onSettled?.({ submissionId: submission.id, state: result, verdict, formData, inScope }),
      });
      return result as Awaited<State>;
    },
    [controller],
  );

  const [state, dispatch, pending, unknownOutcome] = useMutationActionState<State, FormData>(
    run,
    definition.initialState as Awaited<State>,
  );

  const action = useCallback(
    (formData: FormData): void => {
      if (!controller.acquire(definitionRef.current.isBlocked?.() ?? false)) {
        return;
      }

      dispatch(formData);
    },
    [controller, dispatch],
  );

  return { state, action, pending, unknownOutcome };
}

type TypedWorkforceState =
  | { status: "IDLE" }
  | { status: "SUCCESS" }
  | { status: "ERROR"; code: WorkforceErrorCode };

/** `confirmsRequest` is true only when the success result is the one the submission asked for. */
export function classifyWorkforceState(state: TypedWorkforceState, confirmsRequest: boolean): MutationVerdict {
  if (state.status === "SUCCESS") {
    return confirmsRequest ? "SUCCESS" : "UNCONFIRMED";
  }

  if (state.status === "IDLE") {
    return "UNCONFIRMED";
  }

  switch (state.code) {
    case "CONFLICT":
      return "CONFLICT";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "INVALID_INPUT":
    case "CONFIGURATION":
      return "REJECTED";
    default:
      return "UNCONFIRMED";
  }
}

export function workforceStateMessage(state: { status: string; message?: string }): string | null {
  return state.status === "ERROR" && typeof state.message === "string" ? state.message : null;
}

export function standardNotice(messages: {
  success?: string;
  conflict?: string;
  forbidden?: string;
}): (verdict: MutationVerdict) => MutationNotice | null {
  return (verdict) => {
    if (verdict === "SUCCESS" && messages.success) {
      return { level: "success", message: messages.success };
    }

    if (verdict === "CONFLICT" && messages.conflict) {
      return { level: "warning", message: messages.conflict };
    }

    if (verdict === "FORBIDDEN" && messages.forbidden) {
      return { level: "error", message: messages.forbidden };
    }

    return null;
  };
}

export function formString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Inline feedback for the latest submission only, and only while its scope is the displayed one. */
export function ScopedMutationFeedback<State>({
  session,
  success,
}: {
  session: ScopedMutationSession<State>;
  success: (submission: ScopedSubmission<State>) => string;
}): React.JSX.Element | null {
  const { latest, scope } = session;

  if (!latest || latest.scope !== scope) {
    return null;
  }

  // Every success of these sessions has a Toast, which is the announcement; the Alert is the visible record.
  if (latest.status === "SUCCESS") {
    return (
      <Alert className="mt-4" role="none" variant="success">
        {success(latest)}
      </Alert>
    );
  }

  if ((latest.status === "CONFLICT" || latest.status === "FORBIDDEN" || latest.status === "REJECTED") && latest.message) {
    return (
      <Alert className="mt-4" role="alert" variant={latest.status === "CONFLICT" ? "warning" : "danger"}>
        {latest.message}
      </Alert>
    );
  }

  return null;
}
