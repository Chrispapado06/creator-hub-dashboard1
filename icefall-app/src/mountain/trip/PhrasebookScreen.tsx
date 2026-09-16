/**
 * MOUNTAIN MODE · TRIP · PHRASEBOOK (brief M5, plan §3.5).
 *
 * Emergency phrases for the countries of the trip's mountain. Everything comes
 * from `phrases.ts`, which is part of the app file, so this screen reads the
 * same with no signal and never calls anything.
 *
 * Two states: pick a language, then read its phrases. Tapping a phrase fills
 * the screen in black on white — that mode is for holding the phone out to a
 * stranger, so it ignores the Mountain theme on purpose: white is the most
 * readable thing in daylight and the phrase has to be legible at arm's length.
 */

import { useCallback, useEffect, useState } from "react";

import { useMountainTrip } from "../trip";
import { BigButton, SectionLabel } from "../ui";
import { SubHeader, SubNote, SubRow } from "./chrome";
import {
  DRAFT_LABEL,
  DRAFT_NOTE,
  MISSING_NOTE,
  SHOW_HINT,
  englishFor,
  languageByCode,
  languagesForTrip,
  missingIds,
  missingLabel,
  shownRows,
  type PhraseEntry,
  type PhraseLanguage,
} from "./phrases";

const ROW =
  "flex min-h-[72px] w-full items-center gap-4 border-t border-hairline px-5 py-4 text-left";

export default function PhrasebookScreen() {
  const { trip } = useMountainTrip();
  const { countries, forTrip, others, emptyCountries } = languagesForTrip(trip?.mountainId ?? null);

  const [code, setCode] = useState<string | null>(null);
  const language = code ? languageByCode(code) : null;

  return (
    <div className="pb-12">
      <SubHeader title="Phrasebook" />
      <SubNote>{DRAFT_NOTE}</SubNote>

      {language ? (
        <LanguageView language={language} onChange={() => setCode(null)} />
      ) : (
        <Picker
          countries={countries}
          forTrip={forTrip}
          others={others}
          emptyCountries={emptyCountries}
          onPick={setCode}
        />
      )}
    </div>
  );
}

function Picker({
  countries,
  forTrip,
  others,
  emptyCountries,
  onPick,
}: {
  countries: string[];
  forTrip: PhraseLanguage[];
  others: PhraseLanguage[];
  emptyCountries: { country: string; reason: string }[];
  onPick: (code: string) => void;
}) {
  return (
    <>
      {forTrip.length > 0 && (
        <section aria-labelledby="phrases-trip">
          <SectionLabel as="h2" id="phrases-trip" className="px-5 pb-2 pt-6">
            {countries.join(" and ")}
          </SectionLabel>
          <ul>
            {forTrip.map((l) => (
              <LanguageRow key={l.code} language={l} onPick={onPick} />
            ))}
          </ul>
        </section>
      )}

      {emptyCountries.map((c) => (
        <SubNote key={c.country} className="border-t border-hairline">
          <span className="text-snow">{c.country}.</span> {c.reason}
        </SubNote>
      ))}

      {countries.length === 0 && (
        <SubNote>No trip is running, so nothing is picked for you. Choose a language.</SubNote>
      )}

      <section aria-labelledby="phrases-all">
        <SectionLabel as="h2" id="phrases-all" className="px-5 pb-2 pt-6">
          {forTrip.length > 0 ? "Other languages" : "Languages"}
        </SectionLabel>
        <ul>
          {others.map((l) => (
            <LanguageRow key={l.code} language={l} onPick={onPick} />
          ))}
        </ul>
      </section>
    </>
  );
}

function LanguageRow({
  language,
  onPick,
}: {
  language: PhraseLanguage;
  onPick: (code: string) => void;
}) {
  const missing = missingLabel(language);
  return (
    <li>
      <SubRow
        title={language.name}
        detail={<span lang={language.code}>{language.endonym}</span>}
        note={`${DRAFT_LABEL}${missing ? ` · ${missing}` : ""}`}
        onClick={() => onPick(language.code)}
        chevron
      />
    </li>
  );
}

function LanguageView({ language, onChange }: { language: PhraseLanguage; onChange: () => void }) {
  const rows = shownRows(language);
  const [open, setOpen] = useState<number | null>(null);
  const missing = missingIds(language);

  return (
    <>
      <section className="px-5 pb-2 pt-4">
        <h2 className="m-text-title text-snow">
          {language.name} <span className="text-mist">· {language.endonym}</span>
        </h2>
        <p className="mt-1 m-text-label text-mist-dim">{DRAFT_LABEL}</p>
        {language.note && (
          <p className="mt-2 m-text-label leading-snug text-mist">{language.note}</p>
        )}
        <p className="mt-2 m-text-label leading-snug text-mist">{SHOW_HINT}</p>
      </section>

      <ul className="mt-4">
        {rows.map((row, i) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className={`${ROW} flex-col items-start gap-1`}
            >
              <span className="m-text-label text-mist">{row.english}</span>
              <span className="m-text-title leading-snug text-snow" lang={language.code}>
                {row.entry.text}
              </span>
              {row.entry.say && <span className="m-text-label text-mist-dim">{row.entry.say}</span>}
              {row.entry.means && (
                <span className="m-text-label text-mist-dim">Says: {row.entry.means}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <section className="border-t border-hairline px-5 pt-5">
          <p className="m-text-label leading-snug text-mist">
            Not in {language.name}: {missing.map((id) => englishFor(id)).join(" ")}
          </p>
          <p className="mt-2 m-text-label leading-snug text-mist-dim">{MISSING_NOTE}</p>
        </section>
      )}

      <div className="px-5 pt-8">
        <BigButton variant="azure-outline" onClick={onChange}>
          Change language
        </BigButton>
      </div>

      {open !== null && rows[open] && (
        <ShowScreen
          language={language}
          english={rows[open].english}
          entry={rows[open].entry}
          position={{ index: open, total: rows.length }}
          onMove={(next) => setOpen(next)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/**
 * "Show to someone": one phrase, as big as it goes, black on white whatever the
 * Mountain theme is. The colours are written out rather than taken from tokens
 * because this is the one screen a stranger reads, in daylight, at arm's length.
 */
function ShowScreen({
  language,
  english,
  entry,
  position,
  onMove,
  onClose,
}: {
  language: PhraseLanguage;
  english: string;
  entry: PhraseEntry;
  position: { index: number; total: number };
  onMove: (index: number) => void;
  onClose: () => void;
}) {
  const { index, total } = position;

  const move = useCallback(
    (step: number) => {
      const next = index + step;
      if (next >= 0 && next < total) onMove(next);
    },
    [index, total, onMove],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, onClose]);

  const button = {
    minHeight: 72,
    color: "#000",
    border: "1px solid #000",
    borderRadius: 999,
  } as const;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${english} in ${language.name}`}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: "#fff", color: "#000" }}
    >
      <div className="flex-1 px-6 pb-4 pt-10">
        <p style={{ color: "#444" }} className="m-text-body">
          {english}
        </p>
        <p
          lang={language.code}
          className="mt-4 text-[calc(40px*var(--mountain-text-scale,1))] font-medium leading-tight"
        >
          {entry.text}
        </p>
        {entry.say && (
          <p
            style={{ color: "#333" }}
            className="mt-4 text-[calc(24px*var(--mountain-text-scale,1))] leading-snug"
          >
            {entry.say}
          </p>
        )}
        {entry.means && (
          <p style={{ color: "#444" }} className="mt-3 m-text-body leading-snug">
            Says: {entry.means}
          </p>
        )}
        <p style={{ color: "#555" }} className="mt-6 text-[15px]">
          {DRAFT_LABEL}
        </p>
      </div>

      <div className="flex items-stretch gap-3 px-6 pb-8 pt-2">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={index === 0}
          style={{ ...button, opacity: index === 0 ? 0.3 : 1 }}
          className="flex w-20 shrink-0 items-center justify-center text-[22px]"
          aria-label="Previous phrase"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ ...button, background: "#000", color: "#fff" }}
          className="flex flex-1 items-center justify-center text-[19px] font-medium"
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={index === total - 1}
          style={{ ...button, opacity: index === total - 1 ? 0.3 : 1 }}
          className="flex w-20 shrink-0 items-center justify-center text-[22px]"
          aria-label="Next phrase"
        >
          ›
        </button>
      </div>
    </div>
  );
}
