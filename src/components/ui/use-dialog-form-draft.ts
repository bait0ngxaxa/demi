"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

type EditableField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

type FieldDraft = {
  name: string;
  value: string;
  checked: boolean | null;
};

const editableFieldSelector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea';

/** Keeps editable values for the same task context and drops them when that context changes. */
export function useDialogFormDraft(open: boolean, contextKey?: string): {
  formRef: React.RefObject<HTMLFormElement | null>;
  preserveDraft: () => boolean;
  clearDraft: () => void;
} {
  const formRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef<FieldDraft[] | null>(null);
  const baselineRef = useRef<FieldDraft[] | null>(null);
  const contextKeyRef = useRef(contextKey);
  const restoredSecondPassRef = useRef(false);
  const [restoreRevision, setRestoreRevision] = useState(0);

  useLayoutEffect(() => {
    if (!Object.is(contextKeyRef.current, contextKey)) {
      contextKeyRef.current = contextKey;
      draftRef.current = null;
      baselineRef.current = null;
      restoredSecondPassRef.current = false;
    }

    if (!open) {
      restoredSecondPassRef.current = false;
      return;
    }

    const form = formRef.current;
    const draft = draftRef.current;
    if (!form) {
      return;
    }

    if (!draft) {
      baselineRef.current = readFieldDraft(form);
      return;
    }

    const fields = Array.from(form.querySelectorAll<EditableField>(editableFieldSelector));
    for (const [index, entry] of draft.entries()) {
      const field = fields[index];
      if (!field || field.name !== entry.name) {
        continue;
      }

      if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
        setNativeFieldValue(field, "checked", entry.checked ?? false);
      } else {
        setNativeFieldValue(field, "value", entry.value);
      }
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // A restored controlled select may add conditional fields (for example the OTHER label field).
    // A second layout pass restores those fields after React has committed that state change.
    if (!restoredSecondPassRef.current) {
      restoredSecondPassRef.current = true;
      setRestoreRevision((current) => current + 1);
    } else {
      restoredSecondPassRef.current = false;
      baselineRef.current = readFieldDraft(form);
    }
  }, [contextKey, open, restoreRevision]);

  const preserveDraft = useCallback((): boolean => {
    const form = formRef.current;
    if (!form) {
      return false;
    }

    const current = readFieldDraft(form);
    const hasDraft = draftRef.current !== null || !sameDraft(current, baselineRef.current);
    draftRef.current = hasDraft ? current : null;
    return hasDraft;
  }, []);

  const clearDraft = useCallback((): void => {
    draftRef.current = null;
    baselineRef.current = null;
    restoredSecondPassRef.current = false;
  }, []);

  return { formRef, preserveDraft, clearDraft };
}

function readFieldDraft(form: HTMLFormElement): FieldDraft[] {
  return Array.from(form.querySelectorAll<EditableField>(editableFieldSelector)).map((field) => ({
    name: field.name,
    value: field.value,
    checked: field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")
      ? field.checked
      : null,
  }));
}

function sameDraft(left: FieldDraft[], right: FieldDraft[] | null): boolean {
  return right !== null && left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return other !== undefined && entry.name === other.name && entry.value === other.value && entry.checked === other.checked;
  });
}

function setNativeFieldValue(field: EditableField, property: "value" | "checked", value: string | boolean): void {
  const prototype = Object.getPrototypeOf(field) as object;
  const setter = Object.getOwnPropertyDescriptor(prototype, property)?.set;
  if (setter) {
    setter.call(field, value);
  } else if (property === "checked" && field instanceof HTMLInputElement) {
    field.checked = value === true;
  } else if (property === "value") {
    field.value = typeof value === "string" ? value : "";
  }
}
