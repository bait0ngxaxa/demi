import type { MobileNavigationIcon } from "./mobile-tab-projection";

const iconPaths: Record<MobileNavigationIcon, React.ReactNode> = {
  home: (
    <>
      <path d="m3.5 10.5 8.5-7 8.5 7" />
      <path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" />
    </>
  ),
  appointments: (
    <>
      <path d="M7 3.5v3M17 3.5v3M4.5 6.5h15v14h-15zM4.5 10h15" />
      <path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01" />
    </>
  ),
  wellness: (
    <>
      <path d="M20.5 8.8a4.8 4.8 0 0 0-8.5-3.1 4.8 4.8 0 0 0-8.5 3.1c0 4.8 8.5 10.7 8.5 10.7s8.5-5.9 8.5-10.7Z" />
      <path d="M4.5 12h4l1.8-3.2 2.8 6.4 1.8-3.2h4" />
    </>
  ),
  care: (
    <>
      <path d="M12 21s-8.5-5.1-8.5-11.2a4.8 4.8 0 0 1 8.5-3.1 4.8 4.8 0 0 1 8.5 3.1C20.5 15.9 12 21 12 21Z" />
      <path d="M8.5 12h2l1.3-2.2 2.1 4.4 1.2-2.2h1.4" />
    </>
  ),
  patients: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20v-1.3a5.5 5.5 0 0 1 11 0V20zM16 5.2a3.2 3.2 0 0 1 0 6.2M17 14a4.7 4.7 0 0 1 3.5 4.5V20h-4" />
    </>
  ),
  screening: (
    <>
      <path d="M8 4.5h8a2 2 0 0 1 2 2v13h-12v-13a2 2 0 0 1 2-2ZM9 4.5v-1h6v1" />
      <path d="m8.5 13 2.2 2.2 4.8-5" />
    </>
  ),
  followup: (
    <>
      <path d="M20 11.5a7.8 7.8 0 0 1-8 7.5 8.6 8.6 0 0 1-3.4-.7L4 20l1.3-3.8A7.1 7.1 0 0 1 4 12c0-4.2 3.6-7.5 8-7.5s8 3.2 8 7Z" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
    </>
  ),
  hospital: (
    <>
      <path d="M4.5 20V5.5h15V20zM8 8.5h2M14 8.5h2M8 12h2M14 12h2M10 20v-4h4v4" />
      <path d="M10 2.5h4M12 1v3" />
    </>
  ),
  workforce: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20v-1.2a5.5 5.5 0 0 1 11 0V20z" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.5 14.7a4.2 4.2 0 0 1 4 4.1V20h-3" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M7.5 16v-4M12 16V7M16.5 16V9.5" />
    </>
  ),
  review: (
    <>
      <path d="M12 3.2 19 6v5.1c0 4.7-3 7.7-7 9.7-4-2-7-5-7-9.7V6z" />
      <path d="m8.5 11.8 2.3 2.3 4.8-4.8" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
};

export function MobileNavigationGlyph({
  icon,
}: {
  icon: MobileNavigationIcon;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      {iconPaths[icon]}
    </svg>
  );
}
