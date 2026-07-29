import { supabase } from "@/lib/supabase";

/**
 * Establishes a Supabase session from an auth callback URL — either the tokens
 * in the hash fragment (implicit/invite links: #access_token&refresh_token) or
 * a PKCE `code` query param. Pass the deep-link URL on desktop; omit to read
 * the browser's current location (web fallback).
 *
 * Returns true if a session was established.
 */
export async function establishSessionFromUrl(rawUrl?: string): Promise<boolean> {
  let hashStr = "";
  let searchStr = "";

  if (rawUrl) {
    const hashIdx = rawUrl.indexOf("#");
    const qIdx = rawUrl.indexOf("?");
    hashStr = hashIdx >= 0 ? rawUrl.slice(hashIdx + 1) : "";
    searchStr =
      qIdx >= 0 ? rawUrl.slice(qIdx + 1, hashIdx >= 0 ? hashIdx : undefined) : "";
  } else {
    hashStr = window.location.hash.replace(/^#/, "");
    searchStr = window.location.search.replace(/^\?/, "");
  }

  const hashParams = new URLSearchParams(hashStr);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return !error;
  }

  const code = new URLSearchParams(searchStr).get("code") ?? hashParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }

  return false;
}
