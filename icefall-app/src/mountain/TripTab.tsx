/**
 * TRIP (brief M5, plan §3.5, mockup spec §8) — the trip as this phone holds it.
 *
 * THE MOCKUP'S SHAPE, AND WHY IT IS BETTER THAN WHAT WE BUILT. One small azure
 * line naming the trip, then seven flat chevron rows — ITINERARY, DOCUMENTS,
 * GEAR, CONTACTS, PHRASEBOOK, JOURNAL, COACH — then one outlined button,
 * BACK DOWN — END TRIP. That is the whole screen. The version before this one
 * unrolled the itinerary, the contacts, the rescue numbers and the kit list
 * down a single page, which is why it read as a wall: there was no hierarchy
 * to follow. Each of those now lives on its own sub-screen, and the row that
 * opens it says what is actually in there.
 *
 * EVERY SUB-LINE IS A READING, NOT A CAPTION. "12 of 14 packed" is counted off
 * the ticks on this phone; "3 entries" is counted in the journal store; the
 * coach's queued count is counted on the sync queue. Where a count cannot be
 * read yet the row says so ("Reading this phone…") and where there is nothing,
 * it says that instead. No row prints a number the phone has not measured.
 *
 * `trip/*` in `App.tsx`, so the sub-screens are children HERE rather than six
 * more lazy chunks — the same shape the Map tab uses for Retrace.
 */

import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";

import { mountainById } from "@/data/mock/mountains";
import { availableSentence, usedSentence, useStorageStatus } from "@/device/storageStatus";
import { KEPT_ON_THIS_PHONE, onSyncQueueChange, waitingLabel } from "@/device/syncQueue";
import { cn } from "@/lib/utils";
import { appAgeSentence } from "@/offline/appAge";
import { installAppUpdateNow, useAppUpdate } from "@/offline/appUpdate";
import { updateRowCopy } from "@/offline/appUpdateModel";
import { generateChecklist } from "@/services/checklist";
import { useApp } from "@/state/AppState";
import { useTraining } from "@/tracking/training";
import { useConnectivity } from "@/trip/connectivity";

import { useEmergencyInfo } from "./emergencyInfo";
import { leaveMountainMode } from "./mode";
import { canOpenFullApp } from "./MountainShell";
import { countQueuedCoachQuestions } from "./mountainCoach";
import { MOUNTAIN_PATHS } from "./paths";
import {
  useMountainTrip,
  type MountainTrip,
  type TripDay,
  type MountainItineraryDay,
} from "./trip";
import ContactsScreen from "./trip/ContactsScreen";
import DocumentsScreen from "./trip/DocumentsScreen";
import GearScreen from "./trip/GearScreen";
import ItineraryScreen from "./trip/ItineraryScreen";
import JournalScreen from "./trip/JournalScreen";
import PhrasebookScreen from "./trip/PhrasebookScreen";
import { ROLE_LABEL, ROLE_ORDER, readContacts } from "./trip/contacts";
import { NO_DOCUMENTS_LINE, countDocuments, onDocumentsChange } from "./trip/documents";
import {
  buildGearGroups,
  gearCount,
  gearScopeId,
  packedLabel,
  readGear,
  type StoredGear,
} from "./trip/gear";
import { NO_ENTRIES_LINE, countJournal, onJournalChange } from "./trip/journal";
import { languagesForTrip, shownRows } from "./trip/phrases";
import { dateRange, dayHeadline, visibleKit } from "./tripTabModel";
import { packSizeLabel, subjectFromTrip, useTripPack } from "./tripPack";
import { BigButton, M_ROW, Row, SectionLabel } from "./ui";
import { useSignalPill } from "./useSignal";

const READING = "Reading this phone…";

export default function TripTab() {
  return (
    <Routes>
      <Route index element={<TripIndex />} />
      <Route path="itinerary" element={<ItineraryScreen />} />
      <Route path="documents" element={<DocumentsScreen />} />
      <Route path="gear" element={<GearScreen />} />
      <Route path="contacts" element={<ContactsScreen />} />
      <Route path="phrasebook" element={<PhrasebookScreen />} />
      <Route path="journal" element={<JournalScreen />} />
      <Route path="*" element={<TripIndex />} />
    </Routes>
  );
}

/* -------------------------------------------------------------------------- */
/* The tab itself                                                              */
/* -------------------------------------------------------------------------- */

function TripIndex() {
  const { trip, today, day, itineraryDay } = useMountainTrip();

  return (
    <div className="pb-10">
      <section className="px-5 pb-5 pt-6">
        {trip ? (
          <>
            {/* MONT BLANC · GOÛTER ROUTE · 12–14 JULY — whichever of those three
                this trip actually has. A route we do not hold is left out
                rather than guessed at. */}
            <SectionLabel as="h1" tone="azure">
              {tripLine(trip)}
            </SectionLabel>
            {trip.notice && (
              <p className="mt-3 m-text-label leading-snug text-alert">{trip.notice}</p>
            )}
          </>
        ) : (
          <>
            <h1 className="m-text-number font-light tracking-[-0.02em] text-snow">No trip open</h1>
            <p className="mt-3 m-text-body leading-snug text-mist">
              Start a trip in the full app to see its days, contacts and kit here. What is already
              on this phone is below.
            </p>
          </>
        )}
      </section>

      <TripRows trip={trip} day={day} itineraryDay={itineraryDay} />

      {trip && (
        <div className="px-5 pt-8">
          <BigButton variant="azure-outline" to={MOUNTAIN_PATHS.end}>
            Back down — end trip
          </BigButton>
        </div>
      )}

      {/* NOT IN THE MOCKUP, KEPT BELOW THE BUTTON. The mockup's Trip tab stops
          at the end-trip button, but this is where the download, the storage
          warning and the app update live, and none of them has another home.
          Same precedent as "Open full app", which the spec says to keep here. */}
      <SavedHere trip={trip} today={today} />
      <OpenFullAppRow />
    </div>
  );
}

/**
 * `MONT BLANC · GOÛTER ROUTE · 12–14 JULY`, from whatever of it is real.
 *
 * The route is added only when the trip's own name does not already carry it —
 * a trip named "Mont Blanc · Goûter route" would otherwise say it twice.
 */
function tripLine(trip: MountainTrip): string {
  const head = trip.name;
  const route =
    trip.routeName && !head.toLowerCase().includes(trip.routeName.toLowerCase())
      ? trip.routeName
      : null;
  return [head, route, dateRange(trip.startDate, trip.endDate)]
    .filter((part): part is string => !!part)
    .join(" · ");
}

/**
 * The seven rows, in the mockup's order. UPPERCASE titles here — unlike the
 * index screen's rows — because on this screen the title is a destination and
 * the sentence under it is the news.
 */
function TripRows({
  trip,
  day,
  itineraryDay,
}: {
  trip: MountainTrip | null;
  day: TripDay | null;
  itineraryDay: MountainItineraryDay | null;
}) {
  const documents = useLiveCount(countDocuments, onDocumentsChange);
  const journal = useLiveCount(countJournal, onJournalChange);
  const queuedQuestions = useLiveCount(countQueuedCoachQuestions, onSyncQueueChange);
  const gear = useGearLine(trip);
  const contacts = useContactsLine(trip?.id ?? null);

  return (
    <nav aria-label="This trip">
      {trip && (
        <TripRow
          to={MOUNTAIN_PATHS.tripItinerary}
          title="Itinerary"
          sub={itineraryLine(trip, day, itineraryDay)}
        />
      )}
      <TripRow
        to={MOUNTAIN_PATHS.tripDocuments}
        title="Documents"
        sub={
          documents === null
            ? READING
            : documents === 0
              ? NO_DOCUMENTS_LINE
              : `${documents} saved on this phone`
        }
      />
      <TripRow to={MOUNTAIN_PATHS.tripGear} title="Gear" sub={gear} />
      <TripRow to={MOUNTAIN_PATHS.tripContacts} title="Contacts" sub={contacts} />
      <TripRow
        to={MOUNTAIN_PATHS.tripPhrasebook}
        title="Phrasebook"
        sub={phrasebookLine(trip?.mountainId ?? null)}
      />
      <TripRow
        to={MOUNTAIN_PATHS.tripJournal}
        title="Journal"
        sub={
          journal === null
            ? READING
            : journal === 0
              ? NO_ENTRIES_LINE
              : `${journal} ${journal === 1 ? "entry" : "entries"} · kept on this phone`
        }
      />
      <TripRow
        to={MOUNTAIN_PATHS.coach}
        title="Coach"
        sub={
          queuedQuestions
            ? `Answers offline · ${queuedQuestions} question${queuedQuestions === 1 ? "" : "s"} queued`
            : "Answers offline · nothing queued"
        }
      />
    </nav>
  );
}

function TripRow({ to, title, sub }: { to: string; title: string; sub: string }) {
  return (
    <Row to={to} chevron className="items-center py-3">
      <span className="min-w-0 flex-1">
        <span className="section-label block text-snow">{title}</span>
        <span className="mt-1.5 block m-text-label leading-snug text-mist">{sub}</span>
      </span>
    </Row>
  );
}

/* -------------------------------------------------------------------------- */
/* What each row says                                                          */
/* -------------------------------------------------------------------------- */

/** "Day 2 of 3 · summit and descent", or the honest half of it we can read. */
function itineraryLine(
  trip: MountainTrip,
  day: TripDay | null,
  itineraryDay: MountainItineraryDay | null,
): string {
  const head = day ? dayHeadline(day) : dateRange(trip.startDate, trip.endDate);
  if (itineraryDay) return `${head} · ${itineraryDay.label}`;
  if (trip.itinerary) return head;
  return `${head} · no day-by-day plan`;
}

/** "French · 8 phrases" — counted, and only for languages we actually hold. */
function phrasebookLine(mountainId: string | null): string {
  const { forTrip, others } = languagesForTrip(mountainId);
  if (forTrip.length > 0) {
    const phrases = forTrip.reduce((n, l) => n + shownRows(l).length, 0);
    return `${forTrip.map((l) => l.name).join(", ")} · ${phrases} phrase${phrases === 1 ? "" : "s"}`;
  }
  return `No language picked · ${others.length} to choose from`;
}

/** Reads a count and follows its store, so the row is right after a save. */
function useLiveCount(
  read: () => Promise<number>,
  subscribe: (fn: () => void) => () => void,
): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      read()
        .then((v) => {
          if (live) setN(v);
        })
        .catch(() => {
          if (live) setN(null);
        });
    };
    load();
    const off = subscribe(load);
    return () => {
      live = false;
      off();
    };
  }, [read, subscribe]);
  return n;
}

/**
 * "12 of 14 packed", counted the SAME WAY the gear screen counts it — same
 * generated list, same visibility rule, same ticks — so the row and the screen
 * it opens can never disagree.
 */
function useGearLine(trip: MountainTrip | null): string {
  const { can, checklistStatuses } = useApp();
  const scopeId = gearScopeId(trip);
  const goalId = trip?.record?.goalId ?? null;
  const mountain = trip?.mountainId ? mountainById(trip.mountainId) : undefined;

  const [stored, setStored] = useState<StoredGear | null>(null);
  useEffect(() => {
    if (!scopeId) {
      setStored(null);
      return;
    }
    let live = true;
    void readGear(scopeId).then((s) => {
      if (live) setStored(s);
    });
    return () => {
      live = false;
    };
  }, [scopeId]);

  // Curated mountains only: the generator reads height alone and prints
  // nonsense for peaks nobody surveyed (`screens/mountain/Checklist.tsx`, rule 4).
  const generated = useMemo(
    () =>
      mountain
        ? generateChecklist({
            name: mountain.name,
            elevationM: mountain.elevationM,
            lat: mountain.coords.lat,
            lon: mountain.coords.lon,
          })
        : null,
    [mountain],
  );

  const statuses = useMemo(
    () => (goalId ? (checklistStatuses[goalId] ?? {}) : {}),
    [checklistStatuses, goalId],
  );

  const items = useMemo(
    () =>
      generated
        ? visibleKit(generated.items, statuses, {
            full: can("equipment.checklist.full"),
            documents: can("equipment.documents"),
          })
        : [],
    [generated, statuses, can],
  );

  const count = useMemo(() => {
    if (!stored) return null;
    return gearCount(
      buildGearGroups({ items, added: stored.added, ticks: stored.ticks, statuses }),
    );
  }, [items, stored, statuses]);

  if (!scopeId) return "Start a trip in the full app to tick off its kit";
  if (!count) return READING;
  if (count.total === 0) return "Nothing on the list yet";
  return packedLabel(count);
}

/** "Guide, Operator" — the roles this phone actually holds a number for. */
function useContactsLine(tripId: string | null): string {
  const [roles, setRoles] = useState<string[] | null>(null);
  const info = useEmergencyInfo();
  const ownCount = info?.contacts.filter((c) => c.name || c.number).length ?? 0;

  useEffect(() => {
    let live = true;
    readContacts(tripId)
      .then((rows) => {
        if (!live) return;
        setRoles(
          ROLE_ORDER.filter((r) => rows.some((c) => c.role === r)).map((r) => ROLE_LABEL[r]),
        );
      })
      .catch(() => {
        if (live) setRoles([]);
      });
    return () => {
      live = false;
    };
  }, [tripId]);

  if (roles === null) return READING;
  const parts = [...roles];
  if (ownCount > 0) parts.push("your emergency info");
  if (parts.length === 0) return "No numbers saved yet";
  return parts.join(", ");
}

/* -------------------------------------------------------------------------- */
/* What is saved for no signal                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Everything here states its age (brief rule 2). Nothing claims to be current:
 * a part that could be acted on as if it described now goes grey, or silent.
 */
function SavedHere({ trip, today }: { trip: MountainTrip | null; today: string }) {
  const pill = useSignalPill();
  const { plan } = useTraining();
  const info = useEmergencyInfo();
  const storage = useStorageStatus();
  const update = useAppUpdate();

  const subject = useMemo(
    () =>
      subjectFromTrip(trip, {
        today,
        plan,
        ownEmergencyInfo: info ? { filled: info.savedAt > 0, savedAt: info.savedAt } : null,
      }),
    [trip, today, plan, info],
  );
  const pack = useTripPack(subject, { confirmedOnline: pill.online });

  const used = usedSentence(storage);
  const free = availableSentence(storage);
  const appAge = appAgeSentence();

  return (
    <section className="mt-12" aria-labelledby="saved-heading">
      <SectionLabel as="h2" id="saved-heading" className="px-5 pb-3">
        Saved on this phone
      </SectionLabel>

      {appAge && <p className="px-5 pb-3 m-text-label leading-snug text-mist">{appAge}</p>}

      {subject &&
        pack.rows.map((r) => (
          <div key={r.kind} className={cn(M_ROW, "items-start py-3")}>
            <span className="min-w-0">
              <span
                className={cn(
                  "block m-text-body leading-snug",
                  r.age?.greyed ? "text-mist-dim" : "text-snow",
                )}
              >
                {r.label}
              </span>
              {r.sentence && (
                <span className="mt-1 block m-text-label leading-snug text-mist">{r.sentence}</span>
              )}
              {r.age?.text && (
                <span
                  className={cn(
                    "mt-1 block m-text-label",
                    r.age.greyed ? "text-mist-dim" : "text-mist",
                  )}
                >
                  {r.age.text}
                </span>
              )}
            </span>
            {r.sizeBytes !== null && (
              <span className="m-text-label shrink-0 tabular-nums text-mist">
                {packSizeLabel(r.sizeBytes)}
              </span>
            )}
          </div>
        ))}

      {subject && (
        <button
          type="button"
          onClick={() => void pack.refresh()}
          disabled={pack.refreshing}
          className={cn(M_ROW, "m-text-body", pack.refreshing ? "text-mist-dim" : "text-snow")}
        >
          {pack.refreshing
            ? "Downloading…"
            : pill.online
              ? "Download what's missing"
              : "Download · needs a signal"}
        </button>
      )}

      {pack.storageSentence && (
        <p className="px-5 pt-3 m-text-label leading-snug text-alert">{pack.storageSentence}</p>
      )}

      <p className="px-5 pt-3 m-text-label leading-snug text-mist">{KEPT_ON_THIS_PHONE}</p>
      {pill.waiting > 0 && (
        <p className="px-5 pt-2 m-text-label leading-snug text-mist">
          {waitingLabel(pill.waiting)}
        </p>
      )}
      {used && <p className="px-5 pt-2 m-text-label leading-snug text-mist">{used}</p>}
      {free && <p className="px-5 pt-1 m-text-label leading-snug text-mist">{free}</p>}

      {update.ready && update.decision && (
        <div className={cn(M_ROW, "mt-4 items-center py-3")}>
          <span className="min-w-0 m-text-label leading-snug text-mist">
            {updateRowCopy(update.decision)}
          </span>
          <button
            type="button"
            onClick={installAppUpdateNow}
            className="min-h-16 shrink-0 m-text-body text-snow"
          >
            Install now
          </button>
        </div>
      )}
    </section>
  );
}

/** Plan §3.1: leaving is the last row of the Trip tab, not hidden in a menu. */
function OpenFullAppRow() {
  const navigate = useNavigate();
  const signal = useConnectivity();
  const openable = canOpenFullApp(signal);
  return (
    <button
      type="button"
      onClick={() => {
        if (!openable) return;
        leaveMountainMode();
        navigate("/home");
      }}
      aria-disabled={!openable}
      className={cn(M_ROW, "mt-6 m-text-body", openable ? "text-snow" : "text-mist-dim")}
    >
      {openable ? "Open full app" : "Open the full app · needs a signal"}
    </button>
  );
}
