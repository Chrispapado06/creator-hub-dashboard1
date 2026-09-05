"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { CompanyInvitationRow, CompanyMemberRow } from "../../_components/data";
import { formatDay } from "../../_components/format";
import { notSaved } from "../../_components/not-connected";
import { Resolve, type Result } from "../../_components/states";

/**
 * Team & access — the day-one gap closed: the CRM could create a company
 * nobody could sign in to. This panel is how a company's people get logins.
 *
 * HOW IT ACTUALLY WORKS, because the UI must not imply more: inviting creates
 * an invitation ROW keyed to an email address. NOTHING SENDS AN EMAIL — no part
 * of ICEFALL sends mail yet — so the form says, in so many words, that the
 * address must be passed on by a person. When someone signs up (or next signs
 * in) with that exact address, the shared auth module consumes the invitation
 * and the membership appears here. Joining a company elevates no role: operator
 * access comes from `company_users`, never from a staff role.
 *
 * REVOKING REQUIRES A REASON — the database refuses without one, so the confirm
 * appears only once the sentence exists (the resolve-box pattern).
 */
export function CompanyAccess({
  members,
  invitations,
}: {
  members: Result<CompanyMemberRow[]>;
  invitations: Result<CompanyInvitationRow[]>;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "sales">("admin");
  const [revoking, setRevoking] = React.useState<string | null>(null);
  const [revokeReason, setRevokeReason] = React.useState("");

  const open = (invitations.state === "ok" ? invitations.value : []).filter(
    (i) => i.accepted_at === null && i.revoked_at === null,
  );

  const emailIsAddressable = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-xl leading-none">Team &amp; access</CardTitle>
        <CardDescription className="max-w-3xl leading-relaxed">
          Who can sign in for this company. An invitation is claimed by whoever signs up with the exact address it
          names; joining a company grants operator access only — never ICEFALL staff powers.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.06em]">Members</p>
          <div className="mt-2">
            <Resolve
              result={members}
              what="members"
              isEmpty={(v) => v.length === 0}
              empty="Nobody can sign in for this company yet. Invite their first admin below."
            >
              {(rows) => (
                <div className="flex flex-col gap-1.5">
                  {rows.map((m) => (
                    <div
                      key={m.profile_id}
                      className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                    >
                      <span className="font-medium text-sm">{m.name}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant={m.company_role === "admin" ? "default" : "outline"} className="font-medium">
                          {m.company_role === "admin" ? "Admin" : "Sales"}
                        </Badge>
                        {m.status !== "active" ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/20 bg-amber-500/10 font-medium text-amber-600 capitalize dark:text-amber-400"
                          >
                            {m.status}
                          </Badge>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Resolve>
          </div>

          {open.length > 0 ? (
            <>
              <p className="mt-5 font-semibold text-muted-foreground text-xs uppercase tracking-[0.06em]">
                Waiting to be claimed
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {open.map((i) => (
                  <div key={i.id} className="rounded-md border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-sm tabular-nums">{i.email}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="font-medium">
                          {i.company_role === "admin" ? "Admin" : "Sales"}
                        </Badge>
                        <span className="text-muted-foreground/70 text-xs">expires {formatDay(i.expires_at)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // Switching rows clears the typed reason, so a
                            // sentence written about one invitation can never
                            // be submitted against another.
                            setRevoking(revoking === i.id ? null : i.id);
                            setRevokeReason("");
                          }}
                        >
                          Revoke
                        </Button>
                      </span>
                    </div>
                    {revoking === i.id ? (
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          value={revokeReason}
                          onChange={(event) => setRevokeReason(event.target.value)}
                          placeholder="Why — required to revoke"
                          className="h-8 min-w-0 flex-1"
                        />
                        {/* The explanation is a precondition of the action, not
                            an afterthought: no reason, no confirm. */}
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={revokeReason.trim().length === 0}
                          onClick={() => {
                            notSaved(`The invitation for ${i.email} is still open.`);
                            setRevoking(null);
                            setRevokeReason("");
                          }}
                        >
                          Confirm
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div>
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.06em]">Invite</p>
          <div className="mt-2 flex flex-col gap-4">
            <Field className="gap-1.5">
              <FieldLabel className="text-muted-foreground text-xs" htmlFor="invite-email">
                Email address
              </FieldLabel>
              <Input
                id="invite-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="them@their-company.com"
              />
            </Field>

            <Field className="gap-1.5">
              <FieldLabel className="text-muted-foreground text-xs" htmlFor="invite-role">
                Role at the company
              </FieldLabel>
              <Select value={role} onValueChange={(value) => setRole(value as "admin" | "sales")}>
                <SelectTrigger id="invite-role" className="w-full" aria-label="Role at the company">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="admin">Admin — manages their team and content</SelectItem>
                    <SelectItem value="sales">Sales — works leads, cannot invite</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Button
              className="self-start"
              disabled={!emailIsAddressable}
              onClick={() => notSaved(`No invitation was recorded for ${email.trim()}.`)}
            >
              Create invitation
            </Button>

            {/* The sentence that keeps this honest: no email leaves ICEFALL. */}
            <p className="text-muted-foreground/70 text-xs leading-relaxed">
              This records the invitation — it does not send an email, because nothing does yet. Pass the address on
              yourself; their access attaches when they sign up with it.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
