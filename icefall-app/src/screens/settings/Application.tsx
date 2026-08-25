import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Check } from "lucide-react";
import { Button, Disclaimer } from "@/components/ui/primitives";
import { Rise } from "@/components/layout/chrome";
import { Group, SettingsPage, StatusPill } from "@/components/settings/kit";
import { useSettings } from "@/settings/store";
import { BADGE_NOT_BUILT_NOTICE } from "@/badges/model";
import { cn } from "@/lib/utils";

/**
 * The three professional applications — Sherpa, Guide, Expedition Partner.
 *
 * One form driven by a spec, because they differ only in their questions. The
 * spec asks for a ten-step wizard for the guide application; a ten-screen wizard
 * for eleven short fields is worse than one page you can see the whole of, so
 * the steps are section headings on a single scroll. Nobody loses their place
 * and nobody has to guess how much is left.
 *
 * Submitting sets `pending` and nothing else. No code path in this app can set
 * `approved` — a badge that says somebody is a qualified mountain guide has to
 * be issued by a person who read their certificates.
 */

interface FieldSpec {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
}

interface AppSpec {
  key: "sherpa" | "guide" | "company";
  title: string;
  subtitle: string;
  intro: string;
  groups: { label: string; fields: FieldSpec[] }[];
  /** What ICEFALL would have to check before granting it. */
  reviewNote: string;
}

const SPECS: Record<string, AppSpec> = {
  sherpa: {
    key: "sherpa",
    title: "Sherpa badge",
    subtitle: "Recognition for mountain experience and contribution.",
    intro:
      "Apply for the ICEFALL Sherpa badge if you have significant mountain experience, expedition knowledge or community contribution that you want reviewed. It is never granted from what you write here alone.",
    reviewNote:
      "A reviewer would corroborate the expeditions and contributions described, usually with people who were there.",
    groups: [
      {
        label: "Experience",
        fields: [
          { key: "years", label: "Years of experience", placeholder: "12" },
          { key: "highest", label: "Highest altitude reached", placeholder: "6,962 m — Aconcagua" },
          { key: "summits", label: "Notable summits", placeholder: "Mont Blanc, Matterhorn, Denali…", multiline: true },
          { key: "expeditions", label: "Expeditions completed", placeholder: "How many, and where", multiline: true },
        ],
      },
      {
        label: "Ground",
        fields: [
          { key: "technical", label: "Technical experience", placeholder: "Glacier travel, alpine ice to AI3, rock to V+", multiline: true },
          { key: "ranges", label: "Countries and ranges", placeholder: "Alps, Atlas, Andes" },
        ],
      },
      {
        label: "You",
        fields: [
          { key: "quals", label: "Relevant qualifications", placeholder: "Winter ML, WFR…", hint: "Optional." },
          { key: "guiding", label: "Guiding experience", placeholder: "If any", hint: "Optional." },
          { key: "why", label: "Why you are applying", placeholder: "What you contribute to the mountain community", multiline: true },
        ],
      },
    ],
  },

  guide: {
    key: "guide",
    title: "Become an ICEFALL Guide",
    subtitle: "Offer professional mountain guiding through ICEFALL.",
    intro:
      "ICEFALL lists guides for terrain where the wrong choice kills people. Applications are reviewed against certification, insurance and demonstrable experience — not against a description.",
    reviewNote:
      "A reviewer would verify your certification with the issuing body and confirm current liability insurance. For technical and glaciated ground ICEFALL expects IFMGA/UIAGM certification or a recognised national equivalent.",
    groups: [
      {
        label: "1 · Personal details",
        fields: [
          { key: "name", label: "Full legal name", placeholder: "As it appears on your certification" },
          { key: "country", label: "Country of residence", placeholder: "France" },
          { key: "contact", label: "Contact email", placeholder: "you@example.com" },
        ],
      },
      {
        label: "2 · Guiding experience",
        fields: [
          { key: "years", label: "Years guiding", placeholder: "8" },
          { key: "days", label: "Guided days per year", placeholder: "120" },
          { key: "history", label: "Guiding history", placeholder: "Who you have worked for, and on what", multiline: true },
        ],
      },
      {
        label: "3 · Mountains & regions",
        fields: [{ key: "regions", label: "Where you guide", placeholder: "Mont Blanc massif, Écrins, Valais", multiline: true }],
      },
      {
        label: "4 · Technical specialities",
        fields: [{ key: "technical", label: "Specialities", placeholder: "Glacier travel, alpine ice, ski touring, big rock routes", multiline: true }],
      },
      {
        label: "5 · Languages",
        fields: [{ key: "languages", label: "Languages you guide in", placeholder: "French, English, Italian" }],
      },
      {
        label: "6 · Availability",
        fields: [{ key: "availability", label: "Season and availability", placeholder: "June – September, plus winter ski touring" }],
      },
      {
        label: "7 · Qualifications",
        fields: [
          { key: "cert", label: "Certification", placeholder: "IFMGA/UIAGM — issuing body and number" },
          { key: "firstaid", label: "First aid", placeholder: "WFR, expiry date" },
        ],
      },
      {
        label: "8 · Insurance & documentation",
        fields: [
          { key: "insurance", label: "Liability insurance", placeholder: "Insurer and policy number" },
          { key: "documents", label: "Supporting documents", placeholder: "What you can provide on request", multiline: true, hint: "Uploading files needs a server. Describe what you hold." },
        ],
      },
      {
        label: "9 · Your profile",
        fields: [{ key: "profile", label: "How you would describe yourself to a client", placeholder: "", multiline: true }],
      },
    ],
  },

  company: {
    key: "company",
    title: "Become an Expedition Partner",
    subtitle: "List your expeditions and reach climbers planning their next mountain.",
    intro:
      "Expedition partners appear to athletes choosing who to climb an 8,000 m peak with. Applications are reviewed against registration, insurance and licensing.",
    reviewNote:
      "A reviewer would confirm company registration, operating licences for the ranges you work in, and current insurance.",
    groups: [
      {
        label: "Company",
        fields: [
          { key: "name", label: "Company name", placeholder: "" },
          { key: "country", label: "Country of registration", placeholder: "" },
          { key: "website", label: "Website", placeholder: "https://" },
          { key: "years", label: "Years operating", placeholder: "14" },
          { key: "description", label: "Description", placeholder: "What you do and how you do it", multiline: true },
        ],
      },
      {
        label: "Operations",
        fields: [
          { key: "mountains", label: "Mountains operated", placeholder: "Everest, Manaslu, Ama Dablam", multiline: true },
          { key: "types", label: "Expedition types", placeholder: "Full service, logistics only, guided" },
          { key: "guides", label: "Guide network", placeholder: "How many guides, and their certification", multiline: true },
          { key: "languages", label: "Languages", placeholder: "" },
        ],
      },
      {
        label: "Compliance",
        fields: [
          { key: "licensing", label: "Licensing", placeholder: "Operating permits and licence numbers", multiline: true },
          { key: "insurance", label: "Insurance", placeholder: "Insurer, cover and policy number", multiline: true },
          { key: "booking", label: "Booking & cancellation policy", placeholder: "", multiline: true },
          { key: "contact", label: "Contact for enquiries", placeholder: "" },
        ],
      },
    ],
  },
};

export default function Application() {
  const { kind } = useParams<{ kind: string }>();
  const spec = kind ? SPECS[kind] : undefined;
  const { settings, apply, withdraw } = useSettings();
  const [values, setValues] = useState<Record<string, string>>(
    () => (kind && settings[SPECS[kind]?.key]?.fields) || {},
  );
  const [justSent, setJustSent] = useState(false);

  if (!spec) return <Navigate to="/settings/professional" replace />;

  const application = settings[spec.key];
  const submitted = application.status !== "none";
  const required = spec.groups.flatMap((g) => g.fields).slice(0, 3);
  const ready = required.every((f) => (values[f.key] ?? "").trim().length > 0);

  return (
    <SettingsPage title={spec.title} subtitle={spec.subtitle} back="/settings/professional">
      <Rise>
        <div className="rounded-card border border-hairline bg-graphite p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[12.5px] leading-relaxed text-mist">{spec.intro}</p>
            <StatusPill status={application.status} />
          </div>
        </div>
      </Rise>

      {submitted && (
        <Rise className="pt-4">
          <div className="rounded-card border border-azure/35 bg-azure/[0.05] p-4">
            <p className="flex items-center gap-2 text-[13px] text-snow">
              <Check size={15} strokeWidth={2} className="text-azure" />
              Application recorded
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-mist">
              {spec.reviewNote} None of that can happen yet — see the note at the foot of this page.
            </p>
            <Button variant="secondary" className="mt-3 w-full" onClick={() => withdraw(spec.key)}>
              Withdraw application
            </Button>
          </div>
        </Rise>
      )}

      {spec.groups.map((group) => (
        <Group key={group.label} label={group.label}>
          {group.fields.map((f) => (
            <div key={f.key} className="border-t border-hairline px-4 py-3.5 first:border-t-0">
              <label className="block text-[11px] uppercase tracking-[0.1em] text-mist-dim">
                {f.label}
              </label>
              {f.multiline ? (
                <textarea
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  rows={3}
                  disabled={submitted}
                  className={cn(
                    "mt-2 w-full resize-none bg-transparent text-[14px] text-snow outline-none placeholder:text-mist-dim",
                    submitted && "opacity-60",
                  )}
                />
              ) : (
                <input
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  disabled={submitted}
                  className={cn(
                    "mt-2 w-full bg-transparent text-[14px] text-snow outline-none placeholder:text-mist-dim",
                    submitted && "opacity-60",
                  )}
                />
              )}
              {f.hint && <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{f.hint}</p>}
            </div>
          ))}
        </Group>
      ))}

      {!submitted && (
        <Rise className="pt-5">
          <Button
            className="w-full"
            disabled={!ready}
            onClick={() => {
              apply(spec.key, values);
              setJustSent(true);
            }}
          >
            Submit application
          </Button>
          {!ready && (
            <p className="mt-2 text-center text-[11px] text-mist-dim">
              Fill in the first few fields to submit.
            </p>
          )}
        </Rise>
      )}

      {justSent && (
        <Rise className="pt-3">
          <p className="text-center text-[12px] text-azure">Recorded on this device.</p>
        </Rise>
      )}

      <Rise className="pt-5">
        <Disclaimer>{BADGE_NOT_BUILT_NOTICE}</Disclaimer>
      </Rise>
    </SettingsPage>
  );
}
