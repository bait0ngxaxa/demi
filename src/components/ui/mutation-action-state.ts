"use client";

import { unstable_rethrow } from "next/navigation";
import { startTransition, useActionState, useState, type FormEvent } from "react";

export const unknownOutcomeMessage =
  "ระบบยังยืนยันผลการดำเนินการไม่ได้ กรุณาโหลดข้อมูลล่าสุดก่อนดำเนินการซ้ำ";

export const connectionFailureMessage = "เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง";

/**
 * `useActionState` for mutations whose request may fail before a result is confirmed
 * (network loss, server crash). A thrown dispatch keeps the previous state and reports
 * an unknown outcome instead of unmounting the page into an error boundary. The flag
 * stays set until a later dispatch is confirmed or the page is reloaded.
 * Next.js navigation signals (redirect, notFound) are rethrown unchanged.
 */
export function useMutationActionState<State, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
): [state: Awaited<State>, dispatch: (payload: Payload) => void, pending: boolean, unknownOutcome: boolean] {
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [state, dispatch, pending] = useActionState<State, Payload>(async (previous, payload): Promise<Awaited<State>> => {
    try {
      const next = await action(previous, payload);
      setUnknownOutcome(false);
      return next;
    } catch (error) {
      unstable_rethrow(error);
      setUnknownOutcome(true);
      return previous;
    }
  }, initialState);

  return [state, dispatch, pending, unknownOutcome];
}

/**
 * For actions that are safe to repeat (sign-in, lookups): a request that fails before the
 * server answers becomes an ordinary retryable failure state.
 */
export function withConnectionFailure<State, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  toFailureState: (previous: Awaited<State>) => Awaited<State>,
): (state: Awaited<State>, payload: Payload) => Promise<Awaited<State>> {
  return async (previous, payload): Promise<Awaited<State>> => {
    try {
      return await action(previous, payload);
    } catch (error) {
      unstable_rethrow(error);
      return toFailureState(previous);
    }
  };
}

/**
 * React resets uncontrolled fields after every `<form action>` call, including calls that
 * return validation errors. Dispatching from `onSubmit` keeps what the user typed; the
 * `action` prop stays on the form so submissions made before hydration still work.
 */
export function submitPreservingInput(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(
      event.currentTarget,
      (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
        submitter.form === event.currentTarget
        ? submitter
        : undefined,
    );
    startTransition(() => dispatch(formData));
  };
}
