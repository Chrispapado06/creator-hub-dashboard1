import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { establishSessionFromUrl } from "./session-from-url";
import { useAuth } from "./auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FullScreenSpinner } from "@/components/full-screen-spinner";

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });
type Values = z.infer<typeof schema>;

/**
 * Invite acceptance / first-login password set. The session is established
 * either by the desktop deep-link handler (before navigating here) or, as a web
 * fallback, from tokens in this page's URL.
 */
export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (session) {
        if (!cancelled) {
          setHasSession(true);
          setChecking(false);
        }
        return;
      }
      const established = await establishSessionFromUrl();
      if (!cancelled) {
        setHasSession(established);
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function onSubmit(values: Values) {
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }
    // Mark any pending invite for this email as accepted (audit only).
    await supabase.rpc("accept_my_invites");
    setSubmitting(false);
    toast.success("Password set — welcome to OFM Workspace!");
    navigate("/", { replace: true });
  }

  if (checking) return <FullScreenSpinner label="Verifying your invite…" />;

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">
            {hasSession ? "Set your password" : "Invite link needed"}
          </CardTitle>
          <CardDescription>
            {hasSession
              ? "Choose a password to finish joining the workspace."
              : "Open the invite link from your email to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasSession ? (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  Set password &amp; continue
                </Button>
              </form>
            </Form>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/login", { replace: true })}
            >
              Go to sign in
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
