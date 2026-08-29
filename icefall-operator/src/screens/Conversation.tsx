/**
 * `/operator/inbox/:id` — kept only as a redirect.
 *
 * Conversations now open inside the unified Leads & Messages screen. The id
 * carried here is a conversation id; the unified screen resolves either a lead
 * id or a conversation id, so every stored notification href and old deep link
 * (`/operator/inbox/cvn-…`) still lands on the same thread.
 */

import { Navigate, useParams } from "react-router-dom";

export default function Conversation() {
  const { id = "" } = useParams();
  return <Navigate to={id ? `/operator/leads/${id}` : "/operator/leads"} replace />;
}
