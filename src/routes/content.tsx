// Weekly content tracker — one row per creator per week, moving through the
// pipeline (Requested → Received → QC'd → Uploaded), with the doc (link or file)
// attached and a pay amount / paid flag. Tracker-driven reminders (Gly bump,
// Finlay+Luca QC, Luca Monday pay) fire from the daily digest cron.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, startOfWeek, addWeeks } from "date-fns";
import { FileText, ChevronLeft, ChevronRight, Upload, Download, Plus, Check } from "lucide-react";

export const Route = createFileRoute("/content")({ component: ContentPage });

const BUCKET = "creator-documents";
const DEFAULT_CREATORS = ["Rosario", "Antonella", "Nicole"];
const STAGES = [
  { v: "requested", label: "Requested" },
  { v: "received", label: "Received" },
  { v: "qc", label: "QC'd" },
  { v: "uploaded", label: "Uploaded" },
];
const stageIdx = (s: string) => Math.max(0, STAGES.findIndex((x) => x.v === s));

const sb = supabase as unknown as { from: (t: string) => any };

type Row = {
  id: string;
  creator: string;
  week_start: string;
  stage: string;
  requirements: string | null;
  doc_link: string | null;
  file_path: string | null;
  file_name: string | null;
  pay_amount: number | null;
  pay_status: string;
  notes: string | null;
};

const mondayStr = (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");

function ContentPage() {
  const [week, setWeek] = useState(() => mondayStr(new Date()));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCreator, setNewCreator] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const fetchRows = async () => (await sb.from("content_tracker").select("*").eq("week_start", week).order("creator")).data ?? [];
    let list = (await fetchRows()) as Row[];
    // Seed the default creators that don't yet have a row for this week.
    const have = new Set(list.map((r) => r.creator));
    const missing = DEFAULT_CREATORS.filter((c) => !have.has(c));
    if (missing.length) {
      await sb.from("content_tracker").insert(missing.map((c) => ({ creator: c, week_start: week })));
      list = (await fetchRows()) as Row[];
    }
    setRows(list);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [week]);

  const patch = async (row: Row, changes: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...changes } : r)));
    const { error } = await sb.from("content_tracker").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) toast.error(error.message);
  };

  const upload = async (row: Row, file: File) => {
    setBusy(row.id);
    const safe = `${Date.now()}-${file.name}`.replace(/[^\w.\-]+/g, "_");
    const path = `content/${row.week_start}/${row.creator.replace(/[^\w-]+/g, "_")}/${safe}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    await patch(row, { file_path: path, file_name: file.name });
    toast.success("File uploaded");
  };

  const download = async (row: Row) => {
    if (!row.file_path) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.file_path, 3600, { download: true });
    if (error || !data?.signedUrl) { toast.error("Couldn't open the file"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const addCreator = async () => {
    const name = newCreator.trim();
    if (!name) return;
    const { error } = await sb.from("content_tracker").insert({ creator: name, week_start: week });
    if (error) { toast.error(error.message); return; }
    setNewCreator("");
    load();
  };

  const removeRow = async (row: Row) => {
    const { error } = await sb.from("content_tracker").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    setRows((rs) => rs.filter((r) => r.id !== row.id));
  };

  const isThisWeek = week === mondayStr(new Date());

  const stageCount = (v: string) => rows.filter((r) => r.stage === v).length;
  const unpaid = rows.filter((r) => r.pay_status !== "paid").length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Toaster />
      <div className="mb-6 flex items-center gap-3">
        <FileText className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content</h1>
          <p className="text-sm text-muted-foreground">Weekly content per creator — request → receive → QC → upload → pay. No more floating docs.</p>
        </div>
      </div>

      {/* Week nav */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setWeek(mondayStr(addWeeks(new Date(`${week}T00:00:00`), -1)))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="min-w-[150px] text-center text-sm font-semibold">
          Week of {format(new Date(`${week}T00:00:00`), "d MMM yyyy")}
          {isThisWeek && <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">this week</span>}
        </div>
        <Button size="sm" variant="outline" onClick={() => setWeek(mondayStr(addWeeks(new Date(`${week}T00:00:00`), 1)))}><ChevronRight className="h-4 w-4" /></Button>
        {!isThisWeek && <Button size="sm" variant="ghost" onClick={() => setWeek(mondayStr(new Date()))}>Today</Button>}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>{stageCount("uploaded")}/{rows.length} uploaded</span>
          <span>·</span>
          <span>{unpaid} unpaid</span>
        </div>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card/60" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-3 font-medium">Creator</th>
                <th className="p-3 font-medium">Stage</th>
                <th className="p-3 font-medium">Brief (creator sees)</th>
                <th className="p-3 font-medium">Doc / file</th>
                <th className="p-3 font-medium">Pay</th>
                <th className="p-3 font-medium">Notes</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No creators for this week yet — add one below.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 align-top">
                  <td className="p-3 font-medium">{row.creator}</td>

                  {/* Stage pills */}
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {STAGES.map((s, i) => {
                        const active = row.stage === s.v;
                        const done = i < stageIdx(row.stage);
                        return (
                          <button
                            key={s.v}
                            onClick={() => patch(row, { stage: s.v })}
                            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : done ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground hover:text-foreground"}`}
                          >
                            {done && <Check className="mr-0.5 inline h-3 w-3" />}{s.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>

                  {/* Brief — shown to the creator on their portal */}
                  <td className="min-w-[200px] p-3">
                    <textarea
                      className="w-full resize-y rounded-md border border-border bg-transparent p-2 text-xs"
                      rows={2}
                      placeholder="What to send this week…"
                      defaultValue={row.requirements ?? ""}
                      onBlur={(e) => { if ((e.target.value || "") !== (row.requirements ?? "")) patch(row, { requirements: e.target.value.trim() || null }); }}
                    />
                  </td>

                  {/* Doc: link + file */}
                  <td className="min-w-[220px] p-3">
                    <Input
                      className="mb-1.5 h-8 text-xs"
                      placeholder="Paste a Drive/Docs link…"
                      defaultValue={row.doc_link ?? ""}
                      onBlur={(e) => { if ((e.target.value || "") !== (row.doc_link ?? "")) patch(row, { doc_link: e.target.value.trim() || null }); }}
                    />
                    <div className="flex items-center gap-2 text-xs">
                      {row.file_path ? (
                        <button onClick={() => download(row)} className="flex items-center gap-1 text-primary hover:underline"><Download className="h-3 w-3" />{row.file_name ?? "file"}</button>
                      ) : (
                        <label className="flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground">
                          <Upload className="h-3 w-3" />{busy === row.id ? "Uploading…" : "Upload file"}
                          <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(row, f); e.target.value = ""; }} />
                        </label>
                      )}
                      {row.file_path && (
                        <button onClick={() => patch(row, { file_path: null, file_name: null })} className="text-muted-foreground hover:text-destructive">×</button>
                      )}
                    </div>
                  </td>

                  {/* Pay */}
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">$</span>
                      <Input
                        className="h-8 w-20 text-xs"
                        type="number"
                        defaultValue={row.pay_amount ?? ""}
                        onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== row.pay_amount) patch(row, { pay_amount: v }); }}
                      />
                    </div>
                    <button
                      onClick={() => patch(row, { pay_status: row.pay_status === "paid" ? "unpaid" : "paid" })}
                      className={`mt-1 rounded-full border px-2 py-0.5 text-[11px] ${row.pay_status === "paid" ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {row.pay_status === "paid" ? "✓ Paid" : "Mark paid"}
                    </button>
                  </td>

                  {/* Notes */}
                  <td className="min-w-[160px] p-3">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Notes…"
                      defaultValue={row.notes ?? ""}
                      onBlur={(e) => { if ((e.target.value || "") !== (row.notes ?? "")) patch(row, { notes: e.target.value.trim() || null }); }}
                    />
                  </td>

                  <td className="p-3">
                    <button onClick={() => removeRow(row)} className="text-muted-foreground hover:text-destructive" title="Remove from this week">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Add creator */}
      <div className="mt-3 flex items-center gap-2">
        <Input className="h-9 max-w-xs" placeholder="Add a creator to this week…" value={newCreator} onChange={(e) => setNewCreator(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCreator(); }} />
        <Button size="sm" variant="outline" onClick={addCreator} disabled={!newCreator.trim()}><Plus className="mr-1 h-4 w-4" />Add</Button>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Reminders (via the 8am digest): <strong>Gly</strong> is nudged to bump any creator still on <em>Requested</em> (every ~4 days) · <strong>Finlay + Luca</strong> to QC anyone on <em>Received</em> · <strong>Luca</strong> every <strong>Monday</strong> to pay last week's uploaded-but-unpaid creators.
      </p>

      <CreatorLogins creators={Array.from(new Set([...DEFAULT_CREATORS, ...rows.map((r) => r.creator)]))} />
    </div>
  );
}

function CreatorLogins({ creators }: { creators: string[] }) {
  const [logins, setLogins] = useState<Array<{ id: string; username: string; label: string | null }>>([]);
  const [form, setForm] = useState<Record<string, { u: string; p: string }>>({});

  const load = async () => {
    const { data } = await sb.from("access_codes").select("id, username, label").eq("account_type", "creator");
    setLogins((data ?? []) as Array<{ id: string; username: string; label: string | null }>);
  };
  useEffect(() => { load(); }, []);

  const loginFor = (name: string) => logins.find((l) => (l.label ?? "").toLowerCase() === name.toLowerCase());
  const create = async (name: string) => {
    const f = form[name] || { u: "", p: "" };
    if (!f.u.trim() || !f.p.trim()) { toast.error("Username and password required"); return; }
    const { error } = await sb.from("access_codes").insert({ username: f.u.trim(), password: f.p, label: name, account_type: "creator", active: true });
    if (error) { toast.error(error.message); return; }
    toast.success(`Login created for ${name}`);
    setForm((s) => ({ ...s, [name]: { u: "", p: "" } }));
    load();
  };

  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 text-sm font-semibold">Creator logins</h3>
      <p className="mb-3 text-xs text-muted-foreground">Give each creator a login for their portal (they see their brief + upload their content, in English or Español). They sign in via the <strong>Creator Portal</strong> option on the login page.</p>
      <div className="space-y-2">
        {creators.map((name) => {
          const l = loginFor(name);
          const f = form[name] || { u: "", p: "" };
          return (
            <div key={name} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5 text-sm">
              <span className="w-24 shrink-0 font-medium">{name}</span>
              {l ? (
                <span className="text-xs text-success">✓ login: <span className="font-mono">{l.username}</span></span>
              ) : (
                <>
                  <Input className="h-8 w-32 text-xs" placeholder="username" value={f.u} onChange={(e) => setForm((s) => ({ ...s, [name]: { ...f, u: e.target.value } }))} />
                  <Input className="h-8 w-32 text-xs" placeholder="password" value={f.p} onChange={(e) => setForm((s) => ({ ...s, [name]: { ...f, p: e.target.value } }))} />
                  <Button size="sm" variant="outline" onClick={() => create(name)}>Create login</Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
