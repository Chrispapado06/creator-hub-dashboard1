/* ==========================================================================
 * THREE answers from the signup flow: a gender, a sex at birth, and where the
 * person heard about ICEFALL.
 *
 * THE FILENAME SAYS TWO OF THE THREE, AND IT WAS NOT RENAMED. `sex_at_birth`
 * (section 1B) was added on 2026-09-03, after this file had already been
 * written, reviewed and queued as the one migration pending against the live
 * database. Renaming it was considered and rejected: the version Supabase
 * records is the timestamp `20260903040000`, so a rename is safe to the
 * server and dangerous to the humans — this is the file the owner pushes, it
 * is referred to by name in the session notes and in `settings/sync.ts`, and
 * a slug that quietly changes underneath all of that buys nothing but a
 * tidier name. So the name is stale by one column and this paragraph is the
 * correction. If you are looking for where sex at birth is defined, it is
 * section 1B of this file, immediately after gender, on purpose.
 *
 * WHY THIS EXISTS. The owner asked for these questions to be added to the
 * onboarding flow. Onboarding's own rule is that a question earns its screen
 * only if the answer changes what ICEFALL does. Gender does not, and where
 * somebody heard about ICEFALL does not — so the flow has to say so on those
 * two screens. Sex at birth DOES: it is the sex term of a published
 * resting-energy equation, and supplying it narrows the athlete's daily energy
 * estimate, which is the only thing its screen may claim. That is all this file
 * is: three places to put three answers, plus the vocabulary that keeps the
 * last one countable.
 *
 * THE 166 kcal FIGURE HAS BEEN REMOVED FROM EVERY SCREEN AND FROM THIS FILE'S
 * CLAIMS, 2026-09-03. It is a real constant — the gap between Mifflin-St Jeor's
 * two sex intercepts, +5 and -161 — but it is a property of the RESTING term,
 * not the width the daily estimate loses. The client widens the resting band by
 * ±10% for individual variation and then multiplies it by an activity range, so
 * the width an answer removes is a different figure again.
 *
 * "50 to 600 kcal" WAS WRITTEN HERE AS THE CORRECTION AND WAS ITSELF WRONG, so
 * what follows names the domain each figure was measured on. Re-measured the
 * same day by running the client's own `narrowingWorth` over every combination
 * the app accepts, stepping 1 kg / 1 cm / 1 year:
 *
 *   - height and birth year also given, which is the ordinary case because
 *     signup asks for both: 200 kcal, or 250 ONLY when everyday movement is
 *     answered `physical`. `seated` and `on-feet` both leave it at 200, the
 *     same as never answering, so two of that question's three answers move
 *     this figure not at all. Flat at those two figures across the whole
 *     accepted body — 30-250 kg, 100-250 cm, ages 10-100.
 *   - height declined, birth year given, adult of 45-120 kg, ages 18-100:
 *     50 to 600 kcal — but 600 needs `physical`, and movement is unanswered
 *     throughout signup, so the common case there is 50 to 500.
 *   - across everything the app will do arithmetic with: 50 to 1,450 kcal, and
 *     worth nothing at all for the lightest, oldest athletes who declined a
 *     height.
 *
 * The old range understated the ceiling by more than half and described nobody's
 * ordinary case. The client computes each athlete's own figure and shows it on
 * the fuel screen. Section 1B below is corrected in the same way; if you are
 * reading this file for THE number, there isn't one — there is a figure per
 * athlete, and a range only ever means something with its domain attached.
 *
 * GENDER AND SEX ARE TWO COLUMNS AND MUST STAY TWO COLUMNS. The reasoning is
 * in section 1B and it is the most important thing in this file.
 *
 * ── THE DECISION THAT DOMINATES THIS FILE ─────────────────────────────────
 *
 * THE BRIEF SAID `public.profiles`. THEY GO ON `public.athlete_profiles`.
 * That is not a preference and it is not tidiness. `profiles_select` is
 * readable by every signed-in account — `using (true)` today, and after
 * 20260903010000 it is `own row / staff / not blocked`, which is still every
 * account that has not blocked you. A column added to that table is published
 * to the platform, and nothing about typing `add column` prompts anybody to
 * re-read the policy that already governs it. The constitution has a name for
 * that — §6ar addendum, "a column added after a POLICY" — and its check is
 * one sentence: if the table's SELECT policy is `using (true)` and the column
 * is not something you would print on the person's public profile, the column
 * is in the wrong table.
 *
 * Where somebody heard about ICEFALL is ICEFALL's business data. It is not
 * part of anybody's profile, no screen shows it, and there is no version of
 * this product where a stranger opening your profile learns that you arrived
 * from a Reddit thread. A gender fails the same test for the plainer reason
 * that ICEFALL does not print it anywhere — there is no field for it on the
 * profile, no toggle controlling it, and 20260903020000 has already recorded
 * that the app's `profileVisibility` setting has NO policy behind it. Putting
 * it on `profiles` would publish it to every account on the platform in order
 * to serve a feature that does not exist.
 *
 * WHY THE OBVIOUS REMEDY DOES NOT WORK, MEASURED RATHER THAN ASSUMED. The
 * §6ar addendum floats a fix: keep the column on `profiles` and add a
 * column-level `revoke ... from authenticated`, since column privileges
 * compose with RLS rather than being replaced by it. That is true in general
 * and it is unusable HERE, and the addendum itself flags the question as
 * unchecked. It is now checked. Run against PGlite, on a table shaped like
 * this one, with `revoke select on profiles from authenticated` followed by
 * `grant select (id, display_name)`:
 *
 *     select display_name from profiles           -> OK
 *     select follower_count(p) from profiles p    -> 42501 permission denied
 *     select p from profiles p                    -> 42501 permission denied
 *     select * from profiles                      -> 42501 permission denied
 *     update ... returning heard_about            -> 42501 permission denied
 *
 * A whole-row reference needs SELECT on the WHOLE table, so the moment one
 * column is revoked every PostgREST computed field over `profiles` dies for
 * everybody. There are six of them: `identity_verified`, `app_owner`,
 * `follower_count`, `following_count`, `summit_count`, `highest_summit_m`.
 * `select=*` dies with them, and so does the read-back on a write — which is
 * this project's whole method for never claiming a save that did not happen.
 *
 * And it would not even achieve the goal. Column privileges are granted to
 * ROLES, and every signed-in person on this platform is the same role,
 * `authenticated`. "Staff may read this and other athletes may not" is a
 * statement about a ROW (`is_admin()` reads a table), so no arrangement of
 * column grants can express it. Revoking would hide the column from its own
 * author and from admins as well, and hand back 42501 — which `pgErrors.ts`
 * classifies as NOT-ALLOWED, so the app would tell a person they lack
 * permission to read an answer they just gave.
 *
 * `athlete_profiles` needs none of that. It exists for exactly this reason and
 * says so: "Separate from profiles because profiles_select is using(true) —
 * body mass and birth year on that table would be readable by every account on
 * the platform." Its SELECT policy is already `id = auth.uid() or is_admin()`.
 * Both columns are private by construction, with no new policy, no new grant
 * and nothing for a future reader to keep in step.
 *
 * ── WHAT THIS FILE DOES NOT DO, SAID FIRST SO NOBODY READS IT AS DONE ─────
 *
 * NOTHING WRITES THESE COLUMNS. `syncOnboarding` in
 * `icefall-app/src/auth/account.ts` upserts five fields — id, experience,
 * answers, answers_version, onboarded_at — and none of them is either of
 * these. Until that function is extended, both columns hold NULL for every
 * account, and NULL here means "never asked", so a tally read tomorrow would
 * correctly report that nobody has answered.
 *
 * That is not a hypothetical. `body_mass_kg`, `height_cm`, `birth_year`,
 * `typical_session_min`, `training_days` and `max_altitude_m` are typed
 * columns on this same table, added by 20260830100000, with sanity CHECKs on
 * every one of them, and NOTHING IN THE APP HAS EVER WRITTEN A SINGLE ONE.
 * The values live in the `answers` blob instead. Six columns that have held
 * NULL since the day they were created, with nothing anywhere saying so — and
 * anybody who queried them would have read an empty table as a fact about
 * athletes rather than a fact about the client. These two columns join that
 * list the moment this migration is pushed, and they leave it only when the
 * client half ships. Whoever pushes this should expect an empty tally and not
 * go looking for a bug.
 *
 * IF THE CLIENT HALF SHIPS FIRST, the write fails PGRST204 and
 * `classifyBackendError` calls it "not-provisioned", which is correct and
 * which the signup screen must render as "there is nowhere to keep this yet",
 * never as a save. There is no outbox on this path: `syncOnboarding`'s catch
 * block is empty by design, so a failed send is simply a lost answer. Any copy
 * promising that the answer "will be sent later" would be false.
 *
 * ── ORDER ─────────────────────────────────────────────────────────────────
 *
 * HARD DEPENDENCY: 20260830100000, which creates `athlete_profiles`. Applied
 * before it this file fails at the first `alter table` with 42P01 and takes
 * nothing with it. 20260817120000 supplies `is_admin()` and
 * `touch_updated_at()`.
 *
 * INDEPENDENT OF THE SIX PENDING MIGRATIONS, BOTH WAYS, and that is worth
 * stating because it is the useful fact for whoever is deciding what to push.
 * This file never updates `profiles`, so it does not go near the 42P17
 * recursion that 20260903010000 introduces and 20260903020000 §0 repairs. It
 * can be pushed on its own, before them or after them, and it neither needs
 * nor unblocks any of them.
 *
 * THE ORDERING THAT WOULD ACTUALLY HURT IS NOT A FILE ORDER. If a later
 * migration moves either column onto `public.profiles` — because somebody
 * wants a gender on the profile card, which is a reasonable thing to want —
 * the disclosure changes silently for every person who already answered under
 * this file's promise. That is a re-consent problem, not a column move. See
 * the note at the foot of section 1.
 * ========================================================================== */

/* ========================================================================== */
/* 1. GENDER                                                                  */
/* ========================================================================== */

alter table public.athlete_profiles add column if not exists gender text;

/*
 * ── HOW "PREFER NOT TO SAY" IS STORED, WHICH IS THE WHOLE DESIGN ──────────
 *
 * IT IS A VALUE IN THIS COLUMN. It is not NULL, and it is not a boolean
 * sitting beside a NULL. NULL means one thing only: this person was never
 * asked. Every other state is a string they chose.
 *
 *     'woman' / 'man' / 'non-binary'  the answer they gave
 *     'prefer-not-to-say'             the answer they gave
 *     NULL                            never asked — no answer exists
 *
 * WHY NOT `gender_declined boolean`, which is what the app does in its local
 * blob (`heightDeclined`, `birthYearDeclined`) and is the obvious first draft:
 *
 *  · The screen offers "Prefer not to say" as a fourth option in the same
 *    visual weight as the other three. It is an ANSWER, given by a person who
 *    read the question and decided. The database should store the answer that
 *    was given, in the place answers are stored, and not re-describe it as an
 *    absence with a footnote.
 *  · A footnote gets missed. With a boolean, every reader has to remember to
 *    check a second column, and the first one that forgets renders an em dash
 *    for somebody who answered. In this app an em dash means NOT MEASURED,
 *    so that is not a cosmetic slip — it is the screen saying "we do not know"
 *    about a person who told us. One column with one representation cannot be
 *    read wrongly by somebody who has never seen this comment.
 *  · A boolean admits a state that means nothing: `gender = 'woman'` AND
 *    `gender_declined = true`. Forbidding it costs another CHECK, and the
 *    CHECK is only there to rule out a shape the sentinel cannot form.
 *  · `group by gender` then answers the real question in one pass, with people
 *    who declined visible as their own bar rather than mixed in with people
 *    who were never asked. Those are different facts about ICEFALL and they
 *    must not be summed.
 *
 * The app's boolean flags are not a precedent against this. They exist because
 * localStorage holds an untyped blob where a sentinel cannot be constrained
 * and a typo would be silent. A column with a CHECK has neither problem.
 *
 * ── A CHECK, NOT A LOOKUP TABLE — THE ASYMMETRY WITH SECTION 2 IS MEANT ───
 *
 * Section 2 gives the acquisition channels their own table because that list
 * WILL grow, and adding a channel should be one INSERT. This list should not
 * grow that way. Four words that name how a person describes themselves are
 * product copy, and copy that appears in a signup flow needs somebody to read
 * it, translate it and decide it is right — not an INSERT typed into a
 * dashboard at midnight. A CHECK puts the four values in the schema where a
 * reviewer sees them and makes a fifth a deliberate, reviewed act.
 *
 * The values are slugs, not labels, for the reason 20260903020000 gave about
 * languages: a stored display string is a stored spelling, and it renders in
 * the writer's language rather than the reader's. The words a person actually
 * sees live in the client.
 *
 * THE COST OF A CLOSED LIST, STATED AS A COST. Somebody whose answer is none
 * of these four has "prefer not to say" as their only truthful option, which
 * is not the same as being asked and answered. That is a real limit of a
 * closed list and it is recorded here rather than glossed. It is not solved by
 * adding a free-text box: a self-described gender is a sentence about a person
 * that nothing in ICEFALL reads, and collecting prose nobody reads is the
 * thing this schema refuses everywhere else.
 *
 * ── AND THE PART THAT MATTERS MORE THAN THE STORAGE ───────────────────────
 *
 * NOTHING IN ICEFALL READS THIS COLUMN. It is not an input to the calorie
 * estimate — `kcalFor(met, massKg, seconds)` takes body mass and nothing else
 * — and it is not an input to anything else either. If a resting-energy
 * equation is ever built, the term it needs is SEX ASSIGNED AT BIRTH, which is
 * a different question with a different answer, and quietly reading this
 * column as though it were that one would be the exact substitution this
 * project exists to refuse. `fuelDay.ts` already says so about its own `Sex`
 * type: "It is not a profile field, it is not shown to anyone, and nothing
 * else in the app branches on it."
 *
 * So the signup screen must say the column is recorded and unused, and the
 * payoff screen must say the answer changed nothing. There is deliberately no
 * reporting function for this column in section 4 — building a reader for it
 * would be building the use this comment says does not exist.
 *
 * IF IT IS EVER SHOWN, IT IS A NEW CONSENT, NOT A COLUMN MOVE. Everybody who
 * answers under this file answered a private question. Copying the value onto
 * `profiles` later would publish an answer given on different terms, so a
 * future migration must ship an opt-in and start it at OFF for every existing
 * row, rather than treating consent as something the schema can infer.
 */
alter table public.athlete_profiles drop constraint if exists athlete_profiles_gender_known;
alter table public.athlete_profiles add constraint athlete_profiles_gender_known check (
  gender is null or gender in ('woman', 'man', 'non-binary', 'prefer-not-to-say')
);

comment on column public.athlete_profiles.gender is
  'Self-reported, private to its owner and admins — never on public.profiles, which '
  'every signed-in account can read. ''prefer-not-to-say'' is a REAL ANSWER stored in '
  'this column; NULL means the person was never asked, and the two must never be '
  'collapsed. Read by nothing in ICEFALL. It is NOT sex assigned at birth and must '
  'never be used as the term in a resting-energy equation.';

/* ========================================================================== */
/* 1B. SEX AT BIRTH — a DIFFERENT question, and the only one here that is read */
/* ========================================================================== */

/*
 * ── READ SECTION 1 FIRST. THIS IS NOT A SECOND SPELLING OF IT. ────────────
 *
 * The owner was asked to choose between asking gender alone and asking both,
 * was told exactly what the second question buys, and chose both. So there are
 * two columns, two questions on two screens, and two explanations. They are
 * adjacent in this file on purpose: the next person to read it should meet
 * them together and see that the difference was deliberate, rather than find
 * one of them six months later and "tidy up the duplicate".
 *
 * GENDER IS IDENTITY. SEX IS A TERM IN AN EQUATION. That sentence is the whole
 * design and it is the reason merging them would be a real harm rather than an
 * inelegance. Mifflin-St Jeor's sex term is a constant: +5 kcal for male,
 * -161 kcal for female. A woman may need the male figure out of that equation,
 * and a man may need the female one. Collapsing the two columns hands her the
 * wrong number — and hands it to her SILENTLY, with no screen anywhere saying
 * which term was used. A wrong number that announces itself is a bug; a wrong
 * number that does not is the failure this project's doctrine exists to
 * prevent.
 *
 * So: `gender` is read by nothing, and section 1 says so at length. The ANSWER
 * in `sex_at_birth` serves exactly one purpose, the resting-energy estimate,
 * and no other ever. Neither column may be substituted for the other, in a
 * query, a view, a backfill or a report.
 *
 * ── WHAT READS THIS COLUMN TODAY: NOTHING. SAID PLAINLY, BECAUSE IT MATTERS ─
 *
 * This column is WRITE-ONLY in the current client, and an earlier draft of this
 * comment claimed otherwise. The estimate is computed on the device, from the
 * device's own `icefall.fuel.v1` record, which the signup flow seeds with the
 * same answer at the moment it is given (`AppState.completeOnboarding` ->
 * `coach/fuelRecord.ts`). Nothing fetches this column back. It is written for
 * durability: sign-in on a second device restores the `answers` blob and seeds
 * that device's record the same way, so the answer outlives one phone.
 *
 * If a future reader ever does query it, it goes through the same collapse —
 * `sexTermFor` in `state/AppState.tsx`, the one place four states become two —
 * or the two readers will disagree about what a decline means.
 *
 * ── WHAT IT IS WORTH, STATED AS THE ONLY THING IT IS WORTH ────────────────
 *
 * A narrower daily energy estimate, and that is the entire measurable benefit.
 *
 * `coach/fuelDay.ts` already handles both states. When it holds no sex it
 * evaluates the published equation at BOTH values and reports the span, and it
 * says so on the screen in words: "It spans both values of the equation's sex
 * term, because ICEFALL doesn't hold one." When a real value arrives it
 * evaluates at that value alone and the band narrows. Nothing else changes. No
 * new screen, no new feature, no new advice. The copy on the signup step may
 * claim that and may claim nothing more.
 *
 * IT MAY NOT CLAIM A FIGURE. See the header: 166 kcal is the resting term's
 * intercept gap, not the width the day loses, and the real width depends on the
 * athlete's weight and on whether they also gave a height and a birth year.
 * The header's replacement figure — "50 to 600 kcal" — was wrong as well, and
 * the measurement is set out there with the domain each number belongs to: 200
 * to 250 kcal for somebody who also gave a height and a birth year, 50 to 1,450
 * once those may be declined. Neither belongs in copy without its domain, which
 * is the mistake this paragraph has now made twice. Only the fuel screen may
 * print a number here, because only it knows whose body it is describing.
 *
 * IT IS NOT A BODY-COMPOSITION FIELD AND NOTHING MAY FRAME IT AS ONE.
 * `coach/nutrition.ts` is explicit that ICEFALL sets no weight target and no
 * body-composition target, and that one sentence is the reason the fuel screen
 * is not another calorie app. This column does not weaken it. No migration, no
 * view and no screen built on this column may mention weight loss, body fat,
 * leanness, or a target of any kind. If somebody ever wants one, that is a
 * product decision that has to be argued on its own and not smuggled in on the
 * back of a metabolic constant.
 *
 * ── THE VALUES, AND THE TWO REQUIREMENTS THEY HAVE TO SATISFY AT ONCE ─────
 *
 *     'female'             the answer they gave — the equation's female term
 *     'male'               the answer they gave — the equation's male term
 *     'prefer-not-to-say'  the answer they gave — they read it and declined
 *     NULL                 never asked — no answer exists
 *
 * REQUIREMENT ONE: declined and never-asked must both resolve to `undefined`
 * at the TypeScript boundary. `fuelDay.ts` types this as
 * `Sex = "female" | "male"`, with `undefined` meaning unknown-or-declined, and
 * it treats that as its default path — spanning both terms rather than picking
 * one. Anything else would be ICEFALL guessing somebody's metabolism.
 *
 * REQUIREMENT TWO: declined and never-asked must stay DISTINGUISHABLE in the
 * database. They are different facts about ICEFALL. "Four hundred people were
 * asked and eleven declined" and "four hundred people were never asked" are
 * not the same sentence, and a schema that cannot tell them apart cannot ever
 * answer which of the two it is looking at.
 *
 * BOTH AT ONCE IS WHY THE THIRD VALUE IS A STRING IN THIS COLUMN AND NOT A
 * NULL. The database keeps three distinguishable states; the client collapses
 * two of them on the way out, in one place, where the collapse is visible:
 *
 *     'female' | 'male'  ->  itself, unchanged
 *     'prefer-not-to-say' | null | anything else  ->  undefined
 *
 * The first two stored strings are BYTE-IDENTICAL to the two members of the
 * TypeScript union, which is the point: there is no lookup table, no mapping
 * object and no place for a translation to drift. The narrowing is a single
 * comparison, it lives in `state/AppState.tsx` beside the type, and it fails
 * CLOSED — an unrecognised value becomes `undefined` and widens the band,
 * which is the answer that never invents anything.
 *
 * That asymmetry — three states stored, two exposed — is deliberate and it is
 * the only correct shape. Storing only two and using NULL for "declined"
 * would satisfy the type boundary and destroy the fact. Exposing all three to
 * the equation would mean `fuelDay.ts` having to know what a decline is,
 * which is the one thing its `undefined` already says perfectly.
 *
 * ── WHY NOT A BOOLEAN BESIDE IT, AND WHY NOT AN ENUM ──────────────────────
 *
 * Both were rejected for the reasons section 1 gives at length about `gender`
 * and they are not repeated here — see the `gender_declined boolean` argument
 * above, which applies word for word. The short version: a footnote gets
 * missed, and in this app a missed footnote renders an em dash, which means
 * NOT MEASURED, about somebody who told us.
 *
 * The list is a CHECK rather than a lookup table for the same reason gender's
 * is: three values that name a term in a published equation are not a
 * vocabulary that grows. It cannot grow. Mifflin-St Jeor has two terms.
 *
 * ── PRIVACY, WHICH IS THE SAME ANSWER AS SECTION 1 AND FOR MORE REASON ────
 *
 * `public.athlete_profiles`, never `public.profiles`. `profiles_select` is
 * readable by every signed-in account on the platform, and this is the single
 * most sensitive field ICEFALL has ever stored about a person. It is private
 * to its owner and to admins by the policies already on this table
 * (`id = auth.uid() or public.is_admin()`), so no new policy is written here
 * and there is none for a future reader to keep in step.
 *
 * NO READER IS BUILT FOR IT IN SECTION 4. `heard_about_tally()` exists because
 * a marketing question has an aggregate answer. There is no equivalent for
 * this column and there must not be one: a count of sexes answers no question
 * ICEFALL has, and the function would exist only because it was easy to write.
 * The single consumer is the client, reading the person's OWN row for their
 * OWN energy estimate.
 *
 * IF IT IS EVER SHOWN OR COUNTED, IT IS A NEW CONSENT. Everybody who answers
 * under this file answered a question that was explained to them as one
 * constant in one equation on their own screen. Any later use is a different
 * promise and needs a fresh opt-in starting at OFF, not a column move.
 */
alter table public.athlete_profiles add column if not exists sex_at_birth text;

alter table public.athlete_profiles drop constraint if exists athlete_profiles_sex_at_birth_known;
alter table public.athlete_profiles add constraint athlete_profiles_sex_at_birth_known check (
  sex_at_birth is null or sex_at_birth in ('female', 'male', 'prefer-not-to-say')
);

comment on column public.athlete_profiles.sex_at_birth is
  'Sex assigned at birth. A DIFFERENT QUESTION FROM gender and never a substitute for '
  'it — gender is identity, this is the sex term of the Mifflin-St Jeor resting-energy '
  'equation and nothing else. WRITE-ONLY TODAY: no client query reads this column back. '
  'The athlete''s daily energy estimate is computed on their device from a local copy of '
  'the same answer, seeded at signup; this column is the durable copy, so the answer '
  'survives onto a second device with the answers blob. Serves exactly one purpose, that '
  'estimate, and never any other. No fixed kcal figure may be quoted for it: the width '
  'an answer removes depends on the athlete''s own numbers and the fuel screen computes '
  'it. '
  '''prefer-not-to-say'' is a REAL ANSWER stored here; NULL means never asked. The two '
  'are separate in this column ON PURPOSE and both resolve to undefined in the client, '
  'so the estimate spans both terms rather than guessing. Private to its owner and '
  'admins — never on public.profiles, which every signed-in account can read. NOT a '
  'body-composition field: nothing built on it may set a weight or a leanness target.';

/* ========================================================================== */
/* 2. THE CHANNEL VOCABULARY                                                  */
/* ========================================================================== */

/*
 * ── CONSTRAINED, NOT FREE TEXT, AND THE OWNER IS WHO PAYS FOR THE CHOICE ──
 *
 * The only reason this question exists is that one person is going to read the
 * answers and decide where to spend their time. Free text cannot answer that.
 * "Instagram", "instagram", "IG", "insta", "instgram", "a friend sent me an
 * instagram reel" are six rows and one channel, and no `group by` in the world
 * reunites them. The failure is worse than useless because it is quiet: the
 * report renders, the bars have heights, and the biggest real channel is
 * spread across a long tail that reads like noise. A number that is confidently
 * wrong is the thing this codebase is most careful about.
 *
 * A TABLE, NOT AN ENUM. Two reasons, and the second is fatal to the enum:
 *  · The list will grow. A new channel should be one INSERT, not a type
 *    migration that rewrites `athlete_profiles`. Same reasoning
 *    `interest_tags` and `reserved_usernames` both give.
 *  · `alter type ... add value` CANNOT be used in the same transaction that
 *    then writes the new value, and Supabase runs each migration file in one
 *    transaction. 20260902250000 hit exactly this and wrote it down. An enum
 *    would make "add a channel and seed it" impossible in a single file.
 *
 * A REAL FOREIGN KEY, WHICH `interests` COULD NOT HAVE. That column is an
 * array, so its membership rule needs a trigger — a CHECK cannot reference
 * another table. This one is a scalar, so an ordinary FK does the job against
 * every write path including the service role, with no trigger to maintain and
 * no chance of the two drifting.
 *
 * NO FREE-TEXT SIBLING COLUMN, and this is the decision most likely to be
 * revisited, so here is the reasoning rather than just the outcome. The usual
 * shape is "Somewhere else: ______". It is declined because the box collects
 * exactly the data the closed list was chosen to avoid — unbounded, unspellable,
 * multilingual prose — and it collects it from the people whose answers are
 * hardest to read. What is lost is real and is named: if forty per cent of
 * answers come back `somewhere-else`, ICEFALL learns that its list is wrong and
 * not what the missing channel is. That is the correct signal to act on, and
 * acting on it is one INSERT here plus one option in the picker.
 */
create table if not exists public.heard_about_channels (
  slug text primary key
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),

  /*
   * The words the picker must show. Held here rather than only in the client
   * so the owner reading a tally reads the same sentence the athlete read —
   * if the two drift, the report is labelled with a different question from
   * the one that was asked, and nobody would notice.
   */
  label text not null check (length(btrim(label)) between 1 and 60),

  sort_order integer not null default 100,

  /*
   * WHETHER THIS ANSWER NAMES A PLACE ICEFALL COULD SPEND TIME ON.
   *
   * `somewhere-else`, `dont-remember` and `prefer-not-to-say` are all real,
   * honest answers and all three are false here. The distinction exists so
   * that "of the people who named a place, X% said Instagram" can be computed
   * without silently dropping those three from the denominator as well —
   * which is how a channel ends up looking twice as effective as it was.
   * A reader looking at labels would never mistake "I don't remember" for a
   * marketing channel. A query would, so the fact is stored rather than left
   * to be noticed.
   */
  is_channel boolean not null default true,

  /*
   * RETIRED RATHER THAN DELETED, meaning "stop offering it in the picker".
   * Unlike `interest_tags`, existing rows are protected by the foreign key
   * rather than by this convention: the delete is REFUSED by the database, not
   * merely discouraged by a comment. This flag is the supported way to take an
   * option off the screen without touching the answers people already gave.
   */
  retired boolean not null default false
);

/*
 * ── THE LIST, AND WHY EACH ENTRY IS ON IT ─────────────────────────────────
 *
 * `friend` FIRST AND KEPT SEPARATE FROM `guide-or-operator`. Word of mouth is
 * the largest real channel for a niche training app and there is no other way
 * it will ever appear in the data. But an athlete who arrived through a guide,
 * a club or an expedition company is a commercially different event from one
 * who arrived through a climbing partner — ICEFALL has an operator side and a
 * guides app — and collapsing them into "word of mouth" would destroy the one
 * distinction that would change what ICEFALL does next.
 *
 * `instagram`, `youtube`, `tiktok`, `reddit` AS FOUR ENTRIES, NOT ONE "social
 * media". They are four audiences and four different amounts of work, and a
 * single "social media" bar answers no question anybody would ask. YouTube is
 * listed on its own merits rather than by analogy: long-form expedition and
 * training video is a genuine discovery route for this audience specifically.
 * Reddit is cheap to offer and r/Mountaineering and r/alpinism are real.
 *
 * `search` IS "A SEARCH ENGINE", NOT "GOOGLE". Somebody who found the app by
 * searching may have used Bing, DuckDuckGo or whatever Safari defaults to.
 * Naming Google would be recording which engine they used, which nobody asked
 * them, and would leave a second "other search engine" option nobody picks.
 *
 * `article` COVERS A BLOG, A FORUM AND A NEWS PIECE, kept apart from `search`
 * because they are different things to do about it: one is earned coverage,
 * the other is being findable.
 *
 * `podcast` because mountaineering and endurance podcasts are a well-used
 * route into this audience and would otherwise disappear into `somewhere-else`.
 *
 * ── THE THREE THAT ARE ANSWERS BUT NOT CHANNELS ───────────────────────────
 *
 * `somewhere-else`  they remember, and it is not on the list.
 * `dont-remember`   they tried and could not recall. Most people genuinely
 *                   cannot, and a list without this option manufactures a
 *                   false answer from every one of them. It is a real answer
 *                   in the same way "never been high enough to know" is a real
 *                   answer on the altitude question.
 * `prefer-not-to-say` they read the question and declined to answer ICEFALL.
 *
 * All three are DIFFERENT FACTS and none of them is NULL. Collapsing any two
 * loses something ICEFALL was told. See section 3 for the fourth state.
 *
 * ── WHAT IS DELIBERATELY ABSENT, AND THE RULE UNDERNEATH IT ───────────────
 *
 * An option is dishonest to offer when ICEFALL has no presence on that
 * channel, because then the option is not measuring where people came from —
 * it is inviting them to guess, and every guess reads afterwards as a channel
 * that worked. Each of these is one INSERT away on the day the fact changes:
 *
 *  · THE APP STORE. `icefall-app` is a web build; there is no Capacitor in
 *    package.json and no store listing exists. Offering a place ICEFALL cannot
 *    be found returns pure noise from people picking the nearest familiar
 *    thing.
 *  · STRAVA, FACEBOOK, X. Offer each only if ICEFALL actually posts there. If
 *    it does not, a real "Strava" answer is somebody's friend's post, which
 *    `friend` already covers, and the entry would report a marketing success
 *    ICEFALL never had.
 *  · AN AD, A SPONSORED POST. No ad account exists and nothing is running.
 *  · A REFERRAL LINK OR INVITE CODE. There is no referral system, no link and
 *    no code. On the day one exists this becomes the most valuable option on
 *    the list, because it is the only one that could ever be CHECKED rather
 *    than self-reported. Until then it is a promise of a feature.
 */
insert into public.heard_about_channels (slug, label, sort_order, is_channel) values
  ('friend',            'A friend, or someone I climb with',      10, true),
  ('guide-or-operator', 'A guide, a club, or an expedition company', 20, true),
  ('instagram',         'Instagram',                              30, true),
  ('youtube',           'YouTube',                                40, true),
  ('tiktok',            'TikTok',                                 50, true),
  ('reddit',            'Reddit',                                 60, true),
  ('podcast',           'A podcast',                              70, true),
  ('search',            'A search engine',                        80, true),
  ('article',           'A blog, forum, or news article',         90, true),
  ('somewhere-else',    'Somewhere else',                        900, false),
  ('dont-remember',     'I don''t remember',                     910, false),
  ('prefer-not-to-say', 'Prefer not to say',                     920, false)
on conflict (slug) do nothing;

/*
 * `on conflict do nothing`, not `do update`: if somebody has already retired a
 * channel or reworded a label on the live database, re-running this migration
 * must not quietly undo that decision.
 */

alter table public.heard_about_channels enable row level security;

/*
 * READABLE BY ANY SIGNED-IN ACCOUNT, because the picker cannot be drawn from
 * rows the client may not read — the same reason `interest_tags` is readable.
 * Nothing here is about a person: it is a list of twelve words ICEFALL wrote.
 *
 * THERE IS NO WRITE POLICY AT ALL, which is the §6ar half that applies to this
 * table. The vocabulary is ICEFALL's, the athlete is the asker, and an asker
 * who can add rows to the answer set can write an answer nobody offered. It
 * changes through a migration or the dashboard, both of which run as roles no
 * policy governs.
 */
drop policy if exists heard_about_channels_select on public.heard_about_channels;
create policy heard_about_channels_select on public.heard_about_channels
  for select to authenticated
  using (true);

revoke all on public.heard_about_channels from anon, authenticated;
grant select on public.heard_about_channels to authenticated;

comment on table public.heard_about_channels is
  'The closed vocabulary behind athlete_profiles.heard_about. A table rather than an '
  'enum so a channel is one INSERT — and because `alter type ... add value` cannot be '
  'used in the transaction that then writes it, which is every Supabase migration. '
  'is_channel is false for the three answers that name no place: somewhere-else, '
  'dont-remember and prefer-not-to-say. Retire, never delete — the foreign key will '
  'refuse the delete anyway.';

/* ========================================================================== */
/* 3. HEARD_ABOUT — the answer itself                                         */
/* ========================================================================== */

/*
 * ── THE FOUR STATES, AND WHY NULL IS ONLY ONE OF THEM ─────────────────────
 *
 *   'instagram' (etc.)   they named a place
 *   'somewhere-else'     they remember; it is not on the list
 *   'dont-remember'      they could not recall
 *   'prefer-not-to-say'  they declined to tell ICEFALL
 *   NULL                 THE QUESTION WAS NEVER PUT
 *
 * Same rule as gender in section 1, and it matters more here because this is
 * the column somebody will build a chart from. A person who declined is not a
 * person who was never asked; a person who could not remember is not a person
 * who refused. Three of those are things ICEFALL was told and one is a gap in
 * what ICEFALL asked, and a chart that merges them is describing its own
 * rollout as though it were describing its audience.
 *
 * EVERY EXISTING ROW WILL BE NULL AFTER THIS RUNS, AND THAT IS CORRECT.
 * There is deliberately no backfill and no default. Everybody who signed up
 * before this question existed was, in fact, never asked, and inventing an
 * answer for them — even 'dont-remember', which is tempting because it sounds
 * harmless — would be manufacturing a history. If ICEFALL wants those answers
 * it has to ask those people, which is a product decision and not a migration.
 *
 * NULL IS NOT A CLEAN "NEVER ASKED", AND THE IMPRECISION IS WORTH NAMING.
 * `syncOnboarding` swallows its errors: offline, or an unwritable row, and the
 * answer is simply gone with nothing recorded. So NULL is "no answer reached
 * the server", which is mostly never-asked and partly never-arrived. There is
 * no way to tell them apart from here, and a report should say "not answered"
 * rather than "never asked".
 *
 * A MISSING ROW IS A FIFTH STATE. `athlete_profiles` rows are created by the
 * onboarding upsert, not by the signup trigger, so an account that never
 * finished onboarding while signed in has no row here at all. Any denominator
 * taken from this table is "athletes who completed onboarding on the server",
 * which is smaller than "accounts". Section 4 counts what it can count and
 * says so.
 *
 * ── WHO MAY WRITE IT ──────────────────────────────────────────────────────
 *
 * The account, about itself, and nobody else. `athlete_profiles_insert` and
 * `athlete_profiles_update` are both `id = auth.uid()` in USING and WITH
 * CHECK, so that is already true of every column on this table and no new
 * policy is needed. Checked rather than assumed, per §6ar shape (1): there is
 * no BEFORE trigger on this table pinning any column — only `athlete_profiles_touch`,
 * which sets `updated_at` — so no existing guard has been blinded by these
 * two columns arriving after it was written.
 *
 * IT IS NOT WRITE-ONCE, DELIBERATELY. A person who mis-taps should be able to
 * correct it, and there is nothing to game: no credit, no payout and no
 * ranking hangs off this answer.
 *
 * THE DAY THAT STOPS BEING TRUE, THIS BECOMES A DECISION COLUMN. If ICEFALL
 * ever pays a referral credit, or gives an operator commission for an athlete
 * who says they arrived through them, a self-reported channel the athlete can
 * rewrite at will becomes money that the asker awards to themselves — §6ar
 * shape (2) exactly. A payment must never be based on this column. It would
 * need a checkable fact (a link, a code) recorded by whoever minted it, and
 * this column would stay what it is: unverified, and useful only in aggregate.
 */
alter table public.athlete_profiles add column if not exists heard_about text;

alter table public.athlete_profiles drop constraint if exists athlete_profiles_heard_about_known;
alter table public.athlete_profiles add constraint athlete_profiles_heard_about_known
  foreign key (heard_about) references public.heard_about_channels (slug)
  on update cascade
  on delete restrict;

/*
 * `on delete restrict` — an answer somebody gave cannot be erased by tidying
 * the vocabulary. `on update cascade` so a slug can be corrected without
 * orphaning rows, which is the one edit to a vocabulary that is safe.
 *
 * AND THE INDEX, WHICH IS NOT OPTIONAL HERE. 20260829200000 indexed every
 * foreign key in the schema and gave the reason: Postgres indexes a primary
 * key automatically and a foreign key not at all, and the cost that bites
 * first is on the PARENT — "seven of these are `on delete restrict` or `no
 * action`, where the scan happens purely to decide whether to raise an error".
 * This foreign key is one more of exactly that kind, added after that sweep ran
 * and therefore not covered by it. Without this index, removing a channel row
 * sequentially scans `athlete_profiles`, and so does the cascade check when an
 * account is deleted. A group-by for the tally is a full scan either way and
 * would not have justified an index on its own; the foreign key does.
 */
create index if not exists idx_athlete_profiles_heard_about
  on public.athlete_profiles (heard_about);

comment on column public.athlete_profiles.heard_about is
  'Where this person says they found ICEFALL. A slug from heard_about_channels — '
  'constrained because a typo''d free-text value is a channel that vanishes from the '
  'only report anybody will read. SELF-REPORTED AND UNVERIFIED: nothing checks it, so '
  'a chart of this column is a chart of recollections and must say so. NULL means the '
  'question was never put; ''prefer-not-to-say'' and ''dont-remember'' are answers and '
  'are not NULL. Private to its owner and admins — never on public.profiles, which '
  'every signed-in account can read. NEVER the basis of a payment or a commission.';

/* ========================================================================== */
/* 4. READING IT — the tally, which is the COUNT and never the LIST           */
/* ========================================================================== */

/*
 * WHY A FUNCTION AT ALL, when `is_admin()` can already read every row of this
 * table. Because reading every row to count twelve slugs means pulling every
 * athlete's body mass, height and year of birth through the API to answer a
 * question about marketing. That is the `follower_count` argument one table
 * over — "the function is the boundary between '183 people' and 'these 183
 * people'" — and it applies with more force here, because the rows this one
 * declines to hand over are the most personal on the platform.
 *
 * ADMIN-ONLY, AND IT REFUSES RATHER THAN RETURNING NOTHING. A guard written as
 * `where public.is_admin()` inside a plain SQL function would hand a non-admin
 * an empty result set, and an empty result set is indistinguishable from "no
 * answers yet". A refusal has to look like a refusal. `is not true` rather
 * than `not`, because a NULL there reads as "did not fail" — this project has
 * shipped that exact NULL-bypass before and it is cheaper to be paranoid than
 * to be right about `is_admin()` always coalescing.
 *
 * NOTE IT IS `is_admin()`, NOT `is_staff()`. That is inherited from
 * `athlete_profiles_select`, not chosen here, and it is the correct boundary:
 * a sales desk has no business reading the athlete questionnaire, and this
 * function must not become a way around a policy it sits behind.
 *
 * ── WHAT IT RETURNS, AND THE ROW MOST REPORTS WOULD OMIT ──────────────────
 *
 * One row per channel in the vocabulary INCLUDING channels nobody chose, and
 * then one final row for the people with no answer stored. Both are there for
 * the same reason: a percentage needs a denominator, and the denominator here
 * is mostly people who were never asked. "Instagram, 40%" read off a table
 * that hides the 95% who were never asked is a number that is confidently
 * wrong, which is the only kind this project actually fears.
 *
 * A CHANNEL NOBODY CHOSE RETURNS 0, NOT NOTHING. `count(a.id)` over the left
 * join, never `count(*)` — `count(*)` counts the unmatched join row and would
 * report 1 for a channel with no athletes at all. Zero here is a MEASURED
 * zero: the question was asked, and nobody gave that answer. It renders "0".
 *
 * WHAT IT CANNOT COUNT, so nobody reads the total as an audience: accounts
 * with no `athlete_profiles` row are invisible to it, because they have not
 * finished onboarding against the server. To compare against all accounts,
 * count `profiles` separately. This function will not do it, because joining
 * the two would put a number on the screen whose meaning changes with how
 * signup happened to fail that week.
 */
create or replace function public.heard_about_tally()
returns table (channel text, label text, is_channel boolean, athletes integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() is not true then
    raise exception 'heard_about_tally is admin-only'
      using hint = 'Where somebody heard about ICEFALL is business data about the signup, not part of a profile. It is readable by its owner and by admins, and by nobody else.';
  end if;

  return query
    select c.slug, c.label, c.is_channel, count(a.id)::int
      from public.heard_about_channels c
      left join public.athlete_profiles a on a.heard_about = c.slug
     group by c.slug, c.label, c.is_channel, c.sort_order
     order by c.sort_order;

  -- Last, and never omitted. See the comment above: this is the denominator.
  return query
    select null::text,
           'Not answered'::text,
           false,
           count(*)::int
      from public.athlete_profiles a
     where a.heard_about is null;
end;
$$;

revoke all on function public.heard_about_tally() from public, anon;
grant execute on function public.heard_about_tally() to authenticated;

comment on function public.heard_about_tally() is
  'How many athletes named each channel. Admin-only, and it RAISES for anybody else '
  'rather than returning an empty set — a refusal must not look like no data. Counts, '
  'never rows, so a marketing question does not pull every athlete''s body mass through '
  'the API. The final row is people with no answer stored, which is mostly people who '
  'were never asked; a percentage without it is wrong. Answers are self-reported and '
  'nothing verifies them.';

/* ========================================================================== */
/* 5. THE FLOOR UNDER THE POLICIES                                            */
/* ========================================================================== */

/*
 * `athlete_profiles` was never revoked from `anon`, unlike every table in
 * 20260817120000. It is re-asserted here because this is the file that puts
 * two more private answers on it, and the honest description of what it
 * changes is: NOTHING MEASURABLE TODAY. RLS is enabled and every policy on the
 * table is `to authenticated`, so a request with no session already matches no
 * policy and reads no rows. This is the floor, not the ceiling — the same
 * belt-and-braces the foundation applied to every other table, and cheap
 * enough that it should not depend on the ceiling never being edited.
 */
revoke all on public.athlete_profiles from anon;

/* ==========================================================================
 * WHAT IS STILL NOT SOLVED, so nobody reads this file as the finished feature.
 *
 * 1. THE CLIENT HALF SHIPS ALONGSIDE THIS FILE, NOT BEFORE IT, AND THAT
 *    ORDER MATTERS. `settings/sync.ts` writes all three columns and
 *    `Onboarding.tsx` asks all three questions, but the write is an UPDATE
 *    against columns that do not exist until this migration is applied. Until
 *    it is, every answer comes back `PGRST204` / `42703`, the client reports
 *    "not yet on server" in those words, and NOTHING IS QUEUED — there is no
 *    outbox on this path, so those answers are gone. Deploying the app before
 *    pushing this file therefore silently loses the answers of everybody who
 *    signs up in between. Push this first.
 * 2. NOTHING READS `gender`, and this file adds no reader for it on purpose.
 *    The signup screen must say it is recorded and unused, and the payoff
 *    screen must say the answer changed nothing. `sex_at_birth` is the
 *    exception on this table and section 1B is the whole story: one equation,
 *    one constant, the athlete's own row, nothing else.
 * 3. A FAILED SEND IS A LOST ANSWER. `syncOnboarding` catches and discards.
 *    There is no outbox on this path, so no screen may say the answer "will be
 *    sent later" — it will not.
 * 4. THE VOCABULARY IS ENGLISH. `label` holds one string, and a signup flow
 *    that is ever translated will need a second home for the words. The slugs
 *    are stable and the labels are not; a report should key on the slug.
 * 5. ONLY ATHLETES HAVE A ROW HERE. A guide or an operator asked the same
 *    question at signup has nowhere to put the answer, and this file
 *    deliberately does not invent a second home for it on a table with a
 *    different disclosure.
 * ========================================================================== */
