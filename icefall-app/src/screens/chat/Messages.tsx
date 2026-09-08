import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Check,
  CloudOff,
  Lock,
  Mountain as MountainIcon,
  Pin,
  Plus,
  Search,
  SlidersHorizontal,
  User,
  Users,
} from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Avatar, Card, Disclaimer } from "@/components/ui/primitives";
import { CompanyMark } from "@/components/domain/CompanyMark";
import { fmtDay, isLocked, lastMessage, type Conversation } from "./data";
import { useConversations, useConversationsState } from "./useConversations";
import { MESSAGING_IS_A_SNAPSHOT } from "@/messaging";
import { cn } from "@/lib/utils";

/**
 * CHAT — the conversation list.
 *
 * Grouped by WHO, not by recency. Expedition companies, guides and groups are
 * three different relationships: one is a business you may be about to send
 * five figures to, one is a person roped to you on a mountain, and one is the
 * party you are going with. A single date-ordered list flattens that into
 * "things that pinged", and the company you are mid-negotiation with ends up
 * below a photography club because somebody posted a picture.
 *
 * ── WHAT IS REAL HERE, AND THIS PARAGRAPH USED TO SAY "NOTHING" ─────────────
 *
 * It said: "Nothing arrives. ICEFALL has no server, so no message sends, no
 * reply comes back and no unread count is real." That was true and is no
 * longer. `messaging/` reads `threads`, `thread_participants` and `messages`
 * from ICEFALL's server, sends through `send_message`, and derives the unread
 * number from `last_read_at`. Those rows are real people and real words.
 *
 * WHAT IS STILL NOT TRUE, and is now the sentence at the foot of the screen:
 * NOTHING IS PUSHED. There is no notification certificate and no live socket,
 * so this list is a still taken when the screen opened — see
 * `MESSAGING_IS_A_SNAPSHOT`. The old `BACKEND_NOT_CONNECTED` came OFF this
 * screen in the same change that made sending work, which is the condition
 * `backend/client.ts` set for removing it.
 *
 * The fixtures have not gone: `DEMO_CONVERSATIONS` is still gated on
 * `import.meta.env.DEV` and `useConversations` now adds a second gate — they
 * are hidden entirely once the server has answered, so an invented guide can
 * never sit under a real climber in the same list.
 *
 * ── DELIBERATELY ABSENT ─────────────────────────────────────────────────────
 *
 * The design puts a green presence dot on two of the guides. Presence needs a
 * server to report it, so a dot that is always green is a claim that someone is
 * reachable when nobody is. It is not drawn.
 */

type Filter = "all" | "company" | "guide" | "group" | "athlete";

/**
 * PEOPLE IS A TAB BECAUSE PEOPLE ARE NOW A KIND OF CONVERSATION.
 *
 * The four tabs were written when the only rows were companies, guides and
 * groups, and a direct conversation between two climbers was drawn once, in a
 * People section that only "All" rendered. That is the one kind this app can
 * now create — so an athlete whose only conversation was a direct one had a
 * filter row in which no tab could show it.
 */
const TABS: { value: Filter; label: string; icon: typeof User }[] = [
  { value: "all", label: "All", icon: MountainIcon },
  { value: "athlete", label: "People", icon: User },
  { value: "guide", label: "Guides", icon: User },
  { value: "group", label: "Groups", icon: Users },
  { value: "company", label: "Companies", icon: MountainIcon },
];

export default function Messages() {
  const [tab, setTab] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const conversations = useConversations();
  /* Why the list is what it is. `state` is `ready` only when the server
     actually answered for this account; every other value carries a sentence
     that says what is missing and why, and none of them is "you have no
     messages". */
  const { state, message, reload } = useConversationsState();

  const needle = q.trim().toLowerCase();
  const matching = useMemo(
    () =>
      conversations.filter(
        (c) =>
          needle === "" ||
          c.name.toLowerCase().includes(needle) ||
          (lastMessage(c)?.body ?? "").toLowerCase().includes(needle),
      ),
    [conversations, needle],
  );

  /**
   * Most recent first, and anything with nothing in it last.
   *
   * A locked company with no messages was sorting above a thread you are
   * mid-negotiation with, because the list was in declaration order. A section
   * headed by an empty conversation reads as though nothing has happened in it.
   */
  const byRecency = (a: Conversation, b: Conversation) => {
    const at = (c: Conversation) => lastMessage(c)?.at ?? "";
    const [x, y] = [at(a), at(b)];
    if (x === "" && y === "") return a.name.localeCompare(b.name, "en-GB");
    if (x === "") return 1;
    if (y === "") return -1;
    return y.localeCompare(x);
  };

  const of = (kind: Filter) => matching.filter((c) => c.kind === kind).sort(byRecency);
  const companies = of("company");
  const guides = of("guide");
  const groups = of("group");
  const others = of("athlete");

  const showAll = tab === "all";
  const tabLabel = TABS.find((t) => t.value === tab)?.label ?? "All";

  /*
   * HOW MANY ROWS THIS TAB ACTUALLY DRAWS — which is not `matching.length`.
   *
   * `matching` is filtered by the search box and never by the tab, so the empty
   * state was computed from rows that were not on screen: selecting a tab with
   * nothing in it made every `Section` return null AND suppressed the sentence
   * that would have said why, leaving a heading, a search box, five tabs and
   * nothing else — the exact "cannot tell empty from broken" case the rest of
   * this screen is arranged to avoid.
   */
  const shownCount = showAll
    ? matching.length
    : tab === "company"
      ? companies.length
      : tab === "guide"
        ? guides.length
        : tab === "group"
          ? groups.length
          : others.length;

  return (
    <Screen>
      <Stagger>
        <Rise className="flex items-start justify-between gap-3 pb-1 pt-6">
          <div className="min-w-0">
            <h1 className="text-[27px] font-light tracking-[-0.02em] text-snow">Chat</h1>
            <p className="mt-1.5 max-w-[30ch] text-[12.5px] leading-relaxed text-mist">
              Expedition companies, guides and the people you are going with.
            </p>
          </div>
          <Link
            to="/messages/new"
            className="mt-1 flex shrink-0 items-center gap-1.5 rounded-pill border border-azure/45 px-3.5 py-2 text-[11.5px] text-azure transition-colors hover:bg-azure/10"
          >
            <Plus size={13} strokeWidth={2} />
            New
          </Link>
        </Rise>

        <Rise className="pt-4">
          <div className="relative">
            <Search
              size={15}
              strokeWidth={1.7}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search messages…"
              aria-label="Search messages"
              className="w-full rounded-pill border border-hairline bg-graphite py-2.5 pl-10 pr-10 text-[13.5px] text-snow outline-none placeholder:text-mist-dim focus:border-azure [&::-webkit-search-cancel-button]:hidden"
            />
            <SlidersHorizontal
              size={14}
              strokeWidth={1.7}
              aria-hidden
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
            />
          </div>
        </Rise>

        <Rise className="no-scrollbar -mx-5 mt-5 flex gap-1 overflow-x-auto px-5">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              aria-pressed={t.value === tab}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-pill border px-3.5 py-2 text-[12px] transition-colors",
                t.value === tab
                  ? "border-azure/55 bg-azure/[0.12] text-azure"
                  : "border-hairline-strong text-mist hover:text-snow",
              )}
            >
              <t.icon size={13} strokeWidth={1.8} />
              {t.label}
            </button>
          ))}
        </Rise>

        {(showAll || tab === "company") && (
          <Section title="Expedition companies" icon={MountainIcon} count={companies.length}>
            <RowCard rows={companies} />
          </Section>
        )}

        {(showAll || tab === "guide") && (
          <Section title="Guides" icon={User} count={guides.length}>
            {showAll ? <GuideStrip guides={guides} /> : <RowCard rows={guides} />}
          </Section>
        )}

        {(showAll || tab === "group") && (
          <Section title="Groups" icon={Users} count={groups.length}>
            <RowCard rows={groups} />
          </Section>
        )}

        {(showAll || tab === "athlete") && (
          <Section title="People" icon={User} count={others.length}>
            <RowCard rows={others} />
          </Section>
        )}

        {shownCount === 0 && (
          <Rise className="pt-6">
            {/* NOT A CARD. An explanation is not an object — see the house rule
                on boxes — and wrapping one sentence in a bordered panel makes
                the emptiest screen in the app the busiest-looking. */}
            <p className="text-[13px] leading-relaxed text-mist">
              {needle !== "" && conversations.length > 0
                ? showAll
                  ? `Nothing matches “${q.trim()}”.`
                  : `Nothing under ${tabLabel} matches “${q.trim()}”.`
                : conversations.length > 0
                  ? /* The list is not empty — this filter is. Said that way
                       round, because "no conversations" would be false and the
                       reader can see the tab they pressed. */
                    `No conversations under ${tabLabel}. The ones you have are under All.`
                  : state === "loading"
                    ? "Looking…"
                    : (message ??
                      "No conversations yet. Open somebody’s profile and write to them, or send an enquiry to an expedition company.")}
            </p>
            {/* A retry only where retrying is the answer. A build with no
                server, or nobody signed in, is not fixed by asking again. */}
            {(state === "unreachable" || state === "refused") && (
              <button
                type="button"
                onClick={reload}
                className="mt-3 rounded-pill border border-hairline-strong px-3.5 py-2 text-[12px] text-mist transition-colors hover:text-snow"
              >
                Try again
              </button>
            )}
          </Rise>
        )}

        <Rise className="pt-7">
          {/* The honest sentence, and it changed meaning in this release.
              Messages now genuinely send; what does not happen is a push. When
              the server had something else to report, that is said instead —
              a snapshot notice over an empty list that failed to load would be
              answering a question nobody asked. */}
          <Disclaimer>
            {state === "ready" || state === "loading"
              ? MESSAGING_IS_A_SNAPSHOT
              : (message ?? MESSAGING_IS_A_SNAPSHOT)}
          </Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: typeof User;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <>
      <Rise className="flex items-center gap-2 pt-7">
        <Icon size={15} strokeWidth={1.7} className="text-azure" />
        <h2 className="text-[14px] text-snow">{title}</h2>
        <span className="tnum ml-auto text-[11.5px] text-mist-dim">{count}</span>
      </Rise>
      <div className="pt-3">{children}</div>
    </>
  );
}

/** The company / group / people list — one card, hairline-divided rows. */
function RowCard({ rows }: { rows: Conversation[] }) {
  const navigate = useNavigate();

  return (
    <Rise>
      <Card inset={false}>
        <ul className="divide-y divide-hairline">
          {rows.map((c) => {
            const last = lastMessage(c);
            const locked = isLocked(c);

            return (
              <li key={c.id}>
                <button
                  onClick={() => navigate(`/messages/${c.id}`)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <Mark conversation={c} />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] text-snow">{c.name}</span>
                      {/* No tick here either — see `Thread.tsx`. ICEFALL has
                          checked nobody's documents, so there is no date to put
                          behind one and no tick to draw. */}
                    </span>

                    {c.kind === "group" && c.members !== undefined && (
                      <span className="tnum mt-0.5 block text-[11px] text-mist-dim">
                        {c.members} members
                      </span>
                    )}

                    {locked ? (
                      <span className="mt-1 flex items-center gap-1 text-[12px] text-mist-dim">
                        <Lock size={11} strokeWidth={1.9} className="shrink-0" />
                        Book to message
                      </span>
                    ) : (
                      <span className="mt-1 clamp-2 block text-[12px] leading-snug text-mist">
                        {last?.state === "queued" && (
                          <CloudOff
                            size={11}
                            strokeWidth={1.9}
                            className="mr-1 inline-block align-[-1px] text-alert"
                          />
                        )}
                        {last?.state === "sent" && (
                          <Check
                            size={11}
                            strokeWidth={2.2}
                            className="mr-1 inline-block align-[-1px] text-mist-dim"
                          />
                        )}
                        {last?.from === "me" && last?.state !== "queued"
                          ? "You: "
                          : last?.author !== undefined
                            ? `${last.author}: `
                            : ""}
                        {last?.body}
                      </span>
                    )}
                  </span>

                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="tnum text-[10.5px] text-mist-dim">
                      {last ? fmtDay(last.at) : ""}
                    </span>
                    {c.pinned === true && (
                      <Pin
                        size={12}
                        strokeWidth={1.8}
                        aria-label="Pinned"
                        className="text-mist-dim"
                      />
                    )}
                    {/* `null` is NOT MEASURED and draws nothing. A count that
                        could only be proved a floor wears a "+" — see
                        `unreadExact`. Neither is ever rendered as a zero. */}
                    {c.unread !== null && c.unread > 0 && (
                      <span className="tnum grid h-[18px] min-w-[18px] place-items-center rounded-full bg-azure px-1.5 text-[10px] font-medium text-obsidian">
                        {c.unread}
                        {c.unreadExact === false ? "+" : ""}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </Rise>
  );
}

/** Guides, as the design draws them on the overview: a horizontal strip. */
function GuideStrip({ guides }: { guides: Conversation[] }) {
  const navigate = useNavigate();

  return (
    <Rise className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
      {guides.map((c) => {
        const last = lastMessage(c);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate(`/messages/${c.id}`)}
            className="w-[188px] shrink-0 rounded-card border border-hairline bg-graphite p-3.5 text-left transition-colors hover:border-hairline-strong"
          >
            <div className="flex items-start gap-2.5">
              <Avatar name={c.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-snow">{c.name}</p>
                {c.credential !== undefined && (
                  <p className="truncate text-[10.5px] text-mist-dim">{c.credential}</p>
                )}
              </div>
              {c.unread !== null && c.unread > 0 && (
                <span className="tnum grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-azure px-1.5 text-[10px] font-medium text-obsidian">
                  {c.unread}
                  {c.unreadExact === false ? "+" : ""}
                </span>
              )}
            </div>
            <p className="mt-2.5 clamp-2 text-[11.5px] leading-snug text-mist">{last?.body}</p>
            <p className="tnum mt-2 text-[10px] text-mist-dim">{last ? fmtDay(last.at) : ""}</p>
          </button>
        );
      })}
    </Rise>
  );
}

/**
 * The tile beside a row.
 *
 * A company gets its mark, a group its peak photograph, anyone else their
 * initials. Company logos are gitignored and vercelignored, so the fallback is
 * not an edge case — it is what every deployment does.
 *
 * A COMPANY IS NOT A PERSON, AND USED TO BE DRAWN AS ONE. When a company's logo
 * was absent — which is every deployment — this fell through to `Avatar`, the
 * person component: a circle of initials, the same treatment as a climber in
 * the list above it. So an expedition company and a human being were visually
 * the same kind of thing in a message list, which is the one place the
 * difference matters most: you tell a company what you want, and you tell a
 * person where you are. `CompanyMark` keeps the squared-off company idiom
 * whether or not there is an image.
 */
function Mark({ conversation: c }: { conversation: Conversation }) {
  const [failed, setFailed] = useState(false);

  if (c.kind === "company") {
    return <CompanyMark name={c.name} logoPath={c.logo} size={44} />;
  }

  if (c.kind === "group") {
    // A group's photograph is of a MOUNTAIN, not of the people in it — so it is
    // cover-cropped in a circle, and falls back to the group glyph rather than
    // to initials of a group name nobody chose.
    if (c.photo !== undefined && !failed) {
      return (
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-hairline bg-elevated">
          <img
            src={c.photo}
            alt=""
            aria-hidden
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        </span>
      );
    }
    return (
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline-strong bg-slate text-mist">
        <Users size={17} strokeWidth={1.6} />
      </span>
    );
  }

  return <Avatar name={c.name} size={44} />;
}
