import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldOff } from "lucide-react";
import { useAuth } from "./auth-context";

/**
 * Shown when a signed-in user has no *active* membership: either their invite
 * hasn't been accepted yet, or their account was deactivated. RLS already
 * denies their data; this is just a friendly explanation + a way out.
 */
export default function NoAccessScreen() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <ShieldOff className="size-5" />
          </div>
          <CardTitle>No workspace access</CardTitle>
          <CardDescription>
            {user?.email ? (
              <>
                <span className="font-medium text-foreground">
                  {user.email}
                </span>{" "}
                isn't an active member of this workspace.
              </>
            ) : (
              "Your account isn't an active member of this workspace."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            If you were just invited, open the invite link from your email to
            finish setting up. Otherwise, ask an owner to (re)invite you.
          </p>
          <Button variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
