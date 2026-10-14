import { describe, expect, it, vi } from "vitest";

import { decideModalDialogNativeClose, setupModalDialogLifecycle } from "./modal-dialog-lifecycle";

type FakeDialog = {
  open: boolean;
  showModal: () => void;
  close: () => void;
};

function fakeDialog(open = false): FakeDialog {
  const dialog: FakeDialog = {
    open,
    showModal: vi.fn<() => void>(() => {
      dialog.open = true;
    }),
    close: vi.fn<() => void>(() => {
      dialog.open = false;
    }),
  };
  return dialog;
}

describe("setupModalDialogLifecycle", () => {
  it("opens the dialog modally, locks page scroll and restores both on cleanup", () => {
    const document = { body: { style: { overflow: "auto" } } };
    const dialog = fakeDialog();

    const cleanup = setupModalDialogLifecycle({ document, dialog });

    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe("hidden");

    cleanup();

    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe("auto");
  });

  it("does not reopen an already open dialog or close one that is already closed", () => {
    const document = { body: { style: { overflow: "" } } };
    const dialog = fakeDialog(true);

    const cleanup = setupModalDialogLifecycle({ document, dialog });
    dialog.open = false;
    cleanup();

    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it("keeps page scrolling locked until every modal lifecycle has cleaned up", () => {
    const document = { body: { style: { overflow: "auto" } } };
    const firstDialog = fakeDialog();
    const secondDialog = fakeDialog();

    const cleanupFirst = setupModalDialogLifecycle({ document, dialog: firstDialog });
    const cleanupSecond = setupModalDialogLifecycle({ document, dialog: secondDialog });

    cleanupFirst();
    cleanupFirst();
    expect(document.body.style.overflow).toBe("hidden");

    cleanupSecond();
    expect(document.body.style.overflow).toBe("auto");
  });
});

describe("decideModalDialogNativeClose", () => {
  it("lets a dismissible dialog close and keeps a busy dialog open", () => {
    expect(decideModalDialogNativeClose(true)).toBe("REQUEST_CLOSE");
    expect(decideModalDialogNativeClose(false)).toBe("REOPEN");
  });
});
