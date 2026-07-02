// Creator-facing portal (standalone, no dashboard chrome). A creator logs in and
// sees each week's brief (written by the agency) + uploads their content. Fully
// bilingual — English / Español toggle, persisted. Uploading sets the tracker
// row to "received", which fires the QC reminder to Finlay + Luca via the digest.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { format, startOfWeek } from "date-fns";
import { enGB, es as esLocale } from "date-fns/locale";
import { Camera, Upload, Download, Check, LogOut, Globe, Loader2 } from "lucide-react";

export const Route = createFileRoute("/portal")({ component: CreatorPortal });

const BUCKET = "creator-documents";
const mondayStr = (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");

const sb = supabase as unknown as { from: (t: string) => any };

type Lang = "en" | "es";
const STR = {
  en: {
    heading: "Your content",
    thisWeek: "This week",
    weekOf: "Week of",
    brief: "What we need this week",
    noBrief: "No brief posted yet — check back soon.",
    yourUpload: "Your content",
    upload: "Upload file",
    uploading: "Uploading…",
    replace: "Replace",
    remove: "Remove",
    tip: "Upload what's requested above. Your manager is notified automatically once you do.",
    signOut: "Sign out",
    empty: "Nothing here yet.",
    st_requested: "⏳ Waiting for your content",
    st_received: "✅ Received — under review",
    st_qc: "🔍 Being checked",
    st_uploaded: "🚀 Approved & live",
  },
  es: {
    heading: "Tu contenido",
    thisWeek: "Esta semana",
    weekOf: "Semana del",
    brief: "Lo que necesitamos esta semana",
    noBrief: "Aún no hay instrucciones — vuelve pronto.",
    yourUpload: "Tu contenido",
    upload: "Subir archivo",
    uploading: "Subiendo…",
    replace: "Reemplazar",
    remove: "Quitar",
    tip: "Sube lo que se pide arriba. Tu manager recibe una notificación automáticamente cuando lo hagas.",
    signOut: "Cerrar sesión",
    empty: "Todavía no hay nada aquí.",
    st_requested: "⏳ Esperando tu contenido",
    st_received: "✅ Recibido — en revisión",
    st_qc: "🔍 En control de calidad",
    st_uploaded: "🚀 Aprobado y publicado",
  },
} as const;

type Row = {
  id: string;
  creator: string;
  week_start: string;
  stage: string;
  requirements: string | null;
  file_path: string | null;
  file_name: string | null;
};

function CreatorPortal() {
  const navigate = useNavigate();
  const [creator, setCreator] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(() => (typeof localStorage !== "undefined" && localStorage.getItem("portal_lang") === "es" ? "es" : "en"));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const t = STR[lang];

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("agency_session") || "null");
      if (!s || s.type !== "creator") { navigate({ to: "/login" }); return; }
      setCreator(s.creator_name || s.username);
    } catch { navigate({ to: "/login" }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLanguage = (l: Lang) => { setLang(l); localStorage.setItem("portal_lang", l); };

  const load = async (name: string) => {
    setLoading(true);
    const week = mondayStr(new Date());
    const fetchRows = async () => (await sb.from("content_tracker").select("id, creator, week_start, stage, requirements, file_path, file_name").eq("creator", name).order("week_start", { ascending: false }).limit(8)).data ?? [];
    let list = (await fetchRows()) as Row[];
    // Make sure the current week exists so the creator can always upload.
    if (!list.some((r) => r.week_start === week)) {
      await sb.from("content_tracker").insert({ creator: name, week_start: week });
      list = (await fetchRows()) as Row[];
    }
    setRows(list);
    setLoading(false);
  };
  useEffect(() => { if (creator) load(creator); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [creator]);

  const upload = async (row: Row, file: File) => {
    setBusy(row.id);
    const safe = `${Date.now()}-${file.name}`.replace(/[^\w.\-]+/g, "_");
    const path = `content/${row.week_start}/${row.creator.replace(/[^\w-]+/g, "_")}/${safe}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) { setBusy(null); toast.error(error.message); return; }
    // Uploading marks it "received" → triggers the QC reminder to Finlay + Luca.
    const nextStage = row.stage === "requested" ? "received" : row.stage;
    await sb.from("content_tracker").update({ file_path: path, file_name: file.name, stage: nextStage, updated_at: new Date().toISOString() }).eq("id", row.id);
    setBusy(null);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, file_path: path, file_name: file.name, stage: nextStage } : r)));
    toast.success(lang === "es" ? "¡Subido!" : "Uploaded!");
  };

  const download = async (row: Row) => {
    if (!row.file_path) return;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(row.file_path, 3600, { download: true });
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const removeFile = async (row: Row) => {
    await sb.from("content_tracker").update({ file_path: null, file_name: null }).eq("id", row.id);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, file_path: null, file_name: null } : r)));
  };

  const signOut = () => {
    localStorage.removeItem("agency_session");
    window.dispatchEvent(new Event("agency-auth-changed"));
    navigate({ to: "/login" });
  };

  const stageText = (s: string) => (s === "received" ? t.st_received : s === "qc" ? t.st_qc : s === "uploaded" ? t.st_uploaded : t.st_requested);
  const locale = lang === "es" ? esLocale : enGB;
  const thisWeek = mondayStr(new Date());

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50/40 to-background dark:from-rose-950/10">
      <Toaster />
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-400 text-white"><Camera className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{creator ?? "…"}</div>
            <div className="text-[11px] text-muted-foreground">{t.heading}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
              <button onClick={() => setLanguage("en")} className={`px-2.5 py-1 ${lang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>EN</button>
              <button onClick={() => setLanguage("es")} className={`px-2.5 py-1 ${lang === "es" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Globe className="mr-0.5 inline h-3 w-3" />ES</button>
            </div>
            <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="mr-1 h-4 w-4" />{t.signOut}</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {loading ? (
          <div className="h-48 animate-pulse rounded-xl border border-border bg-card/60" />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">{t.empty}</div>
        ) : rows.map((row) => {
          const isCurrent = row.week_start === thisWeek;
          return (
            <Card key={row.id} className={`p-5 ${isCurrent ? "ring-1 ring-primary/30" : "opacity-90"}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  {isCurrent && <span className="mr-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">{t.thisWeek}</span>}
                  {t.weekOf} {format(new Date(`${row.week_start}T00:00:00`), "d MMM", { locale })}
                </div>
                <span className="text-[11px] text-muted-foreground">{stageText(row.stage)}</span>
              </div>

              {/* Brief */}
              <div className="mb-4">
                <div className="mb-1 text-xs font-medium text-muted-foreground">{t.brief}</div>
                {row.requirements ? (
                  <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm">{row.requirements}</div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">{t.noBrief}</div>
                )}
              </div>

              {/* Upload */}
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">{t.yourUpload}</div>
                {row.file_path ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-2.5 py-1 text-xs text-success"><Check className="h-3.5 w-3.5" />{row.file_name}</span>
                    <button onClick={() => download(row)} className="flex items-center gap-1 text-xs text-primary hover:underline"><Download className="h-3 w-3" /></button>
                    <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Upload className="h-3 w-3" />{busy === row.id ? t.uploading : t.replace}
                      <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(row, f); e.target.value = ""; }} />
                    </label>
                    <button onClick={() => removeFile(row)} className="text-xs text-muted-foreground hover:text-destructive">{t.remove}</button>
                  </div>
                ) : (
                  <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-6 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                    {busy === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {busy === row.id ? t.uploading : t.upload}
                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(row, f); e.target.value = ""; }} />
                  </label>
                )}
                {isCurrent && <p className="mt-2 text-[11px] text-muted-foreground">{t.tip}</p>}
              </div>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
