import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, SlidersHorizontal, Users } from "lucide-react";

import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { GroupCard } from "@/components/network/GroupCard";
import { cn } from "@/lib/utils";
import { SAFETY_REMINDER } from "@/network/privacy";
import {
  EXPERIENCE_LABELS,
  NETWORK_NOT_CONNECTED_NOTICE,
  type ExperienceLevel,
} from "@/network/types";
import {
  DATE_FILTER_LABELS,
  NO_FILTERS,
  SIZE_FILTER_LABELS,
  STYLE_FILTER_LABELS,
  activeFilterCount,
  anyFilterActive,
  matchesFilters,
  type DateFilter,
  type GroupFilters,
  type SizeFilter,
  type StyleFilter,
} from "@/network/groups";
import { useApp, usePrimaryGoal } from "@/state/AppState";

/**
 * Groups — parties forming around one mountain.
 *
 * A GROUP IS AN `Expedition`. This screen supersedes the older crew screen
 * rather than sitting beside it: the record, the creation flow and the
 * membership are all the ones that already existed, and the workspace at
 * /explore/groups/:id is where a group is actually planned.
 *
 * THE ONE THING THIS SCREEN MUST NEVER DO: invent a group or a person.
 *
 * ICEFALL has no server, no user database and no other users. The only groups
 * that exist are the ones this athlete created on this device, so "Discover
 * groups" is EMPTY — not seeded, not demoed, not filled with plausible parties
 * heading for plausible peaks. Someone could plan an alpine objective around a
 * partner who does not exist, and this feature's own safety copy is about
 * meeting strangers in the mountains; a fabricated group is a hazard rather
 * than a placeholder. An empty list at zero users is the correct rendering of
 * the network.
 *
 * Two consequences that shape the layout:
 *
 *   · EVERY COUNT IS REAL. "Your groups" reports what is on this device and
 *     "Discover" reports zero. Neither is padded, and neither is hidden.
 *   · TWO KINDS OF EMPTY, NEVER BLURRED. The filters run over the athlete's own
 *     groups, so an empty result there is a true statement about a real search
 *     ("none of yours match"). The discovery list is empty because there is
 *     nothing to search at all, and it says that instead — a screen that let
 *     the second read as the first would be telling the athlete ICEFALL looked.
 */

/* -------------------------------------------------------------------------- */
/* Facet options                                                               */
/* -------------------------------------------------------------------------- */

const DATE_OPTIONS: DateFilter[] = ["any", "open-now", "next-90", "this-year", "passed"];
const SIZE_OPTIONS: SizeFilter[] = ["any", "pair", "small", "large"];
const STYLE_OPTIONS: StyleFilter[] = ["any", "guided", "independent", "not-recorded"];
const EXPERIENCE_OPTIONS: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "expert"];

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function Groups() {
  const { expeditions, groupStyle, objectives, networkOptIn } = useApp();
  const goal = usePrimaryGoal();

  const [filters, setFilters] = useState<GroupFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The mountain facet is built from the groups that exist, so every option in
  // it returns something. A list of peaks nobody has a group for would be a
  // menu of dead ends dressed as a search.
  const peakNames = useMemo(
    () =>
      [...new Set(expeditions.map((e) => e.peakName))].sort((a, b) => a.localeCompare(b, "en-GB")),
    [expeditions],
  );

  const visible = useMemo(
    () => expeditions.filter((e) => matchesFilters(e, groupStyle[e.id], filters)),
    [expeditions, groupStyle, filters],
  );

  // Offered in the empty state as a starting point — the athlete's OWN
  // objective, never a mountain invented to make the screen look busy.
  const suggestedPeak = goal?.name ?? objectives.find((o) => !o.summitedAt)?.name ?? null;
  const createHref = suggestedPeak
    ? `/explore/crew/new?peak=${encodeURIComponent(suggestedPeak)}`
    : "/explore/crew/new";

  const filtering = anyFilterActive(filters);

  return (
    <Screen>
      <Stagger className="pt-5">
        <Rise>
          <p className="text-[13px] leading-relaxed text-mist">
            A group is a party forming around one mountain and one date window. You can build yours
            here and plan it properly; finding other people's needs a network ICEFALL has not
            connected yet.
          </p>
        </Rise>

        {/* ---- Your groups — real, local, theirs --------------------------- */}

        <Rise className="pt-6">
          <SectionLabel
            action={
              expeditions.length > 0 ? (
                <Button asChild variant="ghost" size="sm" className="-mr-2">
                  <Link to="/explore/crew/new">
                    <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
                    New
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {/* The count is what is on this device, and nothing else. */}
            Your groups · {expeditions.length}
          </SectionLabel>
        </Rise>

        {expeditions.length > 0 && (
          <Rise className="pt-3">
            <Filters
              filters={filters}
              peakNames={peakNames}
              open={filtersOpen}
              onOpen={() => setFiltersOpen((v) => !v)}
              onChange={setFilters}
            />
          </Rise>
        )}

        {expeditions.length === 0 ? (
          <Rise className="pt-3">
            <Card>
              <p className="text-[14px] text-snow">You have not created a group yet</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                Creating one records the mountain, the window and the party you want on this device,
                and opens a workspace to plan it in. Nothing is published — there is nowhere for it
                to go.
              </p>
              {/* Secondary: the single azure call to action on this screen belongs
                  to the empty Discover state below. */}
              <Button asChild variant="secondary" className="mt-4 w-full">
                <Link to={createHref}>
                  <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
                  Create a group
                </Link>
              </Button>
            </Card>
          </Rise>
        ) : visible.length === 0 ? (
          <Rise className="pt-3">
            {/* A real search over real data came back empty. Said in exactly
                those terms, because it is the one empty state on this screen
                that a filter genuinely caused. */}
            <Card>
              <p className="text-[14px] text-snow">
                None of your {expeditions.length} {expeditions.length === 1 ? "group" : "groups"}{" "}
                match these filters
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                This one really is a filtered list of what you have — nothing has been hidden from
                you, and no other groups exist to be found.
              </p>
              <Button
                variant="secondary"
                className="mt-4 w-full"
                onClick={() => setFilters(NO_FILTERS)}
              >
                Clear filters
              </Button>
            </Card>
          </Rise>
        ) : (
          <>
            {filtering && (
              <Rise className="pt-3">
                <p className="tnum text-[11px] text-mist-dim">
                  Showing {visible.length} of {expeditions.length}.
                </p>
              </Rise>
            )}
            {visible.map((group) => (
              <Rise key={group.id} className="pt-3">
                <GroupCard
                  group={group}
                  style={groupStyle[group.id]}
                  to={`/explore/groups/${group.id}`}
                />
              </Rise>
            ))}
          </>
        )}

        {/* ---- Discover — empty, because there is nobody else -------------- */}

        <Rise className="pt-8">
          {/* Zero, stated. The count is not omitted to spare the screen. */}
          <SectionLabel>Discover groups · 0</SectionLabel>
        </Rise>

        <Rise className="pt-3">
          <DiscoverEmptyState
            peakName={suggestedPeak}
            createHref={createHref}
            networkOptIn={networkOptIn}
          />
        </Rise>

        <Rise className="pt-5">
          <Disclaimer>{NETWORK_NOT_CONNECTED_NOTICE}</Disclaimer>
        </Rise>

        {/* ---- Meeting people in the mountains ---------------------------- */}

        <Rise className="pt-8">
          <SectionLabel>Before you meet anyone</SectionLabel>
          <Card className="mt-3">
            <p className="text-[12px] leading-relaxed text-mist">{SAFETY_REMINDER}</p>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Discover — the empty state                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What a network of zero people looks like, drawn deliberately.
 *
 * No sample parties, no "3 groups near you", no demo flag. The invitation is to
 * be the first, because being the first is the true state of affairs.
 */
function DiscoverEmptyState({
  peakName,
  createHref,
  networkOptIn,
}: {
  peakName: string | null;
  createHref: string;
  networkOptIn: boolean;
}) {
  return (
    <Card>
      <span
        aria-hidden="true"
        className="grid h-11 w-11 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim"
      >
        <Users size={18} strokeWidth={1.4} />
      </span>

      <p className="display mt-4 text-[26px] leading-tight text-snow">Be the first.</p>

      <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
        There are no other groups to find. ICEFALL has no server and no other members yet, so this
        list is empty rather than filled with examples — nobody has posted a party, and nothing has
        been hidden from you.
      </p>

      <Button asChild size="lg" className="mt-5 w-full">
        <Link to={createHref}>
          <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
          {peakName ? `Create a ${peakName} group` : "Create a group"}
        </Link>
      </Button>

      <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
        Discovery needs a network that is not connected. Until it is, a group you create is held on
        this device and is visible to nobody but you.
        {!networkOptIn &&
          " You have not turned the Expedition Network on either, so nothing about you is held as a network profile or compared with anyone."}
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The facets, over the athlete's own groups.
 *
 * Collapsed by default: with a handful of real groups the list is short, and a
 * wall of pills above two cards would be a search interface pretending to have
 * a corpus behind it. Everything here narrows a real list of real records.
 */
function Filters({
  filters,
  peakNames,
  open,
  onOpen,
  onChange,
}: {
  filters: GroupFilters;
  peakNames: readonly string[];
  open: boolean;
  onOpen: () => void;
  onChange: (f: GroupFilters) => void;
}) {
  const count = activeFilterCount(filters);

  return (
    <Card inset={false}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2.5 text-left"
        >
          <SlidersHorizontal size={15} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
          <span className="text-[13px] text-snow">Filters</span>
          {count > 0 && (
            <span className="tnum rounded-full border border-azure/40 bg-azure/[0.08] px-2 py-[2px] text-[10px] text-azure">
              {count}
            </span>
          )}
        </button>
        {count > 0 && (
          <button
            type="button"
            onClick={() => onChange(NO_FILTERS)}
            className="section-label shrink-0 text-mist-dim transition-colors hover:text-snow"
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-hairline px-4 py-4">
          <Facet label="Mountain">
            <Pill
              label="Any mountain"
              selected={filters.peakName === null}
              onSelect={() => onChange({ ...filters, peakName: null })}
            />
            {peakNames.map((name) => (
              <Pill
                key={name}
                label={name}
                selected={filters.peakName === name}
                onSelect={() => onChange({ ...filters, peakName: name })}
              />
            ))}
          </Facet>

          <Facet label="Dates">
            {DATE_OPTIONS.map((id) => (
              <Pill
                key={id}
                label={DATE_FILTER_LABELS[id]}
                selected={filters.date === id}
                onSelect={() => onChange({ ...filters, date: id })}
              />
            ))}
          </Facet>

          <Facet label="Experience" note="Self-declared. ICEFALL checks nobody's ability.">
            <Pill
              label="Any experience"
              selected={filters.experience === null}
              onSelect={() => onChange({ ...filters, experience: null })}
            />
            {EXPERIENCE_OPTIONS.map((id) => (
              <Pill
                key={id}
                label={EXPERIENCE_LABELS[id]}
                selected={filters.experience === id}
                onSelect={() => onChange({ ...filters, experience: id })}
              />
            ))}
          </Facet>

          <Facet label="Party size">
            {SIZE_OPTIONS.map((id) => (
              <Pill
                key={id}
                label={SIZE_FILTER_LABELS[id]}
                selected={filters.size === id}
                onSelect={() => onChange({ ...filters, size: id })}
              />
            ))}
          </Facet>

          <Facet
            label="Guided or independent"
            note="Recorded in a group's workspace. Groups where nobody has said are “not recorded”, never assumed independent."
          >
            {STYLE_OPTIONS.map((id) => (
              <Pill
                key={id}
                label={STYLE_FILTER_LABELS[id]}
                selected={filters.style === id}
                onSelect={() => onChange({ ...filters, style: id })}
              />
            ))}
          </Facet>

          <Facet label="Training together" note="Groups whose stated intent includes training.">
            <Pill
              label="Training together"
              selected={filters.trainingTogether}
              onSelect={() => onChange({ ...filters, trainingTogether: !filters.trainingTogether })}
            />
          </Facet>
        </div>
      )}
    </Card>
  );
}

function Facet({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="section-label">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
      {note && <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{note}</p>}
    </div>
  );
}

function Pill({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[12px] transition-colors",
        selected
          ? "border-azure/55 bg-azure/[0.12] text-azure"
          : "border-hairline text-mist-dim hover:border-hairline-strong hover:text-mist",
      )}
    >
      {label}
    </button>
  );
}
