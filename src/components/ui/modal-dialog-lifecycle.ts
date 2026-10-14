type ModalDialogDocument = {
  body: {
    style: {
      overflow: string;
    };
  };
};

type ModalDialogElement = Pick<HTMLDialogElement, "showModal" | "close" | "open">;

type ModalDialogLifecycleOptions = {
  document: ModalDialogDocument;
  dialog: ModalDialogElement;
};

/**
 * Opens a native modal dialog (top layer, inert background, native focus containment) and locks page
 * scrolling. The returned cleanup closes the dialog and restores the previous body overflow.
 */
export function setupModalDialogLifecycle({
  document,
  dialog,
}: ModalDialogLifecycleOptions): () => void {
  const previousOverflow = document.body.style.overflow;

  if (!dialog.open) {
    dialog.showModal();
  }
  document.body.style.overflow = "hidden";

  return () => {
    document.body.style.overflow = previousOverflow;

    if (dialog.open) {
      dialog.close();
    }
  };
}

export type ModalDialogCloseDecision = "REQUEST_CLOSE" | "REOPEN";

/**
 * A native dialog can close without the app asking for it (for example a browser close watcher that
 * ignores a cancelled Escape). A dismissible dialog asks its owner to close; a non-dismissible dialog
 * (a mutation in progress) is reopened so its state stays visible.
 */
export function decideModalDialogNativeClose(dismissible: boolean): ModalDialogCloseDecision {
  return dismissible ? "REQUEST_CLOSE" : "REOPEN";
}
