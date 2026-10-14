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

type DocumentScrollLock = {
  activeDialogs: number;
  previousOverflow: string;
};

const documentScrollLocks = new WeakMap<ModalDialogDocument, DocumentScrollLock>();

function acquireDocumentScrollLock(document: ModalDialogDocument): () => void {
  let lock = documentScrollLocks.get(document);
  if (!lock) {
    lock = { activeDialogs: 0, previousOverflow: document.body.style.overflow };
    documentScrollLocks.set(document, lock);
    document.body.style.overflow = "hidden";
  }
  lock.activeDialogs += 1;

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;

    lock.activeDialogs -= 1;
    if (lock.activeDialogs === 0) {
      document.body.style.overflow = lock.previousOverflow;
      documentScrollLocks.delete(document);
    }
  };
}

/**
 * Opens a native modal dialog (top layer, inert background, native focus containment) and locks page
 * scrolling. Scroll locking is shared per document so nested dialogs keep the page locked until the
 * last dialog closes. The returned cleanup closes the dialog and releases its lock once.
 */
export function setupModalDialogLifecycle({
  document,
  dialog,
}: ModalDialogLifecycleOptions): () => void {
  if (!dialog.open) {
    dialog.showModal();
  }
  const releaseScrollLock = acquireDocumentScrollLock(document);

  return () => {
    try {
      if (dialog.open) {
        dialog.close();
      }
    } finally {
      releaseScrollLock();
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
