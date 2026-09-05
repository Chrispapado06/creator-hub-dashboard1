import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Eye,
  Mountain,
  Pencil,
  Wallet,
} from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Button, Card } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import { SupportEntry } from "@/components/Support";
import { PersonAvatar, Photo } from "@/components/Photo";
import { fromDayRate, listing, offeredRoutes } from "@/domain/listing";
import { whatIsMissing } from "@/data/listingStore";
import { APPLICATION, ME } from "@/data/demo";
import {
  canListPublicly,
  effectiveStatus,
  identityVerified,
  verificationSentence,
} from "@/data/model";
import { StatusMarks } from "@/components/StatusBadge";
import { showsCredentialMark, useIdentity } from "@/domain/identity";
import { signOut } from "@/auth/account";

/**
 * PROFILE — the mockup's hero, and the hub everything else hangs off.
 *
 * "My Mountains" is the peaks this guide actually has bookings on, not a
 * declared list — so it cannot claim ground they have never been engaged for.
 * The two figures are the same `marketplace()` call the home screen makes, so
 * the two screens cannot show different answers to "how am I doing".
 */
export default function Profile() {
  const { identity, loading } = useIdentity();
  const listed = canListPublicly(APPLICATION);
  const status = effectiveStatus(APPLICATION);
  const offered = offeredRoutes();
  const missing = whatIsMissing(listing(), status === "approved");
  const from = fromDayRate();

  /** A session displaces the sample here too — see `domain/identity.ts`. */
  /* Same gap as Home: while the session resolves this fell through to the
     sample, showing a real guide the invented profile and its marks. */
  if (loading) {
    return (
      <Screen>
        <Stagger>
          <Rise className="pt-7">
            <h1 className="text-[22px] font-light text-snow">Profile</h1>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  if (identity.mode === "session") {
    return (
      <Screen>
        <Stagger>
          <Rise className="pt-7 text-center">
            <PersonAvatar name={identity.label} size={80} className="mx-auto" />
            <h1 className="mt-3 flex items-center justify-center gap-1.5 text-[20px] font-light text-snow">
              <span className="truncate">{identity.label}</span>
              {/* identity={false} is honest until migration 20260831160000 is
                  pushed; then bind to profiles.identity_verified (computed
                  field) — second reader on that push's displacement list. */}
              <StatusMarks credentials={showsCredentialMark(identity, false)} identity={false} />
            </h1>
            <p className="mt-1 text-[12.5px] text-mist">
              {identity.guideUnreadable
                ? "Account not checked just now"
                : identity.isGuide
                  ? "Guide account"
                  : "Not a guide account"}
            </p>
          </Rise>

          <Rise className="pt-6">
            <Card>
              <p className="text-[12.5px] leading-relaxed text-mist">
                Your listing is not connected to this account yet. The mountains, rates and
                availability you set are still held on this device only — they have not been lost,
                and they are not published.
              </p>
            </Card>
          </Rise>

          <Rise className="pt-4">
            <Card inset={false}>
              <ul className="divide-y divide-hairline">
                <Row
                  to="/mountains"
                  icon={Mountain}
                  title="What I guide"
                  detail="Mountains and treks, and your terms"
                />
                <Row
                  to="/availability"
                  icon={CalendarDays}
                  title="Availability"
                  detail="The days you are free to work"
                />
                <Row
                  to="/verification"
                  icon={BadgeCheck}
                  title="Verification"
                  detail="What ICEFALL has checked"
                />
                <Row
                  to="/payouts"
                  icon={Wallet}
                  title="Payouts"
                  detail="What you are owed, and when it lands"
                />
              </ul>
            </Card>
          </Rise>

          <Rise className="pb-2 pt-6">
            <Button variant="secondary" size="sm" className="w-full" onClick={() => void signOut()}>
              Sign out
            </Button>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  if (!ME) {
    return (
      <Screen>
        <Stagger>
          <Rise className="pt-7">
            <h1 className="text-[22px] font-light text-snow">Profile</h1>
            <Card className="mt-5">
              <p className="text-[12.5px] leading-relaxed text-mist">
                There is no guide profile on this device yet. Nothing is listed, and nothing is
                hidden — an athlete searching for a guide simply does not find you, because you have
                not applied.
              </p>
              <Link
                to="/welcome"
                className="mt-3.5 inline-flex items-center gap-1.5 text-[12.5px] text-azure"
              >
                Sign in <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </Card>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <Stagger>
        {/* ---- Hero ---------------------------------------------------------- */}
        <Rise className="relative">
          <Photo peak={ME.heroPeak} alt="" className="h-44 w-full" rounded="rounded-none" />
          <div className="scrim-bottom absolute inset-x-0 bottom-0 h-28" />
          <div className="absolute inset-x-0 -bottom-9 flex flex-col items-center">
            <span className="rounded-full border-[3px] border-obsidian">
              <PersonAvatar name={ME.name} size={80} />
            </span>
          </div>
        </Rise>

        <Rise className="px-5 pt-12 text-center">
          <h1 className="flex items-center justify-center gap-1.5 text-[20px] font-light text-snow">
            {ME.name}
            <StatusMarks
              credentials={status === "approved"}
              identity={identityVerified(APPLICATION)}
            />
          </h1>
          <p className="mt-1 text-[12.5px] text-mist">{ME.title}</p>

          <div className="mt-4 flex justify-center gap-2.5">
            <Button size="sm" variant="secondary" asChild>
              <Link to="/profile/edit">
                <Pencil size={13} strokeWidth={1.9} />
                Edit profile
              </Link>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/preview">
                <Eye size={13} strokeWidth={1.9} />
                Preview
              </Link>
            </Button>
          </div>
        </Rise>

        {/* ---- Visibility ------------------------------------------------------ */}
        <Rise className="px-5 pt-5">
          <Card>
            <p className="text-[12.5px] leading-relaxed text-mist">
              {listed
                ? "Your listing is live. Athletes can find you and enquire about your dates."
                : "Your listing is not being shown. Your dates and clients are untouched — see Checks for what is outstanding."}
            </p>
          </Card>
        </Rise>

        {/* ---- What is stopping this going live ------------------------------- */}
        {missing.length > 0 && (
          <Rise className="px-5 pt-5">
            <Notice tone="alert">
              <p className="text-snow">
                {missing.length === 1
                  ? "One thing is missing before climbers can find you"
                  : `${missing.length} things are missing before climbers can find you`}
              </p>
              <ul className="mt-2 space-y-1">
                {missing.map((m) => (
                  <li key={m} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-alert" />
                    {m}
                  </li>
                ))}
              </ul>
            </Notice>
          </Rise>
        )}

        {/* ---- My mountains ---------------------------------------------------- */}
        <Rise className="px-5 pt-5">
          <div className="flex items-baseline justify-between">
            <p className="section-label">What I guide</p>
            <Link to="/mountains" className="text-[11.5px] text-azure">
              Manage
            </Link>
          </div>
          <p className="mt-1 text-[11.5px] text-mist-dim">
            {offered.length > 0
              ? `${offered.filter((r) => r.kind === "mountain").length} mountains · ${offered.filter((r) => r.kind === "trek").length} treks${from !== null ? ` · from €${from}/day` : ""}`
              : "The mountains and treks you will take climbers onto."}
          </p>
          {offered.length > 0 ? (
            <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto">
              {offered.slice(0, 4).map((m) => (
                <Link
                  key={`${m.kind}:${m.routeId}`}
                  to={`/route/${m.kind}/${m.routeId}`}
                  className="w-[86px] shrink-0"
                >
                  <Photo peak={m.routeId} kind={m.photoKind} alt="" className="h-[68px] w-full" />
                  <p className="mt-1.5 text-center text-[10.5px] leading-tight text-mist">
                    {m.name}
                  </p>
                </Link>
              ))}
              {offered.length > 4 && (
                <Link
                  to="/mountains"
                  className="grid h-[68px] w-[62px] shrink-0 place-items-center rounded-tile border border-hairline bg-graphite text-[13px] text-mist"
                >
                  +{offered.length - 4}
                </Link>
              )}
            </div>
          ) : (
            <Card className="mt-3">
              <p className="text-[12.5px] leading-relaxed text-mist">
                You have not added a mountain or trek yet, so a climber searching for a guide cannot
                find you.
              </p>
              <Link
                to="/route/add"
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-azure"
              >
                Add your first route <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </Card>
          )}
        </Rise>

        {/* ---- Links ------------------------------------------------------------- */}
        <Rise className="px-5 pt-6">
          <Card inset={false}>
            <ul className="divide-y divide-hairline">
              <Row
                to="/mountains"
                icon={Mountain}
                title="What I guide"
                detail="Mountains and treks, and your terms"
              />
              <Row
                to="/availability"
                icon={CalendarDays}
                title="Availability"
                detail="The days you are free to work"
              />
              <Row
                to="/verification"
                icon={BadgeCheck}
                title="Verification"
                detail="What ICEFALL has checked"
              />
              <Row
                to="/payouts"
                icon={Wallet}
                title="Payouts"
                detail="What you are owed, and when it lands"
              />
            </ul>
          </Card>
        </Rise>

        {/* ---- About ------------------------------------------------------------- */}
        <Rise className="px-5 pt-6">
          <p className="section-label">About me</p>
          <Card className="mt-3">
            <p className="text-[12.5px] leading-relaxed text-mist">{ME.bio}</p>
          </Card>
        </Rise>

        <Rise className="px-5 pt-6">
          <SupportEntry topic="listing" />
        </Rise>

        <Rise className="px-5 pb-3 pt-5">
          <Card>
            <p className="section-label">What ICEFALL tells the client</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
              {verificationSentence(APPLICATION)}
            </p>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Row({
  to,
  icon: Icon,
  title,
  detail,
}: {
  to: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  detail: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03]"
      >
        <Icon size={17} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] text-snow">{title}</span>
          <span className="block text-[11.5px] text-mist-dim">{detail}</span>
        </span>
        <ChevronRight size={16} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
      </Link>
    </li>
  );
}
