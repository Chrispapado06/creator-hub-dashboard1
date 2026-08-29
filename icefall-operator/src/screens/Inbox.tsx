/**
 * `/operator/inbox` — kept only as a redirect.
 *
 * The mockup unifies leads and conversations into one two-pane screen at
 * `/operator/leads` (Leads & Messages). The inbox route survives so old
 * bookmarks and spec §14's route list keep resolving, but there is no second
 * inbox screen for the unified one to drift from.
 */

import { Navigate } from "react-router-dom";

export default function Inbox() {
  return <Navigate to="/operator/leads" replace />;
}
