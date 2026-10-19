import { Alert } from "@/components/ui/alert";

export function PatientSelfSessionExpiredAlert({
  href,
  message,
  className,
}: {
  href: string;
  message: string;
  className?: string;
}): React.JSX.Element {
  return (
    <Alert className={className} role="alert" variant="danger">
      <p>{message}</p>
      <a className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4" href={href}>
        เข้าสู่ระบบ DEMI
      </a>
    </Alert>
  );
}
