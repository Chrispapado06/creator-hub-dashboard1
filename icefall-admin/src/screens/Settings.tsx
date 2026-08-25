import { Database, KeyRound } from "lucide-react";
import { Card, PageHead, Pill, SectionLabel } from "@/components/ui";

/**
 * Deliberately honest about what is not wired yet, rather than showing toggles
 * that save nothing.
 */
export default function Settings() {
  const configured = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );

  return (
    <>
      <PageHead title="Settings" subtitle="Connection and access." />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <div className="flex items-start gap-3">
            <Database size={17} strokeWidth={1.7} className="mt-[2px] shrink-0 text-faint" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <SectionLabel>Database</SectionLabel>
                <Pill tone={configured ? "green" : "amber"}>
                  {configured ? "Connected" : "Not connected"}
                </Pill>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                {configured
                  ? "Reading live data from the shared ICEFALL database."
                  : "Every figure in this app is placeholder data until a Supabase project is linked. The schema and its security policies are already written and tested — see icefall-supabase/."}
              </p>
              {!configured && (
                <pre className="mt-3 overflow-x-auto rounded-tile bg-raised p-3 text-[11.5px] leading-relaxed text-muted ring-1 ring-line">
{`VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>`}
                </pre>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <KeyRound size={17} strokeWidth={1.7} className="mt-[2px] shrink-0 text-faint" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <SectionLabel>Staff access</SectionLabel>
                <Pill tone="amber">Not wired</Pill>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                There is no sign-in yet, so this build is not protected — do not deploy it to a
                public URL in this state. Once auth lands, a session will need
                <code className="mx-1 rounded bg-raised px-1 py-0.5 text-[11.5px] ring-1 ring-line">
                  role = 'admin'
                </code>
                on its profile; roles are promoted by hand in SQL and can never be granted by
                signing up.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
