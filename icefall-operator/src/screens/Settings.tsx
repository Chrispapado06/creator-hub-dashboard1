/**
 * Settings, built to the mockup's left-nav layout.
 *
 * The mockup's sub-nav lists Account, Notifications, Security, Preferences,
 * Users & Roles, Integrations, Billing. Only the panes that actually exist are
 * kept — Security/Preferences/Integrations have no real backing and a pane of
 * dead switches would be worse than no pane.
 *
 * Three sections are deliberately not what a generic settings screen shows,
 * and all for the same honesty reason:
 *
 *   COMPANY ACCOUNT is largely read-only. Spec §13 puts the company record, the
 *   first admin login and access resets in ICEFALL's hands. The fields an
 *   operator genuinely owns are editable; the rest say who to ask.
 *
 *   BILLING has no card form and no card on file, because THERE IS NO PAYMENT
 *   PROCESSOR ANYWHERE IN ICEFALL and no money has ever moved. A displayed card
 *   is a fabricated payment record. The section states the real position instead.
 *
 *   ACCOUNT's "Update" / "Update password" / "Delete account" controls have no
 *   backend methods behind them in the local demo — so each one says exactly
 *   that instead of flashing a fake success. Deletion in particular walks the
 *   mockup's type-the-company-name confirmation and then STOPS: closing an
 *   operator account is done by Icefall, because leads, bookings and customer
 *   conversations are a commercial record.
 *
 * APPEARANCE (OP-09) lives in the Account pane rather than reviving the
 * mockup's Preferences entry. A whole sub-nav section holding one switch reads
 * as a section with the rest of its switches missing, and the mockup's other
 * Preferences rows are exactly the dead switches the paragraph above refuses to
 * draw. It is the one control on this screen that takes effect immediately and
 * survives a reload, so it is the one that does not need a Notice explaining
 * that nothing happened.
 */

import { useState } from "react";
import { Bell, Building2, CreditCard, Monitor, Moon, Sun, UserRound, Users } from "lucide-react";
import {
  Button, Card, Field, LockedNotice, Notice, PageHeader, inputClass,
} from "@/components/ui";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay } from "@/domain/dates";
import { useOperator, useSession } from "@/state/OperatorContext";
import { useTheme, type ThemeChoice } from "@/state/theme";

type Section = "account" | "company" | "notifications" | "team" | "billing";

const SECTIONS: { key: Section; label: string; icon: typeof Building2 }[] = [
  { key: "account", label: "Account", icon: UserRound },
  { key: "company", label: "Company account", icon: Building2 },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "team", label: "Users & roles", icon: Users },
  { key: "billing", label: "Billing", icon: CreditCard },
];

export default function Settings() {
  const session = useSession();
  const { company } = useOperator();
  const [section, setSection] = useState<Section>("account");

  return (
    <>
      <PageHeader title="Settings" detail="Manage your account and preferences." />

      <div className="grid gap-4 lg:grid-cols-[210px_1fr]">
        <Card className="h-fit p-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-tile px-3 py-2 text-left text-[12.5px] transition-colors ${
                  active ? "bg-azure-soft font-medium text-azure-ink" : "text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon size={14} className="shrink-0" aria-hidden />
                {s.label}
              </button>
            );
          })}
        </Card>

        <div>
          {section === "account" && <AccountPane />}

          {section === "company" && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-ink">Company account</h2>
              <div className="mt-4 grid max-w-xl gap-4">
                <Field label="Company name" hint="Set by Icefall. Ask your contact to change it.">
                  <input className={inputClass} value={company?.name ?? ""} disabled readOnly />
                </Field>
                <Field
                  label="Contact email"
                  hint="Icefall uses this to reach you. It is never shown to climbers."
                >
                  <input className={inputClass} defaultValue={session.user.email} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Country">
                    <input className={inputClass} value={company?.country ?? ""} disabled readOnly />
                  </Field>
                  <Field label="Based in">
                    <input className={inputClass} value={company?.city ?? ""} disabled readOnly />
                  </Field>
                </div>
                <Field label="Documents">
                  <div className="text-[12.5px] text-muted">
                    {OPERATOR_NOTICES.documentsChecked(
                      company?.documentsCheckedAt ? formatDay(company.documentsCheckedAt.slice(0, 10)) : null,
                    ) ?? "Icefall has not recorded a document check for your company."}
                  </div>
                </Field>
              </div>
              <div className="mt-5 flex items-center gap-3 border-t border-line-soft pt-4">
                <Button variant="primary">Save changes</Button>
                <span className="text-[11.5px] text-muted">
                  Only the fields you can edit are saved. Greyed fields belong to Icefall.
                </span>
              </div>
            </Card>
          )}

          {section === "notifications" && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-ink">Notifications</h2>
              <p className="mt-1 text-[12.5px] text-muted">
                What Icefall tells you about, and where it appears.
              </p>
              <ul className="mt-4 space-y-2.5">
                {[
                  "A new customer enquiry",
                  "A new message on an existing conversation",
                  "A lead assigned to you",
                  "A booking recorded",
                  "Content approved, rejected, or returned with changes",
                  "A placement approaching its end date",
                ].map((x) => (
                  <li key={x} className="flex items-center justify-between rounded-tile bg-canvas px-3 py-2.5">
                    <span className="text-[12.5px] text-ink">{x}</span>
                    <span className="text-[11.5px] text-muted">In the portal</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
                Email delivery is not connected yet. Rather than show a switch that does nothing, this says so
                — everything above appears in your Notifications tab today.
              </p>
            </Card>
          )}

          {section === "team" && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-ink">Users &amp; roles</h2>
              <p className="mt-1 text-[12.5px] text-muted">
                Staff are managed on their own screen, where you can see roles and status together.
              </p>
              <div className="mt-4">
                <a href="/operator/team">
                  <Button variant="primary">Open team</Button>
                </a>
              </div>
            </Card>
          )}

          {section === "billing" && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-ink">Billing</h2>
              {/*
                No card form, no card on file, no invoice table. There is no
                payment processor in ICEFALL and no money has ever moved through
                it; a displayed card or a fabricated invoice history would be a
                payment record that does not exist.
              */}
              <div className="mt-4">
                <Notice>
                  <strong className="font-semibold text-ink">There is no billing in this portal.</strong>{" "}
                  Placement and referral arrangements are agreed with your Icefall contact directly, and
                  invoices come from them. Icefall does not hold your card details, and this screen will not
                  ask for them.
                </Notice>
              </div>
              <p className="mt-4 text-[11.5px] leading-snug text-muted">
                If you are expecting an invoice or want to discuss a placement, reply to your Icefall contact.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/* ---- the Account pane -------------------------------------------------- */

/**
 * Two columns per the mockup: Account information on the left, Change password
 * on the right, and the Danger zone underneath. None of the three writes exists
 * on the backend seam yet, so every submit answers with the truth in a grey
 * Notice rather than a fake success.
 */
function AccountPane() {
  const session = useSession();
  const { company } = useOperator();

  const [fullName, setFullName] = useState(session.user.displayName);
  const [email, setEmail] = useState(session.user.email);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState<{ tone: "neutral" | "rejected"; text: string } | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const submitPassword = () => {
    if (pw.next !== pw.confirm) {
      setPwMsg({ tone: "rejected", text: "The new passwords do not match. Nothing was changed." });
      return;
    }
    setPwMsg({
      tone: "neutral",
      text:
        "Password changes are not wired up in this local demo — nothing was changed. " +
        "Ask your Icefall contact for a reset link; nobody at Icefall can see or set your password.",
    });
    setPw({ current: "", next: "", confirm: "" });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-ink">Account information</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Full name">
              <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Email">
              <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role" hint="Roles are set by your Company Admin and Icefall.">
              <input
                className={inputClass}
                value={session.user.role === "admin" ? "Company Admin" : "Sales Employee"}
                disabled
                readOnly
              />
            </Field>
          </div>
          {accountMsg && (
            <div className="mt-4">
              <Notice>{accountMsg}</Notice>
            </div>
          )}
          <div className="mt-5 border-t border-line-soft pt-4">
            <Button
              variant="primary"
              onClick={() =>
                setAccountMsg(
                  "Saving account details is not wired up in this local demo — nothing was changed. " +
                    "Icefall holds the account record; ask your contact to update it.",
                )
              }
            >
              Update
            </Button>
          </div>
        </Card>

        <Card className="h-fit p-5">
          <h2 className="text-[14px] font-semibold text-ink">Change password</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                className={inputClass}
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </Field>
          </div>
          {pwMsg && (
            <div className="mt-4">
              <Notice tone={pwMsg.tone === "rejected" ? "rejected" : "neutral"}>{pwMsg.text}</Notice>
            </div>
          )}
          <div className="mt-5 border-t border-line-soft pt-4">
            <Button
              variant="primary"
              disabled={!pw.current || !pw.next || !pw.confirm}
              onClick={submitPassword}
            >
              Update password
            </Button>
          </div>
        </Card>
      </div>

      <AppearanceCard />

      <Card className="p-5">
        <div className="lbl text-rejected">Danger zone</div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-[12.5px] leading-snug text-muted">
            <span className="font-medium text-ink">Delete your account</span> — this action cannot be undone.
            All your data will be permanently deleted.
          </p>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Delete account
          </Button>
        </div>
      </Card>

      {confirmOpen && (
        <DeleteConfirmDialog companyName={company?.name ?? "your company"} onClose={() => setConfirmOpen(false)} />
      )}
    </div>
  );
}

/* ---- Appearance (OP-09) ------------------------------------------------ */

const THEME_OPTIONS: { key: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
];

/**
 * A segmented control, and the only writing setting on this screen that works.
 *
 * It is a `radiogroup` rather than three buttons: the three are mutually
 * exclusive and a screen reader should say "Light, 1 of 3" instead of reading
 * out three unrelated controls, one of which happens to look pressed.
 *
 * The line under it states the resolved theme when the choice is System, so
 * "System" never leaves the operator guessing which one they are looking at.
 */
function AppearanceCard() {
  const { choice, resolved, setChoice } = useTheme();

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Appearance</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        How this portal looks on this device. It is remembered in this browser and applies to you only —
        nobody else at your company is affected.
      </p>

      <div className="mt-4">
        <div className="lbl mb-1.5" id="theme-label">
          Theme
        </div>
        <div
          role="radiogroup"
          aria-labelledby="theme-label"
          className="hairline inline-flex gap-0.5 rounded-tile bg-canvas p-0.5"
        >
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = choice === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChoice(option.key)}
                className={`flex items-center gap-1.5 rounded-tile px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  active ? "bg-azure text-canvas" : "text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon size={14} className="shrink-0" aria-hidden />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-[11.5px] leading-snug text-muted">
        {choice === "system"
          ? `Following this device — currently ${resolved}. It changes with your system setting while the portal is open.`
          : "Choose System to follow your device's light and dark setting instead."}
      </p>

      {/*
        Stated rather than left as a surprise. The preview panes reproduce the
        athlete app and the Icefall website, which are dark products; they do
        not follow this setting because what a climber sees does not change
        when an operator changes their own portal's colours.
      */}
      <p className="mt-2 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
        Previews of your listing stay dark in both themes — they show the app and website as a climber sees
        them, not as you have set this portal.
      </p>
    </Card>
  );
}

/**
 * The mockup's confirmation: type the company name, then confirm. What confirm
 * does is tell the truth — closing an operator account is performed by Icefall,
 * because leads, bookings and customer conversations have to be preserved as a
 * commercial record, and a self-service delete button is how that record gets
 * destroyed by accident. No destructive local action exists behind this dialog.
 *
 * The overlay is `bg-scrim`, not `bg-ink/30`: `ink` is near-white in the dark
 * theme, so a scrim mixed from the text colour inverts into a white veil there.
 */
function DeleteConfirmDialog({ companyName, onClose }: { companyName: string; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [stopped, setStopped] = useState(false);
  const matches = typed.trim() === companyName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete account"
      onClick={onClose}
    >
      {/* Card takes no onClick; the wrapper stops the overlay's close-on-click. */}
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
      <Card className="p-5">
        {stopped ? (
          <>
            <h2 className="text-[14px] font-semibold text-ink">Deletion is handled by Icefall</h2>
            <div className="mt-3">
              <LockedNotice>
                Nothing has been deleted. Closing an operator account is performed by Icefall, not from this
                portal — your leads, bookings and customer conversations are preserved as a commercial record.
                Reply to your Icefall contact to close the account.
              </LockedNotice>
            </div>
            <div className="mt-4 border-t border-line-soft pt-3">
              <Button onClick={onClose}>Close</Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-[14px] font-semibold text-ink">Delete account</h2>
            <p className="mt-1.5 text-[12.5px] leading-snug text-muted">
              This action cannot be undone. To continue, type{" "}
              <span className="font-medium text-ink">{companyName}</span> below.
            </p>
            <div className="mt-4">
              <input
                className={inputClass}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={companyName}
                aria-label={`Type ${companyName} to confirm`}
              />
            </div>
            <div className="mt-4 flex gap-2 border-t border-line-soft pt-4">
              <Button variant="danger" disabled={!matches} onClick={() => setStopped(true)}>
                Delete account
              </Button>
              <Button variant="quiet" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Card>
      </div>
    </div>
  );
}
