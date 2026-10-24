import { redirect } from "next/navigation";

/** Retained for bookmarks; the destination revalidates OWNER/network authority. */
export default function ParentAreaOverviewPage(): never {
  redirect("/app/hospitals/reporting?scope=network");
}
