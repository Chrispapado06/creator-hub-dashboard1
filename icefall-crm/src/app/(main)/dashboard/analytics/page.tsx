import { redirect } from "next/navigation";

/**
 * Analytics has two scopes — Web and App — and no meaningful "both" view yet,
 * because the two products are measured differently. Landing here sends you to
 * Web, the default, rather than showing a chooser with nothing behind it.
 */
export default function Page() {
  redirect("/dashboard/analytics/web");
}
