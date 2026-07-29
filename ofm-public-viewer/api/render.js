// Vercel serverless function: renders a published OFM Workspace page as styled
// HTML. Supabase's *.supabase.co domain force-serves text/plain, so this viewer
// (on Vercel, which doesn't) fetches the page JSON and renders real HTML.
//
// Route: any path /<public_token> is rewritten here (see vercel.json).
// Env: SUPABASE_URL (your Supabase project URL).

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://jzlrwlqytyqhlpuyblld.supabase.co";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function renderText(node) {
  let html = esc(node.text);
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") html = `<strong>${html}</strong>`;
    else if (mark.type === "italic") html = `<em>${html}</em>`;
    else if (mark.type === "strike") html = `<s>${html}</s>`;
    else if (mark.type === "underline") html = `<u>${html}</u>`;
    else if (mark.type === "code") html = `<code>${html}</code>`;
    else if (mark.type === "link")
      html = `<a href="${esc(mark.attrs?.href)}" target="_blank" rel="noopener nofollow">${html}</a>`;
    else if (mark.type === "textStyle" && mark.attrs?.color)
      html = `<span style="color:${esc(mark.attrs.color)}">${html}</span>`;
    else if (mark.type === "highlight")
      html = `<mark${mark.attrs?.color ? ` style="background-color:${esc(mark.attrs.color)}"` : ""}>${html}</mark>`;
  }
  return html;
}

const kids = (n) => (n.content ?? []).map(renderNode).join("");

// Mirror the editor's embedInfo(): turn a stored watch-URL into an embed URL.
function videoEmbed(raw) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    if (id) return { kind: "iframe", url: `https://www.youtube.com/embed/${id}` };
    const m = u.pathname.match(/\/(embed|shorts)\/([\w-]+)/);
    if (m) return { kind: "iframe", url: `https://www.youtube.com/embed/${m[2]}` };
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    if (id) return { kind: "iframe", url: `https://www.youtube.com/embed/${id}` };
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id))
      return { kind: "iframe", url: `https://player.vimeo.com/video/${id}` };
  }
  if (host === "loom.com") {
    const m = u.pathname.match(/\/(share|embed)\/([\w-]+)/);
    if (m) return { kind: "iframe", url: `https://www.loom.com/embed/${m[2]}` };
  }
  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(u.pathname)) return { kind: "file", url: raw };
  return { kind: "iframe", url: raw };
}

const alignStyle = (n) => {
  const a = n.attrs?.textAlign;
  return a && a !== "left" ? ` style="text-align:${esc(a)}"` : "";
};

function renderNode(node) {
  switch (node.type) {
    case "text":
      return renderText(node);
    case "paragraph":
      return `<p${alignStyle(node)}>${kids(node)}</p>`;
    case "heading": {
      const l = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
      return `<h${l}${alignStyle(node)}>${kids(node)}</h${l}>`;
    }
    case "bulletList":
      return `<ul>${kids(node)}</ul>`;
    case "orderedList":
      return `<ol>${kids(node)}</ol>`;
    case "listItem":
      return `<li>${kids(node)}</li>`;
    case "taskList":
      return `<ul class="tasks">${kids(node)}</ul>`;
    case "taskItem":
      return `<li class="task"><input type="checkbox" disabled ${node.attrs?.checked ? "checked" : ""}/><div>${kids(node)}</div></li>`;
    case "blockquote":
      return `<blockquote>${kids(node)}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${esc((node.content ?? []).map((c) => c.text).join(""))}</code></pre>`;
    case "horizontalRule":
      return "<hr/>";
    case "hardBreak":
      return "<br/>";
    case "image":
      return node.attrs?.src
        ? `<img src="${esc(node.attrs.src)}" alt="${esc(node.attrs?.alt)}"/>`
        : `<div class="ph">🖼️ image</div>`;
    case "callout":
      return `<div class="callout"><div class="cae">${esc(node.attrs?.emoji ?? "💡")}</div><div>${kids(node)}</div></div>`;
    case "toggle": {
      const c = node.content ?? [];
      const sum = c[0] ? renderNode(c[0]) : "";
      const rest = c.slice(1).map(renderNode).join("");
      return `<details open><summary>${sum}</summary>${rest}</details>`;
    }
    case "table":
      return `<div class="tw"><table>${kids(node)}</table></div>`;
    case "tableRow":
      return `<tr>${kids(node)}</tr>`;
    case "tableHeader":
      return `<th>${kids(node)}</th>`;
    case "tableCell":
      return `<td>${kids(node)}</td>`;
    case "fileBlock":
      return `<div class="ph">📎 ${esc(node.attrs?.name ?? "Attachment")}</div>`;
    case "columnList":
      return `<div class="cols">${kids(node)}</div>`;
    case "column":
      return `<div class="col">${kids(node)}</div>`;
    case "video": {
      const src = node.attrs?.src;
      const info = src ? videoEmbed(src) : null;
      if (info?.kind === "iframe")
        return `<div class="video-embed"><iframe src="${esc(info.url)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen title="Embedded video"></iframe></div>`;
      if (info?.kind === "file")
        return `<video src="${esc(info.url)}" controls></video>`;
      // Uploaded (private-bucket) videos can't be signed server-side -> link/placeholder.
      return src
        ? `<a class="ph" href="${esc(src)}" target="_blank" rel="noopener nofollow">▶ Video</a>`
        : `<div class="ph">▶ Video</div>`;
    }
    case "bookmark": {
      const url = node.attrs?.url;
      if (!url) return `<div class="ph">🔖 Bookmark</div>`;
      const title = node.attrs?.title || url;
      const desc = node.attrs?.description;
      return `<a class="bookmark" href="${esc(url)}" target="_blank" rel="noopener nofollow"><span class="bt">${esc(title)}</span>${desc ? `<span class="bd">${esc(desc)}</span>` : ""}<span class="bu">${esc(url)}</span></a>`;
    }
    default:
      return kids(node);
  }
}

function page(title, icon, doc) {
  const emoji = icon && !icon.startsWith("si:") ? icon : "";
  const t = esc(title || "Untitled");
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/><title>${t}</title>
<style>
:root{color-scheme:light dark;--fg:#1f2328;--muted:#6b7280;--border:#e5e7eb;--bg:#fff;--box:#f6f6f7;}
@media (prefers-color-scheme:dark){:root{--fg:#e6e6e6;--muted:#9ca3af;--border:#2a2a2a;--bg:#191919;--box:#242424;}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:64px 24px 120px}.icon{font-size:56px;line-height:1;margin-bottom:12px}
h1.t{font-size:40px;font-weight:800;letter-spacing:-.02em;margin:0 0 24px}
h1{font-size:30px;font-weight:700;margin:28px 0 8px}h2{font-size:24px;font-weight:600;margin:22px 0 6px}h3{font-size:20px;font-weight:600;margin:18px 0 4px}
p{margin:6px 0}a{color:#2563eb}ul,ol{padding-left:26px}li{margin:3px 0}
blockquote{border-left:3px solid var(--border);margin:10px 0;padding-left:16px;color:var(--muted)}
hr{border:none;border-top:1px solid var(--border);margin:28px 0}
code{background:var(--box);padding:.12em .34em;border-radius:4px;font-size:.88em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
pre{background:var(--box);padding:14px 16px;border-radius:10px;overflow:auto}pre code{background:none;padding:0}
img{max-width:100%;border-radius:10px;margin:8px 0}
ul.tasks{list-style:none;padding-left:2px}li.task{display:flex;gap:8px;align-items:flex-start}li.task input{margin-top:6px}li.task>div{flex:1}
.callout{display:flex;gap:12px;background:var(--box);border-radius:10px;padding:14px 16px;margin:10px 0}.cae{font-size:18px;line-height:1.6}
details{margin:6px 0}summary{cursor:pointer}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid var(--border);padding:7px 10px;text-align:left}th{background:var(--box)}
.ph{display:inline-block;background:var(--box);color:var(--muted);border-radius:8px;padding:8px 12px;margin:6px 0;font-size:.9em;text-decoration:none}
.cols{display:flex;gap:24px;margin:10px 0;align-items:flex-start}.col{flex:1;min-width:0}@media(max-width:640px){.cols{flex-direction:column;gap:0}}
.video-embed{position:relative;padding-bottom:56.25%;height:0;border-radius:10px;overflow:hidden;margin:10px 0}.video-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
video{max-width:100%;border-radius:10px;margin:8px 0;background:#000}
.bookmark{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin:8px 0;text-decoration:none;color:var(--fg)}.bookmark:hover{background:var(--box)}.bookmark .bt{font-weight:600}.bookmark .bd,.bookmark .bu{color:var(--muted);font-size:.85em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
mark{border-radius:3px;padding:0 1px}
footer{margin-top:64px;color:var(--muted);font-size:13px;border-top:1px solid var(--border);padding-top:16px}
</style></head><body><div class="wrap">
${emoji ? `<div class="icon">${esc(emoji)}</div>` : ""}
<h1 class="t">${t}</h1>
${renderNode(doc)}
<footer>Published with OFM Workspace</footer>
</div></body></html>`;
}

const NOT_FOUND = `<!doctype html><meta charset="utf-8"/><title>Not found</title><body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#666"><h1>Page not available</h1><p>This page isn't published, or the link is no longer valid.</p></body>`;

export default async function handler(req, res) {
  const path = (req.url || "").split("?")[0];
  const token = path.split("/").filter(Boolean).pop() || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.status(404).send(NOT_FOUND);
  }
  try {
    const r = await fetch(
      `${SUPABASE_URL}/functions/v1/public-page/${token}?format=json`,
    );
    if (!r.ok) {
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res.status(404).send(NOT_FOUND);
    }
    const data = await r.json();
    const html = page(data.title, data.icon, data.content || { type: "doc", content: [] });
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=30");
    return res.status(200).send(html);
  } catch {
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.status(500).send(NOT_FOUND);
  }
}
