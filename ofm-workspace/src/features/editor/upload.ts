import { supabase } from "@/lib/supabase";
import { getCurrentWorkspaceId } from "@/stores/workspace-store";

const BUCKET = "page-assets";
// Short TTL: nodes store the object PATH and resolve a fresh signed URL on
// render, so access stays RLS-gated and revocable (a deactivated user or a
// forwarded link stops working within the hour, not a year).
const SIGNED_TTL = 60 * 60;

export interface UploadedAsset {
  path: string;
  name: string;
  size: number;
}

export async function uploadAsset(file: File): Promise<UploadedAsset> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in to upload.");

  const ws = getCurrentWorkspaceId();
  if (!ws) throw new Error("No workspace selected.");
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot) : "";
  // <workspace>/<uid>/<uuid><ext> so storage RLS can scope by workspace + owner.
  const path = `${ws}/${uid}/${crypto.randomUUID()}${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;

  return { path, name: file.name, size: file.size };
}

/**
 * Upload a custom icon image to the PUBLIC "icons" bucket and return a stable
 * public URL. Icons render everywhere, so they live in a public bucket (no
 * signed-URL churn). Stored on the entity as `img:<publicUrl>`.
 */
export async function uploadIcon(file: File): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in to upload.");
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot) : "";
  const path = `${uid}/${crypto.randomUUID()}${ext}`; // <uid>/… so storage RLS scopes by owner
  const { error } = await supabase.storage
    .from("icons")
    .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("icons").getPublicUrl(path).data.publicUrl;
}

/** Mint a short-lived signed URL for a stored asset path (resolved on render). */
export async function signedAssetUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  if (error) return null;
  return data.signedUrl;
}
