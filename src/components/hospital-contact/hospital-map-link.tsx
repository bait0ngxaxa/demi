import {
  buildHospitalMapsUrl,
  type HospitalLocation,
} from "@/modules/hospital-contact/domain/hospital-location";

const mapLinkClassName =
  "inline-flex min-h-11 max-w-full items-center break-words rounded-control text-sm font-medium text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

/**
 * A plain link: no map host is contacted until the person taps it. It opens Google Maps (the app
 * on phones) in a new context, without sending this page's URL as the referrer.
 */
export function HospitalMapLink({
  className,
  hospitalName,
  location,
}: {
  className?: string;
  hospitalName: string;
  location: HospitalLocation;
}): React.JSX.Element {
  return (
    <a
      aria-label={`เปิดแผนที่ ${hospitalName} (เปิดหน้าใหม่)`}
      className={className ? `${mapLinkClassName} ${className}` : mapLinkClassName}
      href={buildHospitalMapsUrl(location)}
      rel="noopener noreferrer"
      target="_blank"
    >
      เปิดแผนที่
    </a>
  );
}
