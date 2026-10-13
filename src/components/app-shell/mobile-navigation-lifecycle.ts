export const DESKTOP_NAV_MEDIA_QUERY = "(min-width: 1024px)";

type MobileNavigationDocument = {
  body: {
    style: {
      overflow: string;
    };
  };
  addEventListener(type: "keydown", listener: (event: KeyboardEvent) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyboardEvent) => void): void;
};

type MobileNavigationMediaQueryList = {
  matches: boolean;
  addEventListener(type: "change", listener: (event: MediaQueryListEvent) => void): void;
  removeEventListener(type: "change", listener: (event: MediaQueryListEvent) => void): void;
};

type MobileNavigationLifecycleOptions = {
  document: MobileNavigationDocument;
  dialog: Pick<HTMLDialogElement, "showModal" | "close">;
  mediaQueryList: MobileNavigationMediaQueryList;
  onDesktopTransition: () => void;
  onEscape: () => void;
  onTabKeyDown: (event: KeyboardEvent) => void;
};

export function setupMobileNavigationLifecycle({
  document,
  dialog,
  mediaQueryList,
  onDesktopTransition,
  onEscape,
  onTabKeyDown,
}: MobileNavigationLifecycleOptions): () => void {
  const previousOverflow = document.body.style.overflow;

  if (mediaQueryList.matches) {
    onDesktopTransition();
    return () => {};
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onEscape();
      return;
    }

    onTabKeyDown(event);
  }

  function handleMediaChange(event: MediaQueryListEvent): void {
    if (event.matches) {
      onDesktopTransition();
    }
  }

  dialog.showModal();
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", handleKeyDown);
  mediaQueryList.addEventListener("change", handleMediaChange);

  return () => {
    dialog.close();
    document.body.style.overflow = previousOverflow;
    document.removeEventListener("keydown", handleKeyDown);
    mediaQueryList.removeEventListener("change", handleMediaChange);
  };
}
