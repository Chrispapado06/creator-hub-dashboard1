// =====================================================================
// supabase/functions/public-page/index.ts   (Deno / Supabase Edge Function)
//
// PUBLIC (verify_jwt = false): serves a single PUBLISHED page to anyone with
// the link — like Notion's "Publish to web".
//
// NOTE: Supabase's *.supabase.co gateway force-serves `text/plain` + nosniff on
// functions AND storage (anti-XSS), so we can't render styled HTML here. We
// return a clean, readable text/markdown rendering instead. A fully-styled
// public page needs an external viewer (e.g. a Cloudflare Worker) — see
// supabase/README. This function also returns JSON when `?format=json` so such
// a viewer can fetch the page data.
//
// Security: uses service_role but HARD-FILTERS published = true.
// URL: https://<ref>.supabase.co/functions/v1/public-page/<public_token>
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Node = {
  type?: string;
  content?: Node[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
};

function inline(node: Node): string {
  return (node.content ?? [])
    .map((n) => {
      if (n.type === "text") {
        let t = n.text ?? "";
        for (const m of n.marks ?? []) {
          if (m.type === "bold") t = `**${t}**`;
          else if (m.type === "italic") t = `*${t}*`;
          else if (m.type === "code") t = "`" + t + "`";
          else if (m.type === "strike") t = `~~${t}~~`;
          else if (m.type === "link") t = `${t} (${m.attrs?.href ?? ""})`;
        }
        return t;
      }
      if (n.type === "hardBreak") return "\n";
      return inline(n);
    })
    .join("");
}

function block(node: Node, depth = 0, listType: string | null = null, index = 1): string[] {
  const pad = "  ".repeat(depth);
  const lines: string[] = [];
  switch (node.type) {
    case "paragraph":
      lines.push(pad + inline(node));
      break;
    case "heading": {
      const l = Number(node.attrs?.level ?? 1);
      lines.push("", (l === 1 ? "# " : l === 2 ? "## " : "### ") + inline(node));
      break;
    }
    case "bulletList":
      (node.content ?? []).forEach((li) => lines.push(...block(li, depth, "ul")));
      break;
    case "orderedList":
      (node.content ?? []).forEach((li, i) => lines.push(...block(li, depth, "ol", i + 1)));
      break;
    case "listItem": {
      const marker = listType === "ol" ? `${index}. ` : "• ";
      const inner = (node.content ?? []).flatMap((c) => block(c, depth));
      if (inner.length) inner[0] = pad + marker + inner[0].trimStart();
      lines.push(...inner);
      break;
    }
    case "taskList":
      (node.content ?? []).forEach((li) => lines.push(...block(li, depth, "task")));
      break;
    case "taskItem": {
      const box = node.attrs?.checked ? "[x] " : "[ ] ";
      const inner = (node.content ?? []).flatMap((c) => block(c, depth));
      if (inner.length) inner[0] = pad + box + inner[0].trimStart();
      lines.push(...inner);
      break;
    }
    case "blockquote":
      (node.content ?? []).forEach((c) => block(c, depth).forEach((l) => lines.push("> " + l)));
      break;
    case "codeBlock":
      lines.push("```", ...(node.content ?? []).map((c) => c.text ?? ""), "```");
      break;
    case "horizontalRule":
      lines.push("", "----------");
      break;
    case "image":
      lines.push(`[image] ${node.attrs?.src ?? ""}`);
      break;
    case "callout": {
      const emoji = String(node.attrs?.emoji ?? "💡");
      const inner = (node.content ?? []).flatMap((c) => block(c, depth)).join(" ").trim();
      lines.push(`${emoji} ${inner}`);
      break;
    }
    case "toggle":
      (node.content ?? []).forEach((c, i) => {
        const b = block(c, depth);
        if (i === 0) b.forEach((l) => lines.push("▸ " + l));
        else lines.push(...b.map((l) => "  " + l));
      });
      break;
    case "fileBlock":
      lines.push(`📎 ${node.attrs?.name ?? "Attachment"} (${node.attrs?.url ?? ""})`);
      break;
    case "video":
      lines.push(`[video] ${node.attrs?.src ?? node.attrs?.path ?? ""}`);
      break;
    case "bookmark":
      lines.push(
        `🔖 ${node.attrs?.title ?? ""} (${node.attrs?.url ?? ""})`.trim(),
      );
      break;
    case "databaseView":
      lines.push("[database]");
      break;
    case "table":
      (node.content ?? []).forEach((row) => {
        const cells = (row.content ?? []).map((c) => inline(c).replace(/\s+/g, " ").trim());
        lines.push("| " + cells.join(" | ") + " |");
      });
      break;
    default:
      (node.content ?? []).forEach((c) => lines.push(...block(c, depth)));
  }
  return lines;
}

function renderText(title: string, icon: string | null, doc: Node): string {
  const head = (icon && !icon.startsWith("si:") ? icon + " " : "") + (title || "Untitled");
  const body = (doc.content ?? []).flatMap((n) => block(n)).join("\n");
  return `${head}\n${"=".repeat(Math.max(4, Math.min(head.length, 60)))}\n\n${body}\n`;
}

// Published pages are served to anyone, but uploaded images/videos/files live in
// the PRIVATE page-assets bucket. This function has the service role, so it mints
// short-lived signed URLs for each asset `path` and writes them onto the node
// (src for image/video, url for fileBlock) so the public viewer can render them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function signAssets(node: Node, admin: any): Promise<void> {
  if (!node || typeof node !== "object") return;
  const path = node.attrs?.path as string | undefined;
  if (path && (node.type === "image" || node.type === "video" || node.type === "fileBlock")) {
    const { data: signed } = await admin.storage
      .from("page-assets")
      .createSignedUrl(path, 3600);
    if (signed?.signedUrl) {
      node.attrs = node.attrs ?? {};
      if (node.type === "fileBlock") node.attrs.url = signed.signedUrl;
      else node.attrs.src = signed.signedUrl;
    }
  }
  for (const c of node.content ?? []) await signAssets(c, admin);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const wantsJson = url.searchParams.get("format") === "json";
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!UUID_RE.test(token)) {
    return new Response("Page not available — this page isn't published or the link is invalid.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", ...cors },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("pages")
    .select("title,icon,content,published")
    .eq("public_token", token)
    .eq("published", true)
    .maybeSingle();

  if (error || !data) {
    return new Response("Page not available — this page isn't published or the link is invalid.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", ...cors },
    });
  }

  const doc = (data.content ?? { type: "doc", content: [] }) as Node;

  if (wantsJson) {
    await signAssets(doc, admin); // resolve private asset paths -> signed URLs
    return new Response(
      JSON.stringify({ title: data.title, icon: data.icon, content: doc }),
      { headers: { "content-type": "application/json; charset=utf-8", ...cors } },
    );
  }

  const text = renderText(data.title as string, data.icon as string | null, doc);
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=30",
      ...cors,
    },
  });
});
