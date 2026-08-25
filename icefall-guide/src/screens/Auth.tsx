import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ShieldCheck, Upload } from "lucide-react";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { IcefallLockup } from "@/components/ui/IcefallMark";
import { Field, Notice, inputClass } from "@/components/guide";
import { CREDENTIAL_SPECS } from "@/data/model";
import { cn } from "@/lib/utils";

/**
 * Joining ICEFALL as a guide.
 *
 * Sign-in is ordinary. Signing UP is not, and deliberately so: this is where
 * someone asks to be listed as qualified to take strangers into terrain that
 * kills people. The flow asks for documents up front rather than letting an
 * account exist first and "get verified later" — an unverified guide who can
 * already talk to clients is the failure mode worth designing out.
 *
 * NOTHING HERE SUBMITS. No account server, no storage: fields validate and the
 * value is discarded. Every step says so rather than showing a success state it
 * cannot deliver.
 */

type Step = 0 | 1 | 2 | 3;
const STEPS = ["Account", "Work", "Documents", "Next"];

export default function Auth() {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [step, setStep] = useState<Step>(0);

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-10">
      <div className="pb-7 pt-10 text-center">
        <IcefallLockup className="items-center" />
        <p className="section-label mt-3 text-gold">Guide</p>
        <h1 className="display mt-6 text-[26px] text-snow">
          {mode === "in" ? "Welcome back." : "Guide with ICEFALL."}
        </h1>
        <p className="mx-auto mt-3 max-w-[300px] text-[12.5px] leading-relaxed text-mist">
          {mode === "in"
            ? "Your dates, your clients and your qualifications."
            : "We read every guide's documents before their listing goes live. It takes a few days."}
        </p>
      </div>

      {mode === "in" ? (
        <Card>
          <div className="space-y-4">
            <Field label="Email">
              <input type="email" autoComplete="email" className={inputClass} placeholder="you@example.com" />
            </Field>
            <Field label="Password">
              <input type="password" autoComplete="current-password" className={inputClass} placeholder="••••••••" />
            </Field>
          </div>

          <Button size="lg" className="mt-5 w-full" disabled>
            Sign in
          </Button>

          <Disclaimer className="mt-4">
            There is no account server connected yet, so this cannot sign you in. Nothing you type
            is stored or sent.
          </Disclaimer>

          <p className="mt-5 text-center text-[12.5px] text-mist">
            New to ICEFALL?{" "}
            <button onClick={() => setMode("up")} className="text-gold">
              Apply to guide
            </button>
          </p>
        </Card>
      ) : (
        <>
          <ol className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col gap-1.5">
                <span
                  className={cn(
                    "h-[2px] rounded-pill transition-colors",
                    i < step ? "bg-gold" : i === step ? "bg-gold/55" : "bg-elevated",
                  )}
                />
                <span
                  className={cn(
                    "text-[9px] uppercase tracking-[0.12em]",
                    i <= step ? "text-mist" : "text-mist-dim",
                  )}
                >
                  {s}
                </span>
              </li>
            ))}
          </ol>

          <Card className="mt-4">
            {step === 0 && <AccountStep />}
            {step === 1 && <WorkStep />}
            {step === 2 && <DocumentsStep />}
            {step === 3 && <NextStep />}

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-hairline pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
                disabled={step === 0}
              >
                <ArrowLeft size={14} strokeWidth={1.8} />
                Back
              </Button>

              {step < 3 ? (
                <Button size="sm" onClick={() => setStep((s) => Math.min(3, s + 1) as Step)}>
                  Continue
                  <ArrowRight size={14} strokeWidth={1.8} />
                </Button>
              ) : (
                <Button size="sm" disabled>
                  Submit application
                </Button>
              )}
            </div>
          </Card>

          <p className="mt-5 text-center text-[12.5px] text-mist">
            Already applied?{" "}
            <button onClick={() => setMode("in")} className="text-gold">
              Sign in
            </button>
          </p>
        </>
      )}

      <p className="mt-6 text-center">
        <Link to="/" className="text-[12px] text-mist-dim underline underline-offset-4">
          Skip — look around the app
        </Link>
      </p>
    </div>
  );
}

function AccountStep() {
  return (
    <div className="space-y-4">
      <Field label="Name, as printed on your licence" hint="We check this matches your photo ID.">
        <input className={inputClass} placeholder="Tobias Frei" autoComplete="name" />
      </Field>
      <Field label="Email">
        <input type="email" className={inputClass} placeholder="you@example.com" autoComplete="email" />
      </Field>
      <Field label="Password" hint="At least 10 characters. Nothing is stored — there is no account server yet.">
        <input type="password" className={inputClass} placeholder="••••••••" autoComplete="new-password" />
      </Field>
    </div>
  );
}

function WorkStep() {
  return (
    <div className="space-y-4">
      <Field label="Where you work from" hint="A town or valley — not your home address.">
        <input className={inputClass} placeholder="Zermatt, Valais" />
      </Field>
      <Field label="What you guide" hint="One line. The first thing an athlete reads.">
        <input className={inputClass} placeholder="Matterhorn Hörnli ridge and hard mixed ground" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Years guiding">
          <input type="number" min={0} className={inputClass} placeholder="11" />
        </Field>
        <Field label="Day rate (EUR)">
          <input type="number" min={0} className={inputClass} placeholder="690" />
        </Field>
      </div>
      <Notice tone="neutral">
        Your rate stays yours. ICEFALL does not set your price and does not rank guides by what they
        pay us — there is no way to buy a higher position.
      </Notice>
    </div>
  );
}

function DocumentsStep() {
  return (
    <div>
      <Notice tone="gold" className="mb-4">
        <div className="flex gap-2.5">
          <ShieldCheck size={15} strokeWidth={1.8} className="mt-px shrink-0 text-gold" />
          <div>
            <p className="text-snow">Why we ask for these</p>
            <p className="mt-1.5">
              A client picks a guide and then follows them onto a glacier. We read every document
              before your listing goes live. We do not contact your association — your badge will say
              exactly that, and nothing more.
            </p>
          </div>
        </div>
      </Notice>

      <ul className="space-y-2.5">
        {CREDENTIAL_SPECS.map((spec) => (
          <li key={spec.kind} className="rounded-tile border border-hairline bg-obsidian/40 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] text-snow">{spec.label}</p>
              {!spec.required && <Badge>If applicable</Badge>}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">{spec.detail}</p>
            <Button variant="secondary" size="sm" className="mt-3" disabled>
              <Upload size={13} strokeWidth={1.8} />
              Choose file
            </Button>
          </li>
        ))}
      </ul>

      <Disclaimer className="mt-4">
        Uploading is disabled — there is no storage connected, so a file picker here would take your
        documents nowhere.
      </Disclaimer>
    </div>
  );
}

function NextStep() {
  return (
    <div>
      <SectionLabel>What happens next</SectionLabel>
      <ol className="mt-3.5 space-y-3.5">
        {[
          ["You submit", "Your application joins the queue. You can sign in and see where it is at any time."],
          ["We read it", "A person at ICEFALL opens each document and decides. Usually a few working days."],
          ["We come back", "Approved, or a specific reason and what to send. A refusal always says why — your income depends on it."],
          ["You go live", "Athletes can find you. Your badge states what we checked and on what date."],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-hairline text-[10.5px] text-mist">
              {i + 1}
            </span>
            <div>
              <p className="text-[13px] text-snow">{title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-mist">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Notice tone="alert" className="mt-5">
        Submitting is disabled — there is no review queue connected yet. When there is, this button
        is the point at which your documents leave your device.
      </Notice>
    </div>
  );
}
