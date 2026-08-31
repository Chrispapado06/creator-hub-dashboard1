import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card } from "@/components/ui/primitives";
import { Field, Notice, inputClass } from "@/components/guide";
import { PersonAvatar, Photo } from "@/components/Photo";
import { saveProfile } from "@/data/listingStore";
import { listing, seedListing } from "@/domain/listing";
import { PEAKS } from "@/data/peaks";
import { cn } from "@/lib/utils";

const BIO_MAX = 400;

/**
 * EDIT PROFILE — how a climber sees this guide, written by the guide.
 *
 * IT SAVES. A form that forgets on reload is a control that writes into nothing,
 * and this is the screen where a guide composes the sentence somebody reads
 * before deciding to follow them onto a glacier. Persisted to this device; the
 * screen says plainly that saved is not published.
 *
 * THE HEADER PHOTOGRAPH IS CHOSEN FROM THE CATALOGUE, not uploaded. There is no
 * media store in this app and no licensed portrait set — so a guide picks a peak
 * they guide, from the credited library, rather than this screen pretending to
 * accept a file it would have to discard.
 */
export default function EditProfile() {
  const navigate = useNavigate();
  const seed = seedListing();
  const current = listing().profile;

  const [name, setName] = useState(current?.name ?? "");
  const [title, setTitle] = useState(current?.title ?? "");
  const [nationality, setNationality] = useState(current?.nationality ?? "");
  const [basedIn, setBasedIn] = useState(current?.basedIn ?? "");
  const [languages, setLanguages] = useState((current?.languages ?? []).join(", "));
  const [years, setYears] = useState(String(current?.yearsGuiding ?? ""));
  const [bio, setBio] = useState(current?.bio ?? "");
  const [heroPeak, setHeroPeak] = useState(current?.heroPeak ?? "everest");
  const [touched, setTouched] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!current) {
    return (
      <Screen>
        <Stagger>
          <Rise className="pt-7">
            <Link to="/profile" className="inline-flex items-center gap-1 text-[12.5px] text-mist">
              <ChevronLeft size={16} strokeWidth={1.7} /> Profile
            </Link>
            <Card className="mt-5">
              <p className="text-[12.5px] text-mist">There is no profile on this device to edit.</p>
            </Card>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  const problems = [
    !name.trim() && "your name",
    !bio.trim() && "a short description of what you guide",
    !basedIn.trim() && "where you work from",
  ].filter((x): x is string => typeof x === "string");

  const save = () => {
    setTouched(true);
    if (problems.length > 0) return;
    const ok = saveProfile(
      {
        name: name.trim(),
        title: title.trim(),
        nationality: nationality.trim(),
        basedIn: basedIn.trim(),
        languages: languages.split(",").map((l) => l.trim()).filter(Boolean),
        yearsGuiding: Number(years) || 0,
        bio: bio.trim(),
        heroPeak,
      },
      seed,
    );
    setFailed(!ok);
    if (ok) navigate("/profile");
  };

  return (
    <Screen>
      <Stagger>
        <Rise className="flex items-center justify-between pb-4 pt-7">
          <Link to="/profile" aria-label="Back" className="-ml-1 text-mist">
            <ChevronLeft size={22} strokeWidth={1.7} />
          </Link>
          <h1 className="text-[16px] text-snow">Edit profile</h1>
          <button type="button" onClick={save} className="text-[13px] font-medium text-azure">
            Save
          </button>
        </Rise>

        <Rise className="flex justify-center pt-1">
          <PersonAvatar name={name || "Guide"} size={88} />
        </Rise>

        <Rise className="pt-6">
          <p className="section-label">Header photograph</p>
          <p className="mt-1 text-[11.5px] text-mist-dim">
            A peak you guide. Chosen from ICEFALL's credited library.
          </p>
          <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto">
            {PEAKS.slice(0, 14).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setHeroPeak(p.id)}
                aria-pressed={heroPeak === p.id}
                className="w-[78px] shrink-0"
              >
                <Photo
                  peak={p.id}
                  alt={p.name}
                  className={cn(
                    "h-[54px] w-full",
                    heroPeak === p.id && "ring-2 ring-azure",
                  )}
                />
                <span className="mt-1 block text-center text-[10px] leading-tight text-mist-dim">
                  {p.name}
                </span>
              </button>
            ))}
          </div>
        </Rise>

        <Rise className="pt-6">
          <p className="section-label">About you</p>
          <Card className="mt-3">
            <div className="space-y-4">
              <Field label="Full name">
                <input value={name} onChange={(e) => setName(e.target.value)} className={cn(inputClass, touched && !name.trim() && "border-danger")} />
              </Field>
              <Field label="Title" hint="The qualification you work under.">
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nationality">
                  <input value={nationality} onChange={(e) => setNationality(e.target.value)} className={inputClass} />
                </Field>
                <Field label="Years guiding">
                  <input
                    value={years}
                    onChange={(e) => setYears(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Where you work from" hint="A town or valley — not your home address.">
                <input value={basedIn} onChange={(e) => setBasedIn(e.target.value)} className={cn(inputClass, touched && !basedIn.trim() && "border-danger")} />
              </Field>
              <Field label="Languages" hint="Separated by commas.">
                <input value={languages} onChange={(e) => setLanguages(e.target.value)} className={inputClass} />
              </Field>
              <Field
                label="About you"
                hint={`${bio.length}/${BIO_MAX}. The first thing a climber reads.`}
              >
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                  rows={5}
                  className={cn(inputClass, "resize-none", touched && !bio.trim() && "border-danger")}
                />
              </Field>
            </div>
          </Card>
        </Rise>

        {touched && problems.length > 0 && (
          <Rise className="pt-3">
            <Notice tone="danger">
              <p className="text-snow">Not saved yet</p>
              <p className="mt-1.5">Still needed: {problems.join(", ")}.</p>
            </Notice>
          </Rise>
        )}

        {failed && (
          <Rise className="pt-3">
            <Notice tone="danger">That did not save — this device is refusing to store it.</Notice>
          </Rise>
        )}

        <Rise className="pb-2 pt-4">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Saved on this phone. Your qualifications are not edited here — they are what you sent us
            and what a member of ICEFALL staff read.
          </p>
        </Rise>
      </Stagger>
    </Screen>
  );
}
