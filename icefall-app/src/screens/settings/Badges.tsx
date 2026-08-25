import { Link } from "react-router-dom";
import { Check, ChevronRight, Crown, Lock, ShieldCheck, Users } from "lucide-react";
import { Button, Disclaimer } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { BadgeHex } from "@/components/domain/BadgeHex";
import {
  BADGES, BADGES_INTRO, BADGE_LIMIT_NOTICE, BADGE_NOT_BUILT_NOTICE, BADGE_STATE_LABEL,
  badgeState, type BadgeSpec, type BadgeState,
} from "@/badges/model";
import { useSettings } from "@/settings/store";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * ICEFALL BADGES.
 *
 * One page that says what each badge means, whether you have it, and how to
 * apply. Written so somebody reading a badge on a stranger's profile can find
 * out exactly what it does and does not claim — which is the whole point of a
 * badge on a platform where people meet on glaciers.
 */
export default function Badges() {
  const { settings } = useSettings();
  const { currentTier } = useApp();

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="Badges" back="/profile" />
      </div>

      <Stagger className="px-5 pb-6">
        <Rise>
          <p className="text-[12.5px] leading-relaxed text-mist">{BADGES_INTRO}</p>
        </Rise>

        {BADGES.map((badge) => (
          <Rise key={badge.id} className="pt-3">
            <BadgeCard badge={badge} state={badgeState(badge, settings, currentTier)} />
          </Rise>
        ))}

        {/* ---- Why badges exist ------------------------------------------- */}
        {currentTier === "free" && (
          <Rise className="pt-6">
            <div className="rounded-card border border-azure/35 bg-azure/[0.05] p-4">
              <p className="flex items-center gap-2 text-[12px] uppercase tracking-[0.1em] text-azure">
                <Crown size={14} strokeWidth={1.8} />
                Verified is a Pro feature
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-snow">
                Verification is reserved for ICEFALL Pro members. Attaching a cost to it is what
                makes it worth checking.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link to="/pricing">Upgrade to Pro</Link>
              </Button>
            </div>
          </Rise>
        )}

        <Rise className="pt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "Trust & authenticity",
                body: "Verified members build trust and help maintain a high standard in the community.",
              },
              {
                icon: Lock,
                title: "Secure & safe",
                body: "ICEFALL checks carefully, so a badge means something when you see one.",
              },
              {
                icon: Users,
                title: "Stronger community",
                body: "Badges recognise those who contribute, support and inspire others.",
              },
            ].map((c) => (
              <div key={c.title} className="rounded-card border border-hairline bg-graphite p-4">
                <c.icon size={16} strokeWidth={1.7} className="text-azure" />
                <p className="mt-2.5 text-[13px] text-snow">{c.title}</p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">{c.body}</p>
              </div>
            ))}
          </div>
        </Rise>

        <Rise className="pt-5">
          <Disclaimer>{BADGE_LIMIT_NOTICE}</Disclaimer>
          <Disclaimer className="mt-3">{BADGE_NOT_BUILT_NOTICE}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

const STATE_TONE: Record<BadgeState["kind"], string> = {
  earned: "border-summit/50 bg-summit/[0.12] text-summit",
  pending: "border-azure/50 bg-azure/[0.10] text-azure",
  declined: "border-danger/50 bg-danger/[0.10] text-danger",
  open: "border-hairline-strong text-mist",
  "locked-pro": "border-azure/40 bg-azure/[0.06] text-azure/85",
  community: "border-hairline-strong text-mist-dim",
};

function BadgeCard({ badge, state }: { badge: BadgeSpec; state: BadgeState }) {
  const body = (
    <div className="flex items-start gap-4 p-4">
      {/*
        Always in full colour.
        The mark is the badge's identity — blue for Verified, azure for Sherpa,
        green for Guide — and this page is the catalogue that teaches people to
        recognise them. Draining the colour for badges you have not earned made
        every one of them a grey outline, which taught nobody anything. What you
        have and have not got is said by the pill instead.
      */}
      <BadgeHex badge={badge} size={56} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[16px] text-snow">{badge.name}</p>
          {/* The badge's own accent, as it appears beside a name on a profile. */}
          <Check
            size={13}
            strokeWidth={3}
            style={{ color: badge.stroke }}
            className="shrink-0"
          />
          <span
            className={cn(
              "rounded-pill border px-2 py-[3px] text-[9.5px] uppercase tracking-[0.09em]",
              STATE_TONE[state.kind],
            )}
          >
            {BADGE_STATE_LABEL[state.kind]}
          </span>
        </div>
        <p className="mt-1 text-[11.5px] text-mist-dim">{badge.tagline}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-mist">{badge.about}</p>

        {state.kind === "locked-pro" && (
          <div className="mt-3 rounded-tile border border-hairline bg-slate/50 p-3">
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-snow">
              <Lock size={14} strokeWidth={1.8} className="mt-0.5 shrink-0 text-azure" />
              Paid members can apply for verification.
            </p>
            {/* The page-level azure CTA below is the primary; this stays quiet. */}
            <Link
              to="/pricing"
              className="mt-2.5 inline-grid h-9 place-items-center rounded-pill border border-hairline-strong px-4 text-[12px] text-snow transition-colors hover:border-azure/50"
            >
              Upgrade to Pro
            </Link>
          </div>
        )}
        {state.kind === "pending" && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-mist-dim">
            Submitted. Nobody can review it yet — see the note at the foot of this page.
          </p>
        )}
      </div>
      {badge.applyPath && (state.kind === "open" || state.kind === "declined") && (
        <ChevronRight size={16} strokeWidth={1.8} className="mt-1.5 shrink-0 text-mist-dim" />
      )}
    </div>
  );

  const shell = "block overflow-hidden rounded-card border border-hairline bg-graphite";

  /*
   * A locked badge carries its own "Upgrade to Pro" link INSIDE the card, and an
   * anchor cannot contain another anchor — React said so, and browsers resolve
   * it by silently splitting the markup, which breaks both links. So the card is
   * only tappable when it has no inner link of its own.
   */
  const wholeCardLinks =
    Boolean(badge.applyPath) && (state.kind === "open" || state.kind === "declined");

  return wholeCardLinks ? (
    <Link to={badge.applyPath!} className={cn(shell, "transition-colors hover:border-hairline-strong")}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
