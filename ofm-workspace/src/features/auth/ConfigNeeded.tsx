import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings2 } from "lucide-react";

/**
 * Shown when the Supabase env vars are missing, so the app never white-screens
 * on a fresh checkout. See README → Setup.
 */
export default function ConfigNeeded() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Settings2 className="size-5" />
          </div>
          <CardTitle>Connect Supabase to continue</CardTitle>
          <CardDescription>
            OFM Workspace needs a Supabase project to store its data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>
              Create a project at{" "}
              <span className="font-medium text-foreground">
                supabase.com/dashboard
              </span>
              .
            </li>
            <li>
              Copy{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                ofm-workspace/.env.example
              </code>{" "}
              to{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                .env
              </code>{" "}
              and fill in your Project URL + publishable key.
            </li>
            <li>Restart the dev server.</li>
          </ol>
          <p className="text-muted-foreground">
            Full instructions are in the{" "}
            <span className="font-medium text-foreground">README</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
