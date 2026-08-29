import { Database, KeyRound } from "lucide-react";
import { Card, PageHead, Pill, SectionLabel } from "@/components/ui";
import { BACKEND_NOT_CONNECTED, isBackendConfigured } from "@/backend/client";

/**
 * Deliberately honest about what is not wired yet, rather than showing toggles
 * that save nothing.
 *
 * THE CONNECTION STATUS IS NOT READ FROM THE ENVIRONMENT — see
 * `backend/client.ts` for the bug that taught us why. In short: the two Supabase
 * variables became defined in this app the day the project was provisioned, and
 * this screen started claiming it was reading live data while having no client
 * to read it with. Credentials are not a connection.
 */
export default function Settings() {
  const configured = isBackendConfigured();

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
                {configured ? "Reading live data from the shared ICEFALL database." : BACKEND_NOT_CONNECTED}
              </p>
              {/*
                THE ENV-VAR SNIPPET WAS REMOVED ON PURPOSE. It used to print the
                two variables to set, which read as "do this and you are
                connected". Both are now set in this app's `.env.local` and it is
                still not connected, because the missing piece is a client and a
                query rather than a credential. Printing the recipe for a step
                already completed would send a reader to check the one thing that
                is not the problem.
              */}
              {!configured && (
                <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
                  Both Supabase variables are already set here. What is missing is the
                  client and the read paths, which is a code change rather than configuration.
                </p>
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
