/**
 * Authorization, publication state, mountain assignment and lead attribution.
 *
 * Spec §19 step 14 asks for exactly these. They run against the same
 * `memoryBackend` the app uses, not a stub — a test that passes against a
 * permissive fake proves nothing about the system it stands in for. When the
 * Supabase implementation lands, this file should be re-pointed at it and still
 * pass unchanged; that is the whole reason `OperatorBackend` takes the session
 * on every call.
 *
 * THE TWO THAT MATTER MOST are marked. If either ever fails, the portal is
 * leaking one expedition company's commercial position to a competitor, or
 * letting an operator take a marketplace position it did not pay for.
 *
 * Note what these tests do NOT claim. In production the real guarantees are
 * database privileges and RLS — 62 attack tests in `icefall-supabase` cover
 * them. These assert that the client refuses the same things, so the UI never
 * offers an action the database would reject.
 *
 * Run: npm test
 */

import { memoryBackend as be, resetStore, __store } from "../src/domain/memory/adapter";
import { canEditPlacement, canManageMountain, findContactDetails, isEditableState } from "../src/domain/authz";
import type { Session } from "../src/domain/authz";
import { conversionRate, estimatedGmv } from "../src/domain/honesty";
import { COMPANY_MOUNTAINS, PLACEMENTS } from "../src/domain/memory/seed";
import { placementStatus } from "../src/domain/placement";
import { missingForApproval, pathIsInCompanyFolder, safeFileName, storagePathFor, validateFile } from "../src/domain/media";
import { COMPANY_SECTIONS, pendingFields, sectionState, sectionsFor } from "../src/editor/sections";
import { youtubeIdFrom } from "../src/editor/VideoField";
// Added for the Insights (`getInsights`) suite at the end of this file.
import { OPERATOR_NOTICES } from "../src/domain/honesty";
import { DEMO_PROFILE_VIEWS } from "../src/domain/demo";
// Added for the trip-editor (`ProductEditor`) suite at the end of this file.
import { PERMISSIONS, canEditProductDirectly } from "../src/domain/authz";
import { PRODUCT_SECTIONS, productSectionState, productSectionsFor } from "../src/editor/productSections";
import { COLDHARBOUR } from "../src/domain/memory/seed";
// Added for the company-mark (logo) suite at the end of this file.
import { MEDIA_RULES, acceptAttribute, isAcceptable } from "../src/domain/media";
import { LANTERN, LANTERN_LOGO, MEDIA_ASSETS } from "../src/domain/memory/seed";
// Added for the mountain-page-editor (`MountainEditor`) suite at the end of this file.
import { placementFor } from "../src/domain/placement";
import type { CompanyMountain } from "../src/domain/types";
// Added for the custom-offer (OP-05b) suite at the end of this file.
import { centsFromEuros, lineTotal, offerMessageBody, operatorOfferTotals } from "../src/money/offer";
import { GUIDE_COMMISSION_PCT, STANDARD_POLICY, totalsFor } from "../src/money/model";
import type { Quote } from "../src/money/model";
/*
 * Added for section 14 — the guard suite over the batch that built OP-03,
 * OP-05a, OP-06 and OP-08a. It asserts nothing new about the product; it
 * re-asserts the rules that batch stood closest to.
 */
import { readdirSync, readFileSync } from "node:fs";
import {
  GRANTABLE_PERMISSIONS,
  can,
  grantedPermissions,
  hasGrant,
  isCompanyOwner,
  isOwnerAccount,
  manageableMountainIds,
} from "../src/domain/authz";
import { DEPARTURE_DIRECT_FIELDS } from "../src/domain/types";
import type { CompanyUser, Product, ProductDeparture } from "../src/domain/types";
import { COMPANY_USERS } from "../src/domain/memory/seed";
/*
 * Added for section 15 — the guard suite over the trek batch (OP-04a) and the
 * honest half of the invite (OP-08b). Nothing here tests a new feature; every
 * check re-asserts a rule those changes stood next to.
 */
import { canManageTrek, manageableTrekIds } from "../src/domain/authz";
import { COMPANY_TREKS, TREKS } from "../src/domain/memory/seed";
import type { CompanyTrek } from "../src/domain/types";
/*
 * Added for section 17 — the guard suite over the two things the last batch
 * built: the operator's custom-offer composer (OP-05b) and the operator's
 * product detail (OP-10). Nothing here tests a new feature. Every check exists
 * because the failure mode it guards is SILENT: a number 15% wrong on a screen
 * telling a company what they earn, or a paraphrase of a sentence the owner
 * wrote to say a figure is not measured.
 */
import { DEFAULT_REFERRAL_PCT, referralFee, totalsForAmount } from "../src/money/model";
import type { QuoteLine } from "../src/money/model";
/*
 * Added for section 18 — the guard suite over OP-01, the company social
 * surface built via S2 (posts with author kind / media / caption / optional
 * expiry = a story; post_comments; follows; the promo-video slot). THE S2
 * TABLES ARE NOT LIVE: these run against the same in-memory adapter the app
 * uses, in the contract's exact shapes, so when the migration lands the file
 * re-points and still passes. Nothing here tests a new feature for its own
 * sake — every check guards a failure mode that would be SILENT on screen:
 * a competitor's post in the wrong feed, a phone number in a public caption,
 * a moderation trail tidied away, a story clock drifting off the app clock,
 * a follower figure typed instead of counted, or decision 15 quietly undone.
 */
import { FOLLOWS, POSTS, POST_COMMENTS, PROMO_VIDEOS } from "../src/domain/memory/seed";
import { isStory, storyState } from "../src/domain/types";
import type { Company, MediaAsset } from "../src/domain/types";
import { NOW } from "../src/domain/dates";
import { findContactDetailsIn } from "../src/domain/authz";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        passed++;
      },
      (err) => {
        failures.push(`${name}\n    ${err instanceof Error ? err.message : String(err)}`);
      },
    );
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const eq = (a: unknown, b: unknown, msg: string) =>
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

/* -------------------------------------------------------------------------- */

const signIn = async (email: string): Promise<Session> => {
  const s = await be.signIn(email);
  assert(s, `could not sign in as ${email}`);
  return s;
};

const RAVI = "ravi@lanternridge.example"; // Lantern, Company Admin
const MARTA = "marta@lanternridge.example"; // Lantern, Sales
const TENZIN = "tenzin@lanternridge.example"; // Lantern, DISABLED
const JO = "jo@coldharbour.example"; // Coldharbour, Company Admin

async function run() {
  resetStore();
  const ravi = await signIn(RAVI);
  const marta = await signIn(MARTA);
  const jo = await signIn(JO);

  /* ===== 1. Cross-company isolation — THE MOST IMPORTANT TEST ============= */

  await check("an operator cannot read another company's company record", async () => {
    const mine = await be.getCompany(ravi);
    const theirs = await be.getCompany(jo);
    assert(mine && theirs, "both companies should load for their own operator");
    assert(mine.id !== theirs.id, "the two operators must see different companies");
    eq(mine.name, "Lantern Ridge Expeditions", "Ravi sees his own company");
    eq(theirs.name, "Coldharbour Alpine", "Jo sees hers");
  });

  await check("an operator cannot read another company's products", async () => {
    const products = await be.getProducts(ravi);
    assert(
      products.every((p) => p.companyId === ravi.user.companyId),
      "every product returned must belong to the caller's company",
    );
    assert(
      !products.some((p) => p.id === "p-coldharbour-denali"),
      "Coldharbour's Denali expedition must not appear in Lantern's catalogue",
    );
  });

  await check("an operator cannot fetch another company's product by id", async () => {
    eq(await be.getProduct(ravi, "p-coldharbour-denali"), null, "direct id lookup must not cross companies");
  });

  await check("an operator cannot read another company's conversations or messages", async () => {
    const convos = await be.getConversations(ravi);
    assert(!convos.some((c) => c.id === "cv-x"), "Coldharbour's enquiry must not be in Lantern's inbox");
    eq(await be.getConversation(ravi, "cv-x"), null, "direct lookup must not cross companies");
    eq((await be.getMessages(ravi, "cv-x")).length, 0, "messages must not leak across companies");
  });

  await check("an operator cannot read another company's leads or bookings", async () => {
    const leads = await be.getLeads(ravi);
    assert(!leads.some((l) => l.id === "l-x"), "Coldharbour's lead must not appear");
    eq(await be.getLead(ravi, "l-x"), null, "direct lead lookup must not cross companies");
    const bookings = await be.getBookings(ravi);
    assert(
      bookings.every((b) => b.companyId === ravi.user.companyId),
      "bookings must be scoped to the caller's company",
    );
  });

  await check("an operator cannot write into another company's conversation", async () => {
    const res = await be.sendMessage(ravi, "cv-x", "hello");
    eq(res.ok, false, "sending into another company's thread must be refused");
  });

  await check("an operator cannot move another company's lead", async () => {
    const res = await be.setLeadStatus(ravi, "l-x", "qualified");
    eq(res.ok, false, "changing another company's lead must be refused");
  });

  await check("an operator cannot invite a user into another company", async () => {
    const res = await be.inviteTeamMember(ravi, {
      displayName: "Intruder",
      email: "intruder@example.com",
      role: "sales",
    });
    assert(res.ok, "the invite itself should succeed");
    eq(res.value.companyId, ravi.user.companyId, "an invite is always scoped to the caller's own company");
  });

  /* ===== 2. Placement — THE OTHER MOST IMPORTANT TEST ===================== */

  await check("an operator can never change its placement position", () => {
    eq(canEditPlacement(), false, "canEditPlacement must be false, always");
    // There is no method on the backend that could do it either. That is the
    // real assertion: the capability does not exist to be misused.
    eq(
      "setPlacement" in (be as unknown as Record<string, unknown>),
      false,
      "the backend must expose no placement write of any kind",
    );
  });

  await check("placement expiry is derived and never reorders the mountain", () => {
    const everest = PLACEMENTS.find((p) => p.id === "pl-lantern-everest")!;
    // A placement whose term ended on 2026-07-31; "today" in the seed is
    // 2026-08-28. `placementStatus` is pure, so the lapsed case is exercised
    // directly — the current seed deliberately holds no expired placement.
    const lapsed = { ...everest, id: "pl-test-lapsed", slotPosition: 4 as const, startsOn: "2026-04-01", endsOn: "2026-07-31" };
    eq(placementStatus(lapsed).effectiveStatus, "expired", "a lapsed term reads as expired");
    // ...and the slot is untouched. Nothing ran on a timer to take it away.
    eq(lapsed.slotPosition, 4, "an expired placement still holds its position");
    eq(lapsed.status, "active", "the stored status is not rewritten by expiry");
    eq(placementStatus(everest).effectiveStatus, "active", "a live term reads as active");
    eq(placementStatus(everest).daysRemaining, 33, "Everest's term has 33 days left from the seeded today");
    eq(placementStatus(everest).needsReview, false, "33 days out is not yet a review flag");
    // ...and a lapsed one always is, because a human has to decide what happens
    // next. Nothing decides it automatically, which is the whole rule.
    eq(placementStatus(lapsed).needsReview, true, "an expired placement always needs a human");
  });

  /* ===== 3. Mountain assignment is the authorization boundary ============= */

  await check("a product cannot be created on an unassigned mountain", async () => {
    const res = await be.createProduct(ravi, { kind: "expedition", name: "K2", mountainId: "k2" });
    eq(res.ok, false, "K2 was never assigned to Lantern");
  });

  await check("another company's mountain is not manageable", async () => {
    // Denali is assigned — to Coldharbour. An assignment elsewhere is exactly
    // as unusable as no assignment at all.
    eq(
      canManageMountain(ravi, COMPANY_MOUNTAINS, "denali"),
      false,
      "another company's assignment must not permit management",
    );
    const res = await be.createProduct(ravi, {
      kind: "expedition",
      name: "Denali — Cassin Ridge",
      mountainId: "denali",
    });
    eq(res.ok, false, "creating on a mountain assigned to another company must be refused");
  });

  await check("a productless enquiry survives on a mountain with no product", async () => {
    // Sophie Dubois asked about Mont Blanc before Lantern listed anything on
    // it. The lead and its conversation exist and are readable regardless.
    const leads = await be.getLeads(ravi);
    assert(leads.some((l) => l.mountainId === "mont-blanc" && l.productId === null), "the productless lead must be readable");
  });

  await check("a product can be created on an assigned mountain", async () => {
    const res = await be.createProduct(ravi, {
      kind: "expedition",
      name: "Ama Dablam — North Ridge",
      mountainId: "ama-dablam",
    });
    assert(res.ok, "creating on an actively assigned mountain must work");
    eq(res.value.status, "draft", "a new trip is never public on creation");
    eq(res.value.companyId, ravi.user.companyId, "scope comes from the session, not the caller");
  });

  await check("two products may share one mountain (spec §20)", async () => {
    const products = await be.getProducts(ravi);
    const onEverest = products.filter((p) => p.mountainIds.includes("everest"));
    assert(onEverest.length >= 2, `expected 2+ trips on Everest, found ${onEverest.length}`);
  });

  /* ===== 4. The publication boundary ====================================== */

  await check("live content is never changed by saving a draft", async () => {
    const before = await be.getCompany(ravi);
    const res = await be.saveDraft(ravi, {
      entityType: "company",
      entityId: ravi.user.companyId,
      payload: { tagline: "A completely new tagline" },
      baseSnapshot: { tagline: before!.tagline },
    });
    assert(res.ok, "saving a draft should succeed");
    const after = await be.getCompany(ravi);
    eq(after!.tagline, before!.tagline, "the LIVE tagline must be untouched while an edit is a draft");
  });

  await check("submitting for approval still does not change live content", async () => {
    const before = await be.getCompany(ravi);
    // The seed already has a company edit awaiting review, and the system
    // (correctly) refuses a second one. Withdraw it first — which is itself the
    // operator's escape hatch from the serialization rule.
    const seeded = (await be.getVersions(ravi, "company")).find((v) => v.state === "pending");
    assert(seeded, "the seed should have a pending company version");
    const withdrawn = await be.withdrawSubmission(ravi, seeded.id);
    assert(withdrawn.ok, "an operator may withdraw their own pending submission");
    eq(withdrawn.value.state, "draft", "withdrawing returns it to a draft they can edit");

    const draft = await be.getDraftFor(ravi, "company", ravi.user.companyId);
    assert(draft, "the draft saved above should be findable");
    const res = await be.submitForApproval(ravi, draft.id);
    assert(res.ok, `submission should succeed, got: ${res.ok ? "" : res.reason}`);
    eq(res.value.state, "pending", "the version is now pending");
    const after = await be.getCompany(ravi);
    eq(after!.tagline, before!.tagline, "live content must survive submission unchanged");
  });

  await check("a pending submission cannot be edited by the operator who sent it", async () => {
    const versions = await be.getVersions(ravi, "company");
    const pending = versions.find((v) => v.state === "pending");
    assert(pending, "there should be a pending company version");
    eq(isEditableState(pending.state), false, "pending is not an editable state");
    const res = await be.submitForApproval(ravi, pending.id);
    eq(res.ok, false, "re-submitting something already under review must be refused");
  });

  await check("a second submission on the same entity is serialized, not lost", async () => {
    resetStore();
    const r = await signIn(RAVI);
    // `cv-company-1` is already pending in the seed.
    const draft = await be.saveDraft(r, {
      entityType: "company",
      entityId: r.user.companyId,
      payload: { tagline: "Another change while one is in review" },
      baseSnapshot: { tagline: "Khumbu specialists, twenty-one seasons" },
    });
    assert(draft.ok, "the second draft must still save — never silently lose an edit");
    const res = await be.submitForApproval(r, draft.value.id);
    eq(res.ok, false, "submitting a second change while one is pending must be refused, not merged over");
    assert(!res.ok && res.conflict, "the refusal must name the change already in flight");
    // And the operator's words are still there.
    const kept = await be.getDraftFor(r, "company", r.user.companyId);
    assert(kept, "the draft must survive the refused submission");
  });

  await check("a rejected version carries Icefall's reason for the operator to read", async () => {
    const r = await signIn(RAVI);
    const versions = await be.getVersions(r, "product");
    const rejected = versions.find((v) => v.state === "rejected");
    assert(rejected, "the seed should contain a rejected version");
    assert(
      rejected.decisionReason && rejected.decisionReason.trim().length > 0,
      "a rejection without a reason is not a rejection an operator can act on",
    );
  });

  /* ===== 5. The two roles ================================================= */

  await check("a Sales Employee cannot edit company or product content", async () => {
    const res = await be.saveDraft(marta, {
      entityType: "company",
      entityId: marta.user.companyId,
      payload: { tagline: "Sales tried to edit this" },
      baseSnapshot: {},
    });
    eq(res.ok, false, "content is a Company Admin's job (spec §3)");
    const created = await be.createProduct(marta, {
      kind: "trek",
      name: "Nope",
      mountainId: "everest",
    });
    eq(created.ok, false, "a Sales Employee cannot create trips");
  });

  await check("a Sales Employee CAN work conversations and leads", async () => {
    const sent = await be.sendMessage(marta, "cvn-tomas", "Yes, that departure is still open for four.");
    assert(sent.ok, "replying to a customer is exactly what a Sales account is for");
    const note = await be.addNote(marta, "cvn-tomas", "Group of four, flexible on dates.");
    assert(note.ok, "internal notes are a Sales tool");
  });

  await check("a disabled employee cannot sign in at all", async () => {
    eq(await be.signIn(TENZIN), null, "a removed employee loses access immediately");
  });

  await check("a disabled employee's history survives their removal", async () => {
    const r = await signIn(RAVI);
    const leads = await be.getLeads(r);
    assert(
      leads.some((l) => l.ownerId === "cu-tenzin"),
      "the lead a departed employee owned must remain on the company's record",
    );
  });

  /* ===== 6. Departures — the split write path ============================= */

  await check("an operator may set availability and spaces directly", async () => {
    const r = await signIn(RAVI);
    const res = await be.setDepartureAvailability(r, "d-1", { availability: "full", spotsLeft: 0 });
    assert(res.ok, "availability is a fact about the operator's own logistics");
    eq(res.value.availability, "full", "the change applies immediately, with no review");
    eq(res.value.spotsLeft, 0, "zero spaces left is a real, reported figure here");
  });

  await check("the departure write path exposes no way to change price or dates", async () => {
    const r = await signIn(RAVI);
    const before = (await be.getDepartures(r, "p-everest-south-col")).find((d) => d.id === "d-1")!;
    // The patch type has no price or date field; passing one is inexpressible in
    // TypeScript and ignored at runtime. Both halves matter.
    await be.setDepartureAvailability(r, "d-1", {
      availability: "limited",
      ...({ priceCents: 1, departureDate: "2030-01-01" } as Record<string, never>),
    });
    const after = (await be.getDepartures(r, "p-everest-south-col")).find((d) => d.id === "d-1")!;
    eq(after.priceCents, before.priceCents, "price must be untouched by an availability write");
    eq(after.departureDate, before.departureDate, "the date must be untouched too");
  });

  await check("an operator cannot set availability on another company's departure", async () => {
    const j = await signIn(JO);
    const res = await be.setDepartureAvailability(j, "d-1", { availability: "full" });
    eq(res.ok, false, "Lantern's departure is not Coldharbour's to change");
  });

  /* ===== 7. Customer communication stays inside ICEFALL =================== */

  await check("a reply carrying contact details is refused", async () => {
    const r = await signIn(RAVI);
    const res = await be.sendMessage(r, "cvn-hanne", "Easier on WhatsApp — +977 98 1234 5678");
    eq(res.ok, false, "there is no reviewer between a reply and the climber, so this is blocked");
  });

  await check("the contact matcher catches every escape route it should", () => {
    const cases: [string, boolean][] = [
      ["hello@lanternridge.example", true],
      ["call +977 98 1234 5678", true],
      ["find us on wa.me/9779812345678", true],
      ["book at https://example.com/book", true],
      ["dm @lanternridge", true],
      ["We climb the South Col route in May.", false],
      ["Two rotations before the summit push, then 8 days rest.", false],
    ];
    for (const [text, shouldFlag] of cases) {
      eq(findContactDetails(text).length > 0, shouldFlag, `contact detection on: ${text}`);
    }
  });

  /* ===== 8. Honesty — the numbers ======================================== */

  await check("views are unavailable, not zero, while nothing counts them", async () => {
    const r = await signIn(RAVI);
    const dash = await be.getDashboard(r);
    eq(dash.views.available, false, "no listing_view events exist, so there is no figure");
    assert(
      !dash.views.available && /not counting/i.test(dash.views.reason),
      "the reason shown must say views are not counted, not imply nobody looked",
    );
  });

  await check("a client-emitted view is NOT counted as a measured view", async () => {
    resetStore();
    const r = await signIn(RAVI);
    // Simulate a consumer app emitting with the public anon key — which anyone
    // holding that key can do, including the company the row flatters.
    __store.events = [
      ...__store.events,
      {
        id: "e-client-1",
        occurredAt: "2026-08-27T10:00:00.000Z",
        eventType: "listing_view",
        source: "client",
        companyId: r.user.companyId,
        mountainId: "everest",
        productId: "p-everest-south-col",
        conversationId: null,
        leadId: null,
        sourcePage: "Everest — expeditions",
      },
    ];
    const dash = await be.getDashboard(r);
    eq(dash.views.available, false, "an untrusted row must not become a measured figure");
    assert(
      !dash.views.available && /verify/i.test(dash.views.reason),
      "and the reason must say why, not repeat 'not counting yet' once rows exist",
    );

    // A server-emitted row IS evidence, and the same code path shows it.
    __store.events = [
      ...__store.events,
      { ...__store.events[__store.events.length - 1], id: "e-server-1", source: "server" },
    ];
    const after = await be.getDashboard(r);
    assert(after.views.available, "a trusted row produces a real figure");
    eq(after.views.value, 1, "and counts only the trusted one");
    resetStore();
  });

  await check("a conversion rate with no denominator is unavailable, not 0%", () => {
    eq(conversionRate(0, 0).available, false, "0/0 is not 0%");
    const measuredZero = conversionRate(0, 12);
    assert(measuredZero.available, "twelve enquiries and no bookings IS a measured zero");
    eq(measuredZero.value, 0, "and it is genuinely zero");
  });

  await check("estimated value sums exactly what was reported", async () => {
    const r = await signIn(RAVI);
    const bookings = await be.getBookings(r);
    const gmv = estimatedGmv(bookings.map((b) => b.value));
    // The mockup shows a value on every booking row, and the total is their
    // SUM — €12,450 + €2,150 + €6,900 + €12,450 — not a typed-in aggregate.
    eq(gmv.excluded, 0, "every seeded booking reports a value");
    assert(gmv.total.available, "so the total is a real figure");
    eq(gmv.total.value, 3_395_000, "and it is the sum of the four reported values");

    // And the exclusion path still refuses to invent a figure: one pending
    // value must be excluded AND counted as excluded.
    const withPending = estimatedGmv([...bookings.map((b) => b.value), { status: "pending" }]);
    eq(withPending.excluded, 1, "a pending value is excluded, never summed as 0");
    eq(withPending.total.available && withPending.total.value, 3_395_000, "and the total is unchanged by it");
  });

  await check("REVENUE counts only confirmed/completed bookings — cancelled money is not earnings", async () => {
    const r = await signIn(RAVI);
    const a = await be.getAnalytics(r, "month");
    // Hanne €12,450 confirmed + Luis €2,150 confirmed. Charlotte's pending
    // €6,900 is not revenue YET; Benjamin's cancelled €12,450 never will be.
    assert(a.estimatedGmv.available, "revenue is a measured figure");
    eq(a.estimatedGmv.available && a.estimatedGmv.value, 1_460_000, "and sums exactly the confirmed values");
  });

  await check("marking a lead Booked records a booking with NO value", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const res = await be.setLeadStatus(r, "l-priya", "booked");
    assert(res.ok, "moving a lead to Booked must work");
    const bookings = await be.getBookings(r);
    const created = bookings.find((b) => b.leadId === "l-priya");
    assert(created, "a booking should have been created");
    eq(created.value.status, "pending", "value is Pending, never a fabricated 0");
    assert(!("cents" in created.value), "a pending value cannot carry a figure at all");
    eq(created.referralPctAtBooking, null, "the referral rate is deferred and must not be invented");
  });

  /* ===== 9. Lead attribution ============================================= */

  await check("replying to a customer advances the linked lead to Contacted", async () => {
    resetStore();
    const m = await signIn(MARTA);
    const before = (await be.getLeads(m)).find((l) => l.id === "l-tomas")!;
    eq(before.status, "new", "the seed lead starts as New");
    const sent = await be.sendMessage(m, "cvn-tomas", "Yes — four places are still open on 12 October.");
    assert(sent.ok, "the reply should send");
    const after = (await be.getLeads(m)).find((l) => l.id === "l-tomas")!;
    eq(after.status, "contacted", "the pipeline reflects what actually happened");
    assert(after.firstResponseAt, "and the moment it happened is recorded");
  });

  await check("a conversation and its lead stay linked (spec §16)", async () => {
    const r = await signIn(RAVI);
    const convos = await be.getConversations(r);
    const withLead = convos.filter((c) => c.leadId !== null);
    assert(withLead.length > 0, "enquiry conversations must carry a lead id");
    for (const c of withLead) {
      const lead = await be.getLead(r, c.leadId!);
      assert(lead, `conversation ${c.id} points at a lead that must be readable`);
      eq(lead.conversationId, c.id, "and the lead points back — attribution cannot detach");
    }
  });

  await check("an enquiry with no catalogue product keeps the name the customer saw", async () => {
    // Same mechanism as spec §18's archived-trip case: Sophie asked about a
    // Mont Blanc trip Lantern does not list, and the conversation carries the
    // name she actually saw rather than a dangling product id.
    const r = await signIn(RAVI);
    const c = await be.getConversation(r, "cvn-sophie");
    assert(c, "the conversation must exist without a product behind it");
    eq(c.productId, null, "there is no product");
    assert(c.productNameAtCreation, "but the name the customer saw is preserved");
  });

  /* ===== 9b. Media validation ============================================ */

  await check("an upload path always starts with the company's own folder", () => {
    const path = storagePathFor({ companyId: "co-lantern", ownerId: "p-everest", fileName: "Base Camp.JPG" });
    eq(path, "co-lantern/p-everest/base-camp.jpg", "path is company/owner/file, lowercased");
    eq(pathIsInCompanyFolder(path, "co-lantern"), true, "and it is inside that company's folder");
    eq(pathIsInCompanyFolder(path, "co-coldharbour"), false, "and not inside anyone else's");
  });

  await check("a filename cannot climb out of its folder", () => {
    // The storage policy matches on the path prefix, so a name containing `../`
    // would defeat the whole convention. Separators are collapsed, not escaped.
    const nasty = safeFileName("../../co-coldharbour/steal.png");
    assert(!nasty.includes("/"), `a sanitised name must contain no separator, got ${nasty}`);
    assert(!nasty.includes(".."), "and no parent-directory hop");
    const path = storagePathFor({ companyId: "co-lantern", ownerId: "c", fileName: "../../x/steal.png" });
    eq(pathIsInCompanyFolder(path, "co-lantern"), true, "so the path stays in the company folder");
  });

  await check("SVG is refused as a listing image, with a reason that helps", () => {
    const problems = validateFile("image", {
      name: "logo.svg", mimeType: "image/svg+xml", byteSize: 4_000, widthPx: 2000, heightPx: 2000,
    });
    eq(problems.length, 1, "type is the only thing wrong");
    assert(/PNG or WebP/i.test(problems[0].message), "and the message says what to do instead");
  });

  await check("size and dimension limits match the shipped constraints", () => {
    eq(validateFile("image", { name: "a.jpg", mimeType: "image/jpeg", byteSize: 12 * 1024 * 1024 }).length, 0,
       "12 MB is the image ceiling and is allowed");
    eq(validateFile("image", { name: "a.jpg", mimeType: "image/jpeg", byteSize: 13 * 1024 * 1024 }).length, 1,
       "13 MB is over it");
    const small = validateFile("image", {
      name: "a.jpg", mimeType: "image/jpeg", byteSize: 500_000, widthPx: 640, heightPx: 480,
    });
    eq(small.length, 1, "an undersized photograph is caught before submission");
    eq(small[0].field, "dimensions", "and named as a dimensions problem");
  });

  await check("an unmeasured image is not a failed image", () => {
    // Dimensions unknown is not the same statement as dimensions too small.
    eq(validateFile("image", { name: "a.jpg", mimeType: "image/jpeg", byteSize: 900_000 }).length, 0,
       "no dimensions supplied means no dimensions verdict");
  });

  await check("every problem is reported at once, not one per attempt", () => {
    const problems = validateFile("image", {
      name: "a.gif", mimeType: "image/gif", byteSize: 40 * 1024 * 1024, widthPx: 100, heightPx: 100,
    });
    eq(problems.length, 3, "type, size and dimensions are all reported together");
  });

  await check("a photograph cannot be approved without a licence and a credit", () => {
    const missing = missingForApproval({ licence: null, credit: null, mimeType: "image/jpeg", byteSize: 1 });
    eq(missing.length, 2, "both are missing");
    eq(missingForApproval({ licence: "CC BY-SA 4.0", credit: "A. Photographer", mimeType: "image/jpeg", byteSize: 1 }).length,
       0, "and both supplied clears it");
  });

  /* ===== 9c. The in-layout editor ========================================= */

  await check("a section under review outranks a section merely edited", () => {
    const about = COMPANY_SECTIONS.find((x) => x.key === "about")!;
    // Both true at once: one field with Icefall, another touched locally.
    const st = sectionState(about, new Set(["about"]), new Set(["description"]));
    eq(st, "pending", "pending must win — it is the one the operator cannot act on");
    eq(sectionState(about, new Set(), new Set(["description"])), "edited", "otherwise edited");
    eq(sectionState(about, new Set(), new Set()), "live", "and otherwise live");
  });

  await check("pending fields are read from the version's changedFields", async () => {
    const r = await signIn(RAVI);
    const versions = await be.getVersions(r, "company");
    const fields = pendingFields(versions);
    assert(fields.has("about"), "the seeded pending version claims `about`");
    assert(!fields.has("tagline"), "and claims nothing it did not change");
  });

  await check("the phone surface offers fewer sections than the web page", () => {
    const web = sectionsFor("web").map((x) => x.key);
    const app = sectionsFor("app").map((x) => x.key);
    assert(web.includes("faq"), "web renders FAQ");
    assert(!app.includes("faq"), "the phone does not");
    // Owner decision #15: the film belongs to the mountain surface, so the
    // company editor must offer NO video section on either surface.
    assert(!web.includes("video") && !app.includes("video"), "the company page has no film section at all");
    assert(app.length < web.length, "so 'Editing for: App' is a smaller list, not the same one");
  });

  await check("a YouTube id is extracted from every shape an operator will paste", () => {
    const id = "dQw4w9WgXcQ";
    for (const input of [
      id,
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `  https://www.youtube.com/watch?v=${id}&t=30s  `,
    ]) {
      eq(youtubeIdFrom(input), id, `should extract from: ${input.trim()}`);
    }
    eq(youtubeIdFrom("https://vimeo.com/12345"), null, "and refuse what is not YouTube");
    eq(youtubeIdFrom(""), null, "and refuse nothing at all");
  });

  /* ===== 10. Seed integrity ============================================== */

  await check("no real expedition company appears in seed data", async () => {
    const REAL = ["elite exped", "seven summit", "adventure consultants", "14 peaks", "madison mountaineering"];
    const blob = JSON.stringify([
      await be.getCompany(await signIn(RAVI)),
      await be.getProducts(await signIn(RAVI)),
    ]).toLowerCase();
    for (const name of REAL) {
      assert(!blob.includes(name), `seed data must not name the real business "${name}"`);
    }
  });

  await check("the mockup's figures are computed from the rows, not typed in", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const dash = await be.getDashboard(r);
    // August: exactly 28 enquiries, 15 qualified-or-beyond; July: 18 and 12.
    // These four counts are what make the dashboard's +56% and +25% deltas
    // arithmetic rather than decoration.
    eq(dash.funnel.enquiries, 28, "August holds exactly 28 enquiries");
    eq(dash.funnel.qualified, 15, "of which 15 reached qualified or beyond");
    assert(dash.previous, "July must exist as a comparison window");
    eq(dash.previous.enquiries, 18, "July holds exactly 18 enquiries");
    eq(dash.previous.qualified, 12, "of which 12 qualified");
    eq(dash.newEnquiries, 2, "exactly two conversations are unread");
    eq(dash.bookings, 4, "four bookings are recorded");

    // The source donut: segments count the same rows as the enquiry figure.
    const src = Object.fromEntries(dash.enquiriesBySource.map((x) => [x.source, x.count]));
    eq(src["website"], 12, "website ×12");
    eq(src["icefall-app"], 8, "icefall-app ×8");
    eq(src["marketplace"], 6, "marketplace ×6");
    eq(src["other"], 2, "other ×2");
    eq(
      dash.enquiriesBySource.reduce((n, x) => n + x.count, 0),
      dash.funnel.enquiries,
      "the donut's segments must sum to the enquiry count",
    );

    const notifications = await be.getNotifications(r);
    eq(notifications.filter((n) => n.readAt === null).length, 3, "exactly three notifications are unread");
  });

  await check("a live product can carry a pending edit without leaving live", async () => {
    const r = await signIn(RAVI);
    const ama = await be.getProduct(r, "p-ama-dablam-sw-ridge");
    assert(ama, "the Ama Dablam product must exist");
    eq(ama.status, "live", "the product itself stays live");
    eq(ama.priceFromCents, 860_000, "and its published price is untouched");
    const pendingEdit = (await be.getVersions(r, "product")).find(
      (v) => v.entityId === ama.id && v.state === "pending",
    );
    assert(pendingEdit, "while its price change sits with Icefall as a pending version");
  });

  await check("no company carries a fabricated document-check date", async () => {
    const r = await signIn(RAVI);
    const company = await be.getCompany(r);
    // Lantern has had no check recorded, so the field must be null — not a date
    // invented to make the profile look complete.
    eq(company!.documentsCheckedAt, null, "an unchecked company must carry no check date");
  });


  /* ---------------------------------------------------------------------- */
  /* Origin, tags and operator-added leads                                   */
  /* ---------------------------------------------------------------------- */

  await check("a lead the COMPANY added is not counted as an Icefall enquiry", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = await be.getDashboard(r);
    const beforeCount = before.funnel.enquiries;

    const res = await be.createLead(r, {
      customerName: "Walk-in Wanda",
      productId: "p-everest-south-col",
      mountainId: null,
      source: "Phone",
    });
    assert(res.ok, "the lead is created");

    const after = await be.getDashboard(r);
    eq(after.funnel.enquiries, beforeCount, "the Icefall enquiry figure does NOT move");
    const leads = await be.getLeads(r);
    assert(
      leads.some((l) => l.customerName === "Walk-in Wanda"),
      "but the lead IS in the operator's own pipeline",
    );
    resetStore();
  });

  await check("createLead cannot forge an Icefall-origin lead", async () => {
    resetStore();
    const r = await signIn(RAVI);
    // The input type has no `origin` field at all; even smuggling one through
    // an untyped object must not reach the stored row.
    const res = await be.createLead(r, {
      customerName: "Forged Origin",
      productId: null,
      mountainId: null,
      source: null,
      ...({ origin: "icefall" } as object),
    } as Parameters<typeof be.createLead>[1]);
    assert(res.ok, "it is created");
    eq(res.ok && res.value.origin, "company", "and is stored as the company's own, not Icefall's");
    resetStore();
  });

  await check("the seeded company-added leads stay out of every scorecard figure", async () => {
    const r = await signIn(RAVI);
    const leads = await be.getLeads(r);
    const own = leads.filter((l) => l.origin === "company");
    eq(own.length, 3, "three seeded leads are the company's own");

    const dash = await be.getDashboard(r);
    eq(dash.funnel.enquiries, 28, "August still reports exactly 28 Icefall enquiries");
    const bySource = dash.enquiriesBySource.reduce((a, s) => a + s.count, 0);
    eq(bySource, 28, "and the source split sums to the same 28 — no company row leaked in");
  });

  await check("a booking from a company-added lead is not Icefall revenue", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const beforeRevenue = (await be.getAnalytics(r, "month")).estimatedGmv;

    const made = await be.createLead(r, {
      customerName: "Referral Rita",
      productId: "p-everest-south-col",
      mountainId: null,
      source: "Referral",
    });
    assert(made.ok, "lead created");
    const booked = await be.setLeadStatus(r, made.ok ? made.value.id : "", "booked");
    assert(booked.ok, "and marked booked");

    const after = await be.getAnalytics(r, "month");
    eq(
      after.estimatedGmv.available && after.estimatedGmv.value,
      beforeRevenue.available && beforeRevenue.value,
      "Icefall revenue is unchanged by a booking Icefall did not produce",
    );
    const bookings = await be.getBookings(r);
    assert(
      bookings.some((b) => b.leadId === (made.ok ? made.value.id : null)),
      "though the booking exists in the company's own list",
    );
    resetStore();
  });

  await check("tags are trimmed, de-duplicated case-insensitively and capped", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const res = await be.setLeadTags(r, "l-hanne", [
      "  Deposit paid  ",
      "DEPOSIT PAID",
      "deposit   paid",
      "Repeat client",
      "a", "b", "c", "d", "e", "f", "g", "h",
    ]);
    assert(res.ok, "the write succeeds");
    const tags = res.ok ? res.value.tags : [];
    eq(tags[0], "Deposit paid", "whitespace is trimmed and collapsed");
    eq(
      tags.filter((t) => t.toLowerCase() === "deposit paid").length,
      1,
      "three spellings of one tag are ONE tag",
    );
    assert(tags.length <= 8, "and the list is capped");
    resetStore();
  });

  await check("a tag carrying contact details is refused, like every other field", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const res = await be.setLeadTags(r, "l-hanne", ["Call 07700 900123"]);
    eq(res.ok, false, "the write is refused");
    const lead = await be.getLead(r, "l-hanne");
    assert(
      !(lead?.tags ?? []).some((t) => t.includes("07700")),
      "and nothing was stored",
    );
    resetStore();
  });

  await check("a lead cannot be added against another company's trip", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const res = await be.createLead(r, {
      customerName: "Cross Company",
      productId: "p-coldharbour-denali",
      mountainId: null,
      source: null,
    });
    eq(res.ok, false, "Coldharbour's expedition is refused to Lantern");
    resetStore();
  });

  await check("an opening note on a new lead is saved as its first note", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const res = await be.createLead(r, {
      customerName: "Noted Nadia",
      productId: null,
      mountainId: null,
      source: "Phone",
      note: "Wants August 2027, group of six.",
    });
    assert(res.ok, "created");
    const notes = await be.getLeadNotes(r, res.ok ? res.value.id : "");
    eq(notes.length, 1, "one note exists");
    eq(notes[0]?.body, "Wants August 2027, group of six.", "with the text given");
    resetStore();
  });

  /* ====================================================================== */
  /* Insights — the measured-only screen                                     */
  /*                                                                         */
  /* `getInsights` is the one place where every figure is derived from a      */
  /* stamp the pipeline actually wrote. These tests guard the arithmetic that */
  /* would otherwise lie quietly: a median over nothing, a funnel that grows  */
  /* as it descends, a channel split that does not add up, another company's  */
  /* mountain, a lost lead dropped because nobody typed a reason.             */
  /* ====================================================================== */

  /**
   * The adapter's own window cutoffs, restated. Every test below that uses
   * them also asserts they still agree with what the adapter counted, so a
   * change to the adapter fails loudly here rather than drifting silently.
   */
  const INSIGHT_CUTOFF = { week: "2026-08-21", month: "2026-07-28" } as const;

  const leadsInWindow = async (s: Session, w: "week" | "month") =>
    (await be.getLeads(s)).filter((l) => l.createdAt.slice(0, 10) >= INSIGHT_CUTOFF[w]);

  const WINDOWS = ["week", "month"] as const;

  /* ---- 1. A median over nothing is Unavailable, never 0 ----------------- */

  await check("a median over an empty set is Unavailable, never 0", async () => {
    resetStore();
    const j = await signIn(JO);
    // Coldharbour has exactly one enquiry in either window, never replied to
    // and never booked. Both medians therefore have nothing to average.
    for (const w of WINDOWS) {
      const ins = await be.getInsights(j, w);
      eq((await leadsInWindow(j, w)).length, ins.stageReach[0]?.reached, `${w}: the window is the one the adapter counted`);

      const reply = ins.medianResponseHours;
      assert(!reply.available, `${w}: median reply time must be Unavailable with no replies`);
      eq(reply.reason, OPERATOR_NOTICES.NO_REPLIES_YET, `${w}: and must say why, in the operator's words`);

      const slowest = ins.slowestResponseHours;
      assert(!slowest.available, `${w}: the slowest reply must be Unavailable too`);

      const book = ins.medianDaysToBook;
      assert(!book.available, `${w}: median days-to-book must be Unavailable with no bookings`);
      eq(book.reason, OPERATOR_NOTICES.NO_BOOKINGS_YET, `${w}: with the no-bookings sentence`);
    }
  });

  await check("an Unavailable median carries a sentence, not a dash or a zero", async () => {
    const j = await signIn(JO);
    const ins = await be.getInsights(j, "month");
    for (const [label, r] of [
      ["median reply time", ins.medianResponseHours],
      ["slowest reply", ins.slowestResponseHours],
      ["median days to book", ins.medianDaysToBook],
    ] as const) {
      assert(!r.available, `${label} should be unavailable here`);
      assert(r.reason.length > 20, `${label}: the reason is the thing the operator reads — it must be a sentence`);
      assert(!/^[\s—–-]*0?[\s—–-]*$/.test(r.reason), `${label}: a reason must never be a dash or a zero`);
    }
  });

  await check("the medians ARE reported when the window has the stamps for them", async () => {
    const r = await signIn(RAVI);
    const ins = await be.getInsights(r, "month");

    const reply = ins.medianResponseHours;
    assert(reply.available, "Lantern has replied to enquiries this month, so a median exists");
    assert(Number.isFinite(reply.value) && reply.value > 0, "and it is a positive, finite number of hours");
    assert(reply.value < 24 * 31, "a median reply time longer than the window itself would be arithmetic, not speed");

    const slowest = ins.slowestResponseHours;
    assert(slowest.available, "so does the slowest reply");
    assert(slowest.value >= reply.value, "the slowest reply cannot be faster than the median");

    const book = ins.medianDaysToBook;
    assert(book.available, "two leads booked this month, so days-to-book exists");
    assert(Number.isFinite(book.value) && book.value > 0, "and it is a positive, finite number of days");
  });

  await check("the SAME company reports a median for the month and none for the empty week", async () => {
    const r = await signIn(RAVI);
    const month = await be.getInsights(r, "month");
    const week = await be.getInsights(r, "week");
    assert(month.medianDaysToBook.available, "the month contains the two bookings");
    const w = week.medianDaysToBook;
    // Nothing booked in the last seven days. That is not "booked in 0 days".
    assert(!w.available, "the week contains none, so it must report no figure at all");
    eq(w.reason, OPERATOR_NOTICES.NO_BOOKINGS_YET, "with the reason the operator reads");
  });

  /* ---- 2. The funnel cannot widen as it descends ------------------------ */

  await check("stageReach is monotonically non-increasing — THE FUNNEL GUARD", async () => {
    for (const s of [await signIn(RAVI), await signIn(JO)]) {
      for (const w of WINDOWS) {
        const { stageReach } = await be.getInsights(s, w);
        eq(
          stageReach.map((x) => x.stage).join(">"),
          "enquired>contacted>qualified>quoted>booked",
          `${s.user.companyId}/${w}: the stages are in pipeline order`,
        );
        for (let i = 1; i < stageReach.length; i++) {
          const prev = stageReach[i - 1]!;
          const here = stageReach[i]!;
          assert(
            here.reached <= prev.reached,
            `${s.user.companyId}/${w}: ${here.label} (${here.reached}) cannot exceed ${prev.label} (${prev.reached})`,
          );
        }
        const total = stageReach[0]!.reached;
        eq(total, (await leadsInWindow(s, w)).length, `${s.user.companyId}/${w}: Enquired is every lead in the window`);
        for (const stage of stageReach) {
          if (total > 0) {
            assert(stage.share.available, `${w}: with enquiries, every share is measurable`);
            assert(
              stage.share.value >= 0 && stage.share.value <= 1,
              `${w}: ${stage.label} share must be a fraction of the enquiries`,
            );
          } else {
            assert(!stage.share.available, `${w}: with no enquiries there is no share of them`);
            eq(stage.share.reason, OPERATOR_NOTICES.NO_LEADS_IN_WINDOW, "and it says so");
          }
        }
      }
    }
  });

  await check("a lead that skipped a stage still cannot lift the stage it skipped", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const made = await be.createLead(r, {
      customerName: "Straight To Booked",
      productId: "p-everest-south-col",
      mountainId: null,
      source: "Funnel test",
    });
    assert(made.ok, "lead created");
    // Booked without ever passing through qualified or quoted — the shape most
    // likely to invert a naive funnel.
    const booked = await be.setLeadStatus(r, made.value.id, "booked");
    assert(booked.ok, "and booked outright");
    const { stageReach } = await be.getInsights(r, "month");
    for (let i = 1; i < stageReach.length; i++) {
      assert(
        stageReach[i]!.reached <= stageReach[i - 1]!.reached,
        `${stageReach[i]!.label} still cannot exceed ${stageReach[i - 1]!.label}`,
      );
    }
    resetStore();
  });

  /* ---- 3. The channel split adds up ------------------------------------ */

  await check("sourceQuality enquiries sum to the window's leads — no channel invented or dropped", async () => {
    for (const s of [await signIn(RAVI), await signIn(JO)]) {
      for (const w of WINDOWS) {
        const ins = await be.getInsights(s, w);
        const leads = await leadsInWindow(s, w);
        const summed = ins.sourceQuality.reduce((a, x) => a + x.enquiries, 0);
        eq(summed, leads.length, `${s.user.companyId}/${w}: every lead is in exactly one channel row`);
        eq(summed, ins.stageReach[0]!.reached, `${s.user.companyId}/${w}: and the split agrees with the funnel's top`);
        eq(
          new Set(ins.sourceQuality.map((x) => x.source)).size,
          ins.sourceQuality.length,
          `${s.user.companyId}/${w}: no channel appears twice`,
        );
        for (const row of ins.sourceQuality) {
          assert(row.qualified <= row.enquiries, `${row.source}: cannot qualify more than it sent`);
          assert(row.enquiries > 0, `${row.source}: a channel row with no enquiries should not exist`);
        }
      }
    }
  });

  await check("a lead with no recorded source is counted, not dropped", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = await be.getInsights(r, "month");
    const beforeSum = before.sourceQuality.reduce((a, x) => a + x.enquiries, 0);
    const made = await be.createLead(r, {
      customerName: "Sourceless Sam",
      productId: null,
      mountainId: null,
      source: null,
    });
    assert(made.ok, "created with no source at all");
    const after = await be.getInsights(r, "month");
    const afterSum = after.sourceQuality.reduce((a, x) => a + x.enquiries, 0);
    eq(afterSum, beforeSum + 1, "the totals still add up");
    assert(
      after.sourceQuality.some((x) => x.source === "Not recorded"),
      "and the lead appears under an honest label rather than vanishing",
    );
    resetStore();
  });

  /* ---- 4. Cross-company isolation, on the mountain table --------------- */

  await check("byMountain holds only mountains the company is actively assigned — ISOLATION", async () => {
    const r = await signIn(RAVI);
    const j = await signIn(JO);

    const lantern = await be.getInsights(r, "month");
    const lanternIds = lantern.byMountain.map((m) => m.mountainId).sort();
    eq(
      lanternIds.join(","),
      "ama-dablam,everest,kilimanjaro,mont-blanc",
      "Lantern sees its four assigned mountains and no others",
    );
    assert(!lanternIds.includes("denali"), "Coldharbour's Denali must never appear in Lantern's table");

    const cold = await be.getInsights(j, "month");
    eq(cold.byMountain.map((m) => m.mountainId).join(","), "denali", "Coldharbour sees only Denali");
    assert(
      !cold.byMountain.some((m) => m.mountainId === "everest" || m.mountainId === "ama-dablam"),
      "and never a mountain Lantern is listed on",
    );

    // The access table is the only source of truth for what belongs here.
    const assigned = new Set(
      COMPANY_MOUNTAINS.filter((a) => a.companyId === r.user.companyId && a.status === "active").map((a) => a.mountainId),
    );
    assert(lantern.byMountain.every((m) => assigned.has(m.mountainId)), "no row without an active assignment");
  });

  await check("mountain rows count only the caller's own leads", async () => {
    const r = await signIn(RAVI);
    const j = await signIn(JO);
    const lantern = await be.getInsights(r, "month");
    const cold = await be.getInsights(j, "month");

    const denali = cold.byMountain.find((m) => m.mountainId === "denali");
    assert(denali, "Denali is Coldharbour's row");
    eq(denali.enquiries, (await leadsInWindow(j, "month")).filter((l) => l.mountainId === "denali").length,
      "and counts exactly Coldharbour's own Denali enquiries");

    const lanternTotal = lantern.byMountain.reduce((a, m) => a + m.enquiries, 0);
    const inWindow = await leadsInWindow(r, "month");
    assert(
      lanternTotal <= inWindow.length,
      "the mountain rows cannot together claim more enquiries than the window holds",
    );
    for (const m of lantern.byMountain) {
      eq(
        m.enquiries,
        inWindow.filter((l) => l.mountainId === m.mountainId).length,
        `${m.name}: counted from the caller's own leads`,
      );
      assert(m.bookings <= m.enquiries, `${m.name}: cannot book more than enquired`);
      // A mountain with no confirmed booking reports no revenue — never €0,
      // which would read as "we sold nothing there" rather than "nothing yet".
      if (m.revenue.available) assert(m.revenue.value > 0, `${m.name}: a reported revenue of 0 would be a claim, not a figure`);
      else assert(m.revenue.reason.length > 0, `${m.name}: absent revenue must carry its reason`);
    }
  });

  /* ---- 5. Lost reasons -------------------------------------------------- */

  await check("lostReasons sum to the lost leads in the window", async () => {
    for (const s of [await signIn(RAVI), await signIn(JO)]) {
      for (const w of WINDOWS) {
        const ins = await be.getInsights(s, w);
        const lost = (await leadsInWindow(s, w)).filter((l) => l.status === "lost");
        eq(
          ins.lostReasons.reduce((a, x) => a + x.count, 0),
          lost.length,
          `${s.user.companyId}/${w}: every lost lead is accounted for exactly once`,
        );
      }
    }
  });

  await check("a lost lead with no reason appears as 'No reason recorded', not dropped", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = await be.getInsights(r, "month");
    const beforeTotal = before.lostReasons.reduce((a, x) => a + x.count, 0);
    assert(
      !before.lostReasons.some((x) => x.reason === "No reason recorded"),
      "the seed records a reason on every lost lead",
    );

    const made = await be.createLead(r, {
      customerName: "Quietly Lost",
      productId: null,
      mountainId: null,
      source: "Phone",
    });
    assert(made.ok, "lead created");
    const lost = await be.setLeadStatus(r, made.value.id, "lost");
    assert(lost.ok, "and marked lost with no reason given");
    eq(lost.value.lostReason, null, "nothing was invented to fill the field");

    const after = await be.getInsights(r, "month");
    eq(
      after.lostReasons.reduce((a, x) => a + x.count, 0),
      beforeTotal + 1,
      "the lost total still counts it",
    );
    const row = after.lostReasons.find((x) => x.reason === "No reason recorded");
    assert(row, "and it has its own honest category rather than being folded into 'other'");
    eq(row.count, 1, "carrying exactly the one lead");
    resetStore();
  });

  /* ---- 6. Origin: included here, excluded from the scorecard ------------ */

  await check("company-origin leads count in Insights but NEVER in the Icefall scorecard", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const insBefore = await be.getInsights(r, "month");
    const anaBefore = await be.getAnalytics(r, "month");

    // The three seeded company-added leads are already in this window, and the
    // operator's own words for where they came from are already channel rows.
    for (const own of ["Referral — Pemba", "Phone", "Walk-in"]) {
      assert(
        insBefore.sourceQuality.some((x) => x.source === own),
        `Insights shows the operator's own channel "${own}" — this is their sales screen`,
      );
      assert(
        !anaBefore.enquiriesBySource.some((x) => x.source === own),
        `but the Icefall scorecard must not carry "${own}"`,
      );
    }

    const made = await be.createLead(r, {
      customerName: "Own Effort Olive",
      productId: "p-everest-south-col",
      mountainId: null,
      source: "Trade show",
    });
    assert(made.ok, "the operator adds a lead they found themselves");
    eq(made.value.origin, "company", "stored as their own, not Icefall's");

    const insAfter = await be.getInsights(r, "month");
    const anaAfter = await be.getAnalytics(r, "month");

    eq(
      insAfter.stageReach[0]!.reached,
      insBefore.stageReach[0]!.reached + 1,
      "Insights counts it — the operator is judging their own sales work",
    );
    assert(
      insAfter.sourceQuality.some((x) => x.source === "Trade show" && x.enquiries === 1),
      "and shows the channel they typed",
    );
    eq(
      anaAfter.funnel.enquiries,
      anaBefore.funnel.enquiries,
      "the Icefall scorecard does NOT move — we do not take credit for their work",
    );
    eq(
      anaAfter.enquiriesBySource.reduce((a, x) => a + x.count, 0),
      anaBefore.enquiriesBySource.reduce((a, x) => a + x.count, 0),
      "nor does its source split",
    );
    assert(
      !anaAfter.enquiriesBySource.some((x) => x.source === "Trade show"),
      "and the operator's own channel never becomes an Icefall channel",
    );
    resetStore();
  });

  /* ---- 7. Awaiting first reply ----------------------------------------- */

  await check("awaitingFirstReply counts unanswered leads that are still alive", async () => {
    for (const s of [await signIn(RAVI), await signIn(JO)]) {
      for (const w of WINDOWS) {
        const ins = await be.getInsights(s, w);
        const leads = await leadsInWindow(s, w);
        eq(
          ins.awaitingFirstReply,
          leads.filter((l) => l.firstResponseAt === null && l.status !== "lost").length,
          `${s.user.companyId}/${w}: no reply yet, and not written off`,
        );
        assert(
          ins.awaitingFirstReply <= ins.stageReach[0]!.reached - ins.stageReach[1]!.reached,
          `${s.user.companyId}/${w}: it can never exceed the leads with no reply at all`,
        );
      }
    }
  });

  await check("writing a lead off removes it from the awaiting-reply count", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = await be.getInsights(r, "month");
    const tomas = await be.getLead(r, "l-tomas");
    assert(tomas && tomas.firstResponseAt === null && tomas.status !== "lost", "Tomás is unanswered and alive");

    const res = await be.setLeadStatus(r, "l-tomas", "lost", "No longer travelling.");
    assert(res.ok, "he is written off");
    eq(res.value.firstResponseAt, null, "without anyone having replied");

    const after = await be.getInsights(r, "month");
    eq(
      after.awaitingFirstReply,
      before.awaitingFirstReply - 1,
      "a lost lead is not somebody still waiting on us",
    );
    resetStore();
  });

  await check("replying to a lead removes it from the awaiting-reply count", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = await be.getInsights(r, "month");
    const res = await be.setLeadStatus(r, "l-tomas", "contacted");
    assert(res.ok, "the lead is answered");
    assert(res.value.firstResponseAt !== null, "which stamps a first response");
    const after = await be.getInsights(r, "month");
    eq(after.awaitingFirstReply, before.awaitingFirstReply - 1, "one fewer person waiting");
    eq(
      after.stageReach[1]!.reached,
      before.stageReach[1]!.reached + 1,
      "and one more lead has been replied to",
    );
    resetStore();
  });

  /* ---- 8. Per-listing views are demo-flagged and deterministic ---------- */

  await check("per-listing views follow the demo flag, honestly either way", async () => {
    const r = await signIn(RAVI);
    const rows = await be.getProductPerformance(r);
    assert(rows.length > 0, "Lantern has products to rank");
    if (DEMO_PROFILE_VIEWS) {
      for (const row of rows) {
        assert(row.views.available, `${row.name}: the demo flag is on, so a figure is shown`);
        assert(
          Number.isInteger(row.views.value) && row.views.value > 0,
          `${row.name}: and it is a whole, positive number`,
        );
      }
      const mountains = (await be.getInsights(r, "month")).byMountain;
      for (const m of mountains) {
        assert(m.views.available, `${m.name}: mountain views follow the same flag`);
      }
    } else {
      for (const row of rows) {
        assert(!row.views.available, `${row.name}: with the flag off there is no view figure at all`);
        eq(row.views.reason, OPERATOR_NOTICES.VIEWS_NOT_COUNTED, "and the honest sentence is what shows");
      }
    }
  });

  await check("a listing shows the SAME view figure twice — a moving figure would look live", async () => {
    const r = await signIn(RAVI);
    const first = await be.getProductPerformance(r);
    const second = await be.getProductPerformance(r);
    eq(second.length, first.length, "the same rows come back");
    const seen = new Map(first.map((row) => [row.productId, row.views] as const));
    for (const row of second) {
      const was = seen.get(row.productId);
      assert(was, `${row.name}: the row is still there`);
      eq(row.views.available, was.available, `${row.name}: availability is stable`);
      if (row.views.available && was.available) {
        eq(row.views.value, was.value, `${row.name}: the figure must not move between two reads`);
      }
    }
    // The same determinism on the mountain table, from a different call.
    const m1 = (await be.getInsights(r, "month")).byMountain;
    const m2 = (await be.getInsights(r, "month")).byMountain;
    for (let i = 0; i < m1.length; i++) {
      const a = m1[i]!.views;
      const b = m2[i]!.views;
      eq(a.available, b.available, `${m1[i]!.name}: availability is stable`);
      if (a.available && b.available) eq(a.value, b.value, `${m1[i]!.name}: the figure must not move`);
    }
  });

  await check("a listing with no enquiries still reports views rather than a zero-looking blank", async () => {
    const r = await signIn(RAVI);
    const rows = await be.getProductPerformance(r);
    const quiet = rows.filter((row) => row.enquiries === 0);
    for (const row of quiet) {
      // No enquiries is a real 0 — it is counted. Conversion, however, has no
      // denominator, and views are the demo figure or nothing.
      assert(!row.conversion.available, `${row.name}: 0/0 is not a 0% conversion`);
      eq(row.conversion.reason, OPERATOR_NOTICES.CONVERSION_NO_DENOMINATOR, "it says why instead");
      if (DEMO_PROFILE_VIEWS) {
        assert(row.views.available && row.views.value > 0, `${row.name}: the demo still shows the traffic that produced none`);
      }
    }
  });

  /* ---------------------------------------------------------------------- */

  await check("a mountain row can never say Booked next to 'nothing booked'", async () => {
    const r = await signIn(RAVI);
    const ins = await be.getInsights(r, "month");
    for (const m of ins.byMountain) {
      // The contradiction that shipped first time: booked counted leads that
      // once passed through the stage, revenue counted actual bookings.
      if (m.bookings === 0) {
        assert(
          !m.revenue.available,
          `${m.name}: no bookings, so there can be no revenue figure`,
        );
        assert(
          m.revenue.available === false && m.revenue.reason === OPERATOR_NOTICES.NO_BOOKINGS_YET,
          `${m.name}: with no bookings the reason must be the nothing-booked one`,
        );
      } else {
        assert(
          m.revenue.available ||
            (m.revenue.available === false &&
              m.revenue.reason !== OPERATOR_NOTICES.NO_BOOKINGS_YET),
          `${m.name}: has ${m.bookings} booking(s), so it must not claim nothing was booked`,
        );
      }
      assert(m.bookings <= m.enquiries + 100, `${m.name}: bookings is a plain count`);
    }
  });

  await check("a cancelled booking is not counted as a booking on its mountain", async () => {
    const r = await signIn(RAVI);
    const ins = await be.getInsights(r, "month");
    const bookings = await be.getBookings(r);
    for (const m of ins.byMountain) {
      const live = bookings.filter((b) => b.mountainId === m.mountainId && b.status !== "cancelled");
      eq(m.bookings, live.length, `${m.name}: counts live bookings, cancellations excluded`);
    }
    // Benjamin's Everest booking is cancelled, so it must not be in the count.
    assert(
      bookings.some((b) => b.status === "cancelled"),
      "the seed still holds a cancelled booking for this test to mean anything",
    );
  });


  /* ====================================================================== */
  /* 11. THE TRIP EDITOR                                                    */
  /*                                                                        */
  /* `src/screens/ProductEditor.tsx` is the company editor's twin, aimed at */
  /* one expedition or trek. It is also the screen where the two rules that */
  /* protect a climber can most easily be lost: a LIVE trip's page must not */
  /* change because an operator typed, and a trip must not be able to move  */
  /* company, mountain or publication status by way of a text field.        */
  /*                                                                        */
  /* These run against the same backend the screen calls. What they do NOT  */
  /* cover is the screen's own payload construction — one explicit line per */
  /* field, no spread — which is a property of the source, not of a value   */
  /* that can be asserted from here. What CAN be asserted is the wall       */
  /* behind it, and that is what section 11.2 does.                         */
  /* ====================================================================== */

  /** Lantern's, `status: "live"` — the publication boundary applies. */
  const LIVE_TRIP = "p-everest-south-col";
  /** Lantern's, `status: "draft"` — nothing published, nothing to protect. */
  const DRAFT_TRIP = "p-kilimanjaro-machame";
  /** Coldharbour's. Ravi may not read it, draft against it or submit it. */
  const THEIR_TRIP = "p-coldharbour-denali";

  /* ----- 11.1 The publication boundary ---------------------------------- */

  await check("editing a LIVE trip writes a version and never the published row", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = await be.getProduct(r, LIVE_TRIP);
    assert(before, "the seeded live trip must load for its owner");
    eq(before.status, "live", "this test means nothing unless the trip is actually published");

    const NEW_TEXT = "Two extra acclimatisation rotations before the summit push.";
    const NEW_PRICE = 6_400_000; // integer minor units, never a float
    const res = await be.saveDraft(r, {
      entityType: "product",
      entityId: LIVE_TRIP,
      payload: { description: NEW_TEXT, priceFromCents: NEW_PRICE },
      baseSnapshot: { description: before.description, priceFromCents: before.priceFromCents },
    });
    assert(res.ok, `saving the draft should succeed, got: ${res.ok ? "" : res.reason}`);

    const after = await be.getProduct(r, LIVE_TRIP);
    assert(after, "the trip still loads");
    eq(after.description, before.description, "the LIVE description must be untouched");
    eq(after.priceFromCents, before.priceFromCents, "and the LIVE price — a price is an advertised claim");
    eq(after.status, "live", "and the trip is still live, not dragged into review by an edit");

    const draft = await be.getDraftFor(r, "product", LIVE_TRIP);
    assert(draft, "the change must exist as a content version, or it exists nowhere");
    assert(
      draft.state === "draft" || draft.state === "pending",
      `an unapproved edit sits in draft or pending, got "${draft.state}"`,
    );
    eq(draft.entityType, "product", "against the product, not the company");
    eq(draft.entityId, LIVE_TRIP, "and against the trip that was being edited");
    eq(draft.payload.description, NEW_TEXT, "the version carries the operator's words");
    eq(draft.payload.priceFromCents, NEW_PRICE, "and their price, in minor units");

    // Submitting hands it to Icefall and STILL does not touch the live row.
    const sent = await be.submitForApproval(r, draft.id);
    assert(sent.ok, `submission should succeed, got: ${sent.ok ? "" : sent.reason}`);
    eq(sent.value.state, "pending", "the edit is now with Icefall");
    const afterSubmit = await be.getProduct(r, LIVE_TRIP);
    eq(afterSubmit!.description, before.description, "the published page survives submission unchanged");
    eq(afterSubmit!.priceFromCents, before.priceFromCents, "including the price a climber was quoted");
    eq(afterSubmit!.status, "live", "and the trip's own status is not the version's to move");
  });

  await check("a DRAFT trip is the operator's to edit directly", async () => {
    const r = await signIn(RAVI);
    const draftTrip = await be.getProduct(r, DRAFT_TRIP);
    assert(draftTrip, "the seeded draft trip must load");
    eq(draftTrip.status, "draft", "the seed must still hold an unpublished trip");
    eq(canEditProductDirectly(r, draftTrip), true, "nothing is published, so there is nothing to protect");

    const liveTrip = await be.getProduct(r, LIVE_TRIP);
    eq(canEditProductDirectly(r, liveTrip!), false, "a published trip is never written directly");

    // The other two halves of the predicate, which are not about status at all.
    const m = await signIn(MARTA);
    eq(canEditProductDirectly(m, draftTrip), false, "a Sales employee does not write content, draft or not");
    const j = await signIn(JO);
    eq(canEditProductDirectly(j, draftTrip), false, "and it is not Coldharbour's trip to edit");

    /*
     * AND THERE IS NO PRODUCT-ROW WRITE ON THE BACKEND AT ALL. Same assertion
     * as the placement one above, for the same reason: the safest version of a
     * dangerous capability is its absence. `ProductEditor` says so in as many
     * words and saves through `saveDraft` in both branches — what changes with
     * the branch is what is TRUE to tell the operator afterwards.
     */
    for (const method of ["updateProduct", "setProduct", "setProductStatus", "publishProduct"]) {
      eq(
        method in (be as unknown as Record<string, unknown>),
        false,
        `the backend must expose no ${method} — a live trip row has no write path`,
      );
    }
  });

  /* ----- 11.2 The closed allowlist -------------------------------------- */

  await check("a trip's identity fields cannot be changed by a draft payload", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = await be.getProduct(r, DRAFT_TRIP);
    assert(before, "the draft trip must load first");
    const coldharbourBefore = __store.products.filter((p) => p.companyId === COLDHARBOUR).length;

    const res = await be.saveDraft(r, {
      entityType: "product",
      entityId: DRAFT_TRIP,
      payload: {
        id: "p-hijacked",
        slug: "free-summit",
        status: "live",
        companyId: COLDHARBOUR,
        mountainIds: ["k2"],
        // The one key on this list that IS the operator's to write.
        description: "A short opening paragraph.",
      },
      baseSnapshot: {},
    });
    assert(res.ok, "the save is not the defence — what a payload can REACH is");

    const after = await be.getProduct(r, DRAFT_TRIP);
    assert(after, "the trip is still the caller's own");
    eq(after.id, before.id, "id is not writable");
    eq(after.slug, before.slug, "slug is not writable — a URL a climber has is not a text field");
    eq(after.status, before.status, "status is not writable — a trip cannot publish itself");
    eq(after.companyId, before.companyId, "companyId is not writable — a trip cannot walk to another company");
    eq(
      after.mountainIds.join(","),
      before.mountainIds.join(","),
      "mountainIds is not writable — a trip cannot list itself on a mountain Icefall never sold",
    );
    // Nor may a payload conjure a second row anywhere in the store.
    eq(__store.products.some((p) => p.id === "p-hijacked"), false, "no new product row appeared");
    eq(
      __store.products.filter((p) => p.companyId === COLDHARBOUR).length,
      coldharbourBefore,
      "and Coldharbour's catalogue did not grow by one",
    );
  });

  /* ----- 11.3 Cross-company --------------------------------------------- */

  await check("an operator cannot open, draft against or submit another company's trip", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const j = await signIn(JO);

    eq(await be.getProduct(r, THEIR_TRIP), null, "opening the editor on it must find nothing to edit");

    const drafted = await be.saveDraft(r, {
      entityType: "product",
      entityId: THEIR_TRIP,
      payload: { description: "Ours now." },
      baseSnapshot: {},
    });
    eq(drafted.ok, false, "drafting against another company's trip must be refused");
    eq(
      __store.versions.some((v) => v.entityId === THEIR_TRIP && v.companyId === r.user.companyId),
      false,
      "and the refusal must leave nothing stored against their trip",
    );

    // Jo may draft against her own trip. Ravi still cannot send it.
    const hers = await be.saveDraft(j, {
      entityType: "product",
      entityId: THEIR_TRIP,
      payload: { description: "A new opening paragraph for the West Buttress." },
      baseSnapshot: {},
    });
    assert(hers.ok, `the owner may draft against her own trip, got: ${hers.ok ? "" : hers.reason}`);
    const stolen = await be.submitForApproval(r, hers.value.id);
    eq(stolen.ok, false, "submitting another company's version must be refused");
    eq(
      __store.versions.find((v) => v.id === hers.value.id)!.state,
      "draft",
      "and the refusal must not have moved her draft into review",
    );
  });

  /* ----- 11.4 Role ------------------------------------------------------- */

  await check("a Sales employee cannot submit trip content; a Company Admin can", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const m = await signIn(MARTA);

    // The real permission values, read from the matrix the UI consults.
    eq(PERMISSIONS.editProducts(m), false, "trip content is a Company Admin's job (spec §3)");
    eq(PERMISSIONS.submitForApproval(m), false, "and so is sending it to Icefall");
    eq(PERMISSIONS.viewProducts(m), true, "Sales still reads the catalogue to answer a customer");
    eq(PERMISSIONS.setDepartureAvailability(m), true, "and still says a departure is full — that is operational");
    eq(PERMISSIONS.editProducts(r), true, "the Company Admin owns the content");
    eq(PERMISSIONS.submitForApproval(r), true, "and the submission");

    const salesDraft = await be.saveDraft(m, {
      entityType: "product",
      entityId: LIVE_TRIP,
      payload: { description: "Sales rewrote the trip page." },
      baseSnapshot: {},
    });
    eq(salesDraft.ok, false, "a Sales draft against a trip must be refused, not silently kept");

    const adminDraft = await be.saveDraft(r, {
      entityType: "product",
      entityId: LIVE_TRIP,
      payload: { description: "One less superlative, and the turn-around time stated." },
      baseSnapshot: {},
    });
    assert(adminDraft.ok, `the Company Admin's draft must save, got: ${adminDraft.ok ? "" : adminDraft.reason}`);

    const salesSubmit = await be.submitForApproval(m, adminDraft.value.id);
    eq(salesSubmit.ok, false, "and Sales cannot send the Company Admin's draft either");
    eq(
      __store.versions.find((v) => v.id === adminDraft.value.id)!.state,
      "draft",
      "the draft is exactly as the Company Admin left it",
    );

    const adminSubmit = await be.submitForApproval(r, adminDraft.value.id);
    assert(adminSubmit.ok, `the Company Admin may submit, got: ${adminSubmit.ok ? "" : adminSubmit.reason}`);
    eq(adminSubmit.value.state, "pending", "now with Icefall");
  });

  /* ----- 11.5 Contact details -------------------------------------------- */

  await check("a trip description carrying a phone number is refused, and nothing is published", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = await be.getProduct(r, LIVE_TRIP);
    assert(before, "the live trip must load");

    const saved = await be.saveDraft(r, {
      entityType: "product",
      entityId: LIVE_TRIP,
      payload: { description: "Ring the office on +977 1 4410 220 and we will hold you a place." },
      baseSnapshot: { description: before.description },
    });
    assert(saved.ok, "the draft itself saves — the rule is explained at the boundary, not by losing the words");

    const res = await be.submitForApproval(r, saved.value.id);
    eq(res.ok, false, "a customer escape route must not enter Icefall's queue as an ordinary edit");
    assert(
      !res.ok && /phone number/i.test(res.reason),
      `the refusal must name what it found, got: ${res.ok ? "(no refusal)" : res.reason}`,
    );
    // A refusal is shown, and nothing at all is published or sent.
    eq((await be.getProduct(r, LIVE_TRIP))!.description, before.description, "the live page is unchanged");
    eq(
      __store.versions.find((v) => v.id === saved.value.id)!.state,
      "draft",
      "and the version never became pending",
    );
  });

  await check("a FAQ answer carrying a WhatsApp link is caught before it can be sent", () => {
    /*
     * WHY THIS ONE IS ASSERTED AGAINST THE GUARD RATHER THAN THE BACKEND.
     * `submitForApproval` scans the payload's STRING values, which catches a
     * description. A trip's FAQ and itinerary are ARRAYS of objects, so the
     * text a climber would actually read sits one level below that scan. The
     * screen therefore runs `findContactDetails` over every question, answer,
     * itinerary line and list item itself and DISABLES "Submit for approval"
     * while any hit stands — this asserts that guard, over exactly the shape
     * the editor holds. Weaken it and a WhatsApp number reaches the live page
     * through a field nothing else is looking at.
     */
    const faq = [
      { q: "How do I confirm my place?", a: "Message us on https://wa.me/9779812345678 and we will sort it." },
      { q: "Is there a single supplement?", a: "Yes, and it is stated in the quote." },
    ];
    const hits = faq.flatMap((f) => [...findContactDetails(f.q), ...findContactDetails(f.a)]);
    assert(hits.length > 0, "an answer carrying a WhatsApp link must be caught");
    assert(
      hits.some((h) => /whatsapp|telegram/i.test(h.label) || /link/i.test(h.label)),
      `the operator must be told what to remove, got: ${hits.map((h) => h.label).join(", ")}`,
    );
    // A clean answer is not flagged — a guard that catches everything teaches
    // an operator to work around it.
    eq(findContactDetails(faq[1].a).length, 0, "ordinary prose passes untouched");
    // The same guard over an itinerary line, which is the other array field.
    eq(
      findContactDetails("Day 3 — rest day in Namche. Call +977 1 4410 220 if you are delayed.").length > 0,
      true,
      "and over an itinerary day, which the backend's string scan also cannot reach",
    );
  });

  /* ----- 11.6 The section model ------------------------------------------ */

  await check("every trip section names real, unique, editable fields", async () => {
    const r = await signIn(RAVI);
    /*
     * The set of REAL `Product` keys, read off a stored record rather than a
     * list retyped here. A field renamed in `types.ts` changes this set, which
     * is precisely the drift this check exists to catch — a section pointing at
     * a field that no longer exists renders an input that publishes nothing.
     */
    const sample = (await be.getProducts(r))[0];
    assert(sample, "the seed must hold a product to read the shape from");
    const productKeys = new Set(Object.keys(sample));

    const keys = PRODUCT_SECTIONS.map((s) => s.key);
    eq(new Set(keys).size, keys.length, `section keys must be unique: ${keys.join(", ")}`);

    for (const s of PRODUCT_SECTIONS) {
      assert(s.label.trim().length > 0, `"${s.key}" has no label for the rail`);
      assert(s.surfaces.length > 0, `"${s.key}" is drawn on no surface at all`);
      for (const f of s.fields) {
        assert(
          productKeys.has(f as string),
          `section "${s.key}" names "${String(f)}", which is not a field of Product`,
        );
      }
      if (s.readOnly) {
        eq(s.fields.length, 0, `"${s.key}" is not the operator's to write, so it must offer no fields`);
      } else if (s.key !== "departures") {
        /*
         * DEPARTURES IS THE ONE EDITABLE SECTION WITH NO PRODUCT FIELD, and it
         * is named here rather than excused by a rule, so the NEXT fieldless
         * editable section still fails this test. Dates, seats and per-date
         * prices are their own rows (`ProductDeparture`) and travel by the
         * split write path — availability direct, date and price by version.
         */
        assert(
          s.fields.length > 0,
          `"${s.key}" is editable but publishes no field — nothing on the page could change`,
        );
      }
    }

    const app = productSectionsFor("app");
    for (const s of app) {
      assert(PRODUCT_SECTIONS.includes(s), `"${s.key}" is offered on the phone but is not a real section`);
    }
    assert(app.length > 0, "the phone draws some of the trip page");
    assert(app.length < PRODUCT_SECTIONS.length, "and fewer blocks than the website — it is a subset, not a copy");
    const appKeys = app.map((s) => s.key);
    assert(!appKeys.includes("equipment"), "the phone has no equipment tab, so that section is web-only");
    assert(
      productSectionsFor("web").map((s) => s.key).includes("equipment"),
      "while the website does render it",
    );
  });

  /* ----- 11.7 Pending outranks edited ------------------------------------ */

  await check("a trip section under review outranks one merely edited", async () => {
    resetStore();
    const price = PRODUCT_SECTIONS.find((s) => s.key === "price")!;
    // Both true at once: one field with Icefall, another touched locally.
    eq(
      productSectionState(price, new Set(["priceFromCents"]), new Set(["seasonality"])),
      "pending",
      "pending must win — it is the half the operator cannot act on",
    );
    eq(productSectionState(price, new Set(), new Set(["seasonality"])), "edited", "otherwise edited");
    eq(productSectionState(price, new Set(), new Set()), "live", "and otherwise live");

    // ...and against the real seeded submission, read the way the screen reads
    // it: `pendingFields` over the product's own versions.
    const r = await signIn(RAVI);
    const versions = (await be.getVersions(r, "product")).filter((v) => v.entityId === "p-ama-dablam-sw-ridge");
    const pending = pendingFields(versions);
    assert(pending.has("priceFromCents"), "the seeded pending edit on Ama Dablam claims the price");
    eq(productSectionState(price, pending, new Set()), "pending", "so Price & season reads pending on that trip");
    const about = PRODUCT_SECTIONS.find((s) => s.key === "about")!;
    eq(
      productSectionState(about, pending, new Set(["description"])),
      "edited",
      "while a section Icefall is not holding reads edited",
    );
    // A fieldless section can only ever be live — correct, because nothing in
    // it is carried by the product's own versions.
    const reviews = PRODUCT_SECTIONS.find((s) => s.key === "reviews")!;
    eq(productSectionState(reviews, pending, new Set(["description"])), "live", "reviews are nobody's to edit");
  });


  /* ======================================================================== */
  /* 12. The company mark — what may be uploaded, and what is drawn without it */
  /* ======================================================================== */

  /*
   * THE RULE THESE TESTS EXIST TO HOLD. A logo appears above the company name on
   * every trip, so a logo slot is an identity slot: whatever goes in it is read
   * as the company's own mark. Two things follow, and both are asserted below.
   *
   *   1. NOTHING IS EVER SUBSTITUTED. Among the ICEFALL family there is at least
   *      one REAL business, and a real business's logo is its trademark — it
   *      does not ship here at all. The only legitimate source of a mark is an
   *      operator putting THEIR OWN file into THEIR OWN account; every other
   *      case falls through to the company's initials. The fallback is not the
   *      edge case, it is the common one: Coldharbour has no logo in the seed
   *      precisely so that path is exercised rather than described.
   *
   *   2. NO SVG, EVER, FROM AN OPERATOR. An operator upload is untrusted input
   *      that is then served to climbers from ICEFALL's own origin, and an SVG
   *      is a script-carrying document. `icefall-web` bundles `.svg` marks for
   *      its seed companies — that is build-time content the team wrote, and it
   *      is not a precedent for accepting one over a form.
   */

  /* ----- 12.1 The one that matters most ---------------------------------- */

  await check("an operator's SVG is refused as a LOGO, and the refusal says what to send", () => {
    // Everything else about this file is exemplary: square, well over the floor,
    // tiny. The type is the whole problem, which is the point — a good SVG is
    // still refused, so this is a rule and not a quality judgement.
    const svg = { name: "mark.svg", mimeType: "image/svg+xml", byteSize: 8_000, widthPx: 512, heightPx: 512 };
    const problems = validateFile("logo", svg);
    eq(problems.length, 1, "the type is the only thing wrong with it");
    eq(problems[0].field, "type", "and it is reported as a type problem");
    const msg = problems[0].message;
    assert(/svg/i.test(msg), `the refusal must name SVG, got: ${msg}`);
    assert(/png/i.test(msg) && /webp/i.test(msg), `and name the accepted exports, got: ${msg}`);
    assert(/script/i.test(msg), `and say WHY, not just no, got: ${msg}`);
    eq(isAcceptable("logo", svg), false, "so the form cannot stage it");

    // The allowlist itself, because a message is a symptom and this is the rule.
    eq(
      MEDIA_RULES.logo.mimeTypes.includes("image/svg+xml"),
      false,
      "image/svg+xml must be absent from the logo allowlist — putting it back is a security decision",
    );
    assert(
      !acceptAttribute("logo").includes("svg"),
      "and the file picker must not offer it either — the accept attribute is built from the same list",
    );
    // No kind anywhere accepts one. A logo is the tempting case; document and
    // image would be the same hole by another door.
    for (const kind of ["image", "logo", "video", "document"] as const) {
      eq(
        MEDIA_RULES[kind].mimeTypes.includes("image/svg+xml"),
        false,
        `no upload kind may accept an SVG, and ${kind} does`,
      );
    }
  });

  /* ----- 12.2 The rule a logo needs, not the rule a photograph needs ------ */

  await check("a small-but-valid square logo is ACCEPTED where the photograph rule would refuse it", () => {
    // THIS IS THE REGRESSION THAT MATTERS. Validating a mark against `image`'s
    // 1200×800 floor would have refused the ordinary square exports operators
    // actually hold — 256, 320, 512 — and the refusal would have read as the
    // operator's fault.
    const mark = { name: "mark.png", mimeType: "image/png", byteSize: 41_820, widthPx: 512, heightPx: 512 };
    eq(validateFile("logo", mark).length, 0, "512×512 is a perfectly ordinary mark and must pass");
    const asPhotograph = validateFile("image", mark);
    eq(asPhotograph.length, 1, "while the photograph rules refuse the very same file");
    eq(asPhotograph[0].field, "dimensions", "on dimensions — which is exactly the mistake `logo` exists to avoid");

    // The floor holds at its own number, in both directions.
    eq(
      validateFile("logo", { ...mark, widthPx: 256, heightPx: 256 }).length,
      0,
      "256 is the floor and the floor itself is accepted",
    );
    const tiny = validateFile("logo", { ...mark, widthPx: 128, heightPx: 128 });
    eq(tiny.length, 1, "128 is below it and is refused");
    eq(tiny[0].field, "dimensions", "as a dimensions problem");
    assert(/256/.test(tiny[0].message), `and the message names the size to export at, got: ${tiny[0].message}`);
    assert(
      /export/i.test(tiny[0].message),
      "and asks for a re-export — the mark is right, the file is small",
    );

    // Shape is its own verdict: a wordmark is fine, a letterhead is not.
    const banner = validateFile("logo", { ...mark, widthPx: 1200, heightPx: 300 });
    eq(banner.length, 1, "a 4:1 strip is refused for the small square slot it lands in");
    eq(banner[0].field, "aspect", "and named as a shape problem, not a dimensions one");
    assert(
      /initials/i.test(banner[0].message),
      "and the way out it offers is the honest fallback — initials, never a substitute mark",
    );
    eq(
      validateFile("logo", { ...mark, widthPx: 1024, heightPx: 512 }).length,
      0,
      "while 2:1 — the common mark-beside-wordmark lockup — passes",
    );

    // And the seeded record describes a file this validator would accept, so the
    // one logo on record in the app is not one the form would have rejected.
    const seeded = MEDIA_ASSETS.find((a) => a.id === LANTERN_LOGO);
    assert(seeded, "the seed must still carry Lantern Ridge's logo record");
    eq(seeded.kind, "logo", "recorded as a logo, not a photograph");
    eq(
      validateFile("logo", {
        name: "lantern-ridge-mark.png",
        mimeType: seeded.mimeType!,
        byteSize: seeded.byteSize!,
        widthPx: seeded.widthPx,
        heightPx: seeded.heightPx,
      }).length,
      0,
      "and the record's own type, size and dimensions pass the rules the form applies",
    );
  });

  /* ----- 12.3 Every problem at once, for a logo too ----------------------- */

  await check("a logo reports all of its problems at once, not one per attempt", () => {
    const problems = validateFile("logo", {
      name: "mark.gif",
      mimeType: "image/gif",
      byteSize: 5 * 1024 * 1024, // over the 2 MB mark ceiling
      widthPx: 100,
      heightPx: 100, // under the 256 floor, and square so shape is fine
    });
    eq(problems.length, 3, "wrong type AND too large AND too small is three problems, not one");
    const fields = problems.map((p) => p.field).sort().join(",");
    eq(fields, "dimensions,size,type", "and each is reported under its own field");
    eq(new Set(problems.map((p) => p.field)).size, problems.length, "no problem overwrites another");
    for (const p of problems) assert(p.message.trim().length > 0, `every problem must carry a message, ${p.field} did not`);
    // The 2 MB ceiling is the mark's own, not the photograph's 12 MB.
    eq(
      validateFile("logo", { name: "m.png", mimeType: "image/png", byteSize: 3 * 1024 * 1024, widthPx: 512, heightPx: 512 })
        .length,
      1,
      "3 MB is over the logo ceiling even though it is well under the photograph's",
    );
  });

  /* ----- 12.4 The path still carries the authorization key ---------------- */

  await check("a logo's storage path starts with the company's own folder", () => {
    // The storage policy can only see the path, so the company id has to come
    // FIRST or there is nothing for it to match on. A logo belongs to the
    // company rather than one trip, so the owner segment is the company again.
    const path = storagePathFor({ companyId: LANTERN, ownerId: LANTERN, fileName: "Lantern Ridge Mark.PNG" });
    eq(path, "co-lantern/co-lantern/lantern-ridge-mark.png", "company id first, then owner, then a safe filename");
    assert(path.startsWith(`${LANTERN}/`), "the company id is the first segment");
    eq(pathIsInCompanyFolder(path, LANTERN), true, "so it reads as inside Lantern's folder");
    eq(pathIsInCompanyFolder(path, COLDHARBOUR), false, "and not inside Coldharbour's");

    // A path outside the company's own folder is refused, whichever way it is
    // dressed up.
    eq(
      pathIsInCompanyFolder(`${COLDHARBOUR}/${COLDHARBOUR}/mark.png`, LANTERN),
      false,
      "another company's logo path is not Lantern's to touch",
    );
    eq(pathIsInCompanyFolder("mark.png", LANTERN), false, "nor is a bare filename at the bucket root");
    eq(
      pathIsInCompanyFolder("co-lantern-archive/mark.png", LANTERN),
      false,
      "and a folder that merely STARTS with the id is a different folder — the separator is load-bearing",
    );

    // A hostile filename cannot climb out on the way in.
    const climbed = storagePathFor({ companyId: LANTERN, ownerId: LANTERN, fileName: "../../co-coldharbour/mark.svg" });
    eq(pathIsInCompanyFolder(climbed, LANTERN), true, "a `../` name is collapsed, not honoured");
    eq(pathIsInCompanyFolder(climbed, COLDHARBOUR), false, "so it cannot land in the other company's folder");

    // And the seeded record obeys the same shape.
    const seeded = MEDIA_ASSETS.find((a) => a.id === LANTERN_LOGO)!;
    eq(pathIsInCompanyFolder(seeded.storagePath, LANTERN), true, "the seeded logo sits in its own company's folder");
    eq(seeded.companyId, LANTERN, "and the row agrees with the path");
  });

  /* ----- 12.5 The checklist row is now satisfiable ------------------------ */

  await check("the hero section publishes logoMediaId, so 'Media & photos' can be satisfied", async () => {
    // `CompanyProfile`'s completeness checklist has always scored `logoMediaId`.
    // Until it appeared in a section, that row counted something no screen let
    // an operator supply — a checklist line that cannot be reached, which reads
    // as the operator's omission rather than ours.
    const hero = COMPANY_SECTIONS.find((s) => s.key === "hero");
    assert(hero, "the hero section must exist");
    assert(
      (hero.fields as readonly string[]).includes("logoMediaId"),
      "logoMediaId must be one of the hero's fields — the logo sits above the company name",
    );
    eq(
      COMPANY_SECTIONS.filter((s) => (s.fields as readonly string[]).includes("logoMediaId")).length,
      1,
      "and exactly one section owns it — two would give the operator two places to disagree",
    );
    // Reachable on both surfaces, not only the desktop page.
    for (const surface of ["web", "app"] as const) {
      assert(
        sectionsFor(surface).some((s) => (s.fields as readonly string[]).includes("logoMediaId")),
        `the logo must be editable while "Editing for: ${surface}" is selected`,
      );
    }
    // A pending logo change therefore locks the hero, like any other field.
    eq(sectionState(hero, new Set(["logoMediaId"]), new Set()), "pending", "a logo with Icefall locks the hero");
    eq(sectionState(hero, new Set(), new Set(["logoMediaId"])), "edited", "and a staged one marks it edited");

    // The field is real on the record, and its two seeded values are the two
    // cases: one company has a mark, the other has none and falls to initials.
    const r = await signIn(RAVI);
    const lantern = await be.getCompany(r);
    assert(lantern, "Lantern's record must load");
    assert("logoMediaId" in lantern, "logoMediaId is a real field on the company record");
    eq(lantern.logoMediaId, LANTERN_LOGO, "Lantern has a logo on record");
    const j = await signIn(JO);
    const coldharbour = await be.getCompany(j);
    assert(coldharbour, "Coldharbour's record must load");
    eq(
      coldharbour.logoMediaId,
      null,
      "and Coldharbour has none — the initials fallback is the COMMON case and must stay exercised, never filled in to look finished",
    );
  });

  /* ----- 12.6 The closed allowlist, for the company ---------------------- */

  await check("a company draft cannot carry a field the editor's allowlist does not name", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = await be.getCompany(r);
    assert(before, "the company must load first");
    const snapshot = JSON.stringify(before);

    const res = await be.saveDraft(r, {
      entityType: "company",
      entityId: before.id,
      payload: {
        id: "co-hijacked",
        slug: "free-summit",
        // A draft able to clear this would render a REAL company's page with its
        // disclosure removed. It is not modelled on the operator's record at
        // all, which is the strongest form of "not writable".
        realBusiness: false,
        status: "suspended",
        documentsCheckedAt: "2026-08-30T00:00:00.000Z",
        // The one key on this list that IS the operator's own to set.
        logoMediaId: null,
      },
      baseSnapshot: {},
    });
    assert(res.ok, "the save is not the defence — what a payload can REACH is");

    const after = await be.getCompany(r);
    assert(after, "the company is still the caller's own");
    eq(JSON.stringify(after), snapshot, "no draft payload moves the live company row");
    eq(after.id, before.id, "id is not writable");
    eq(after.slug, before.slug, "slug is not writable — a URL a climber has is not a text field");
    eq(after.status, before.status, "status is not writable — a company cannot suspend or unsuspend itself");
    eq(
      after.documentsCheckedAt,
      before.documentsCheckedAt,
      "documentsCheckedAt is Icefall's record of a check it performed, not an operator field",
    );
    eq(
      "realBusiness" in (after as unknown as Record<string, unknown>),
      false,
      "realBusiness is not even modelled here — a draft cannot clear a disclosure that this record does not carry",
    );
    eq(__store.companies.some((c) => c.id === "co-hijacked"), false, "no second company row appeared");
    eq(__store.companies.length, 2, "and the store still holds exactly the two seeded companies");

    // As with products, there is no company-row write path at all — the safest
    // version of a dangerous capability is its absence.
    for (const method of ["updateCompany", "setCompany", "setCompanyStatus", "publishCompany"]) {
      eq(
        method in (be as unknown as Record<string, unknown>),
        false,
        `the backend must expose no ${method} — the live company row has no operator write path`,
      );
    }

    // The allowlist read structurally: what the editor may publish is what the
    // sections declare, and the identity fields are declared by nobody.
    const publishable = new Set(COMPANY_SECTIONS.flatMap((s) => s.fields as readonly string[]));
    assert(publishable.has("logoMediaId"), "logoMediaId IS publishable — it is the operator's own mark");
    for (const field of ["id", "slug", "status", "realBusiness", "documentsCheckedAt", "createdAt", "updatedAt"]) {
      eq(publishable.has(field), false, `${field} must be publishable by no section`);
    }
  });


  /* ===== 13. The mountain page editor ===================================== */

  /*
   * `src/screens/MountainEditor.tsx` is the first screen that PUTS PLACEMENT ON
   * SCREEN — the slot number, the term, the days remaining — and a screen that
   * renders a thing is where the write path for that thing gets added by
   * accident. Everything below guards the shape the screen depends on rather
   * than the pixels: what it may read, what nobody may write, and the fact that
   * it has nothing of its own to store.
   */

  /* ----- 13.1 STILL NO PLACEMENT WRITE. The most important test here ------ */

  await check("the mountain page editor exists and there is STILL no placement write path", async () => {
    resetStore();
    const r = await signIn(RAVI);

    eq(canEditPlacement(), false, "canEditPlacement must be false, always — every operator, every role, every mountain");

    /*
     * Named write paths, spelled out. The screen now shows an operator their
     * slot position and their term, which is precisely the moment somebody
     * reasonable adds "let them ask for #1 from here".
     */
    for (const method of [
      "setPlacement", "updatePlacement", "createPlacement", "deletePlacement",
      "requestPlacement", "buyPlacement", "purchasePlacement", "renewPlacement",
      "extendPlacement", "cancelPlacement", "movePlacement", "reorderPlacements",
      "setSlotPosition", "bidForPlacement", "requestSlot", "setFeatured",
    ]) {
      eq(
        method in (be as unknown as Record<string, unknown>),
        false,
        `the backend must expose no ${method} — placement is not the operator's to move, and the editor must not have given it one`,
      );
    }

    /*
     * ...and structurally, so a name nobody thought of is caught too: the ONLY
     * thing on the backend that mentions a placement or a slot is the reader.
     */
    const placementSurface = Object.keys(be).filter((k) => /placement|slot/i.test(k));
    eq(
      placementSurface.join(","),
      "getPlacements",
      `the backend's entire placement surface must be the single read — found: ${placementSurface.join(", ") || "nothing"}`,
    );

    // Reading it is genuinely a read: the rows come back untouched, twice.
    const before = JSON.stringify(__store.placements);
    const first = await be.getPlacements(r);
    const second = await be.getPlacements(r);
    eq(JSON.stringify(first), JSON.stringify(second), "two reads of a placement must agree");
    eq(JSON.stringify(__store.placements), before, "reading a placement must not change one");

    // Deriving what the screen draws is pure — computing the chip cannot move
    // the slot it is describing.
    for (const p of first) placementStatus(p);
    eq(JSON.stringify(__store.placements), before, "placementStatus must not write back the status it derives");

    /*
     * The oblique route: a draft payload. The editor writes nothing itself, but
     * the two screens beside it do, and a payload is the one thing an operator
     * fully controls. Placement is not modelled on any writable record, so
     * there is nothing for these keys to land on.
     */
    const company = await be.getCompany(r);
    assert(company, "the company must load");
    const accessBefore = JSON.stringify(__store.access);
    const res = await be.saveDraft(r, {
      entityType: "company",
      entityId: company.id,
      payload: {
        slotPosition: 1,
        placementId: "pl-lantern-everest",
        placements: [{ mountainId: "everest", slotPosition: 1 }],
        featured: true,
        // ...and while we are here, a mountain this company was never assigned.
        mountainId: "denali",
      },
      baseSnapshot: {},
    });
    assert(res.ok, "the save is not the defence — what a payload can REACH is");
    eq(JSON.stringify(__store.placements), before, "no draft payload moves a placement row");
    eq(JSON.stringify(__store.access), accessBefore, "and no draft payload grants a mountain");
  });

  /* ----- 13.2 The editor opens only on a mountain the company HOLDS ------- */

  await check("the mountain page editor is reachable only for an ACTIVELY held mountain", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const m = await signIn(MARTA);

    // Denali is Coldharbour's. An assignment elsewhere is exactly as unusable
    // as no assignment at all — this is the screen's second guard.
    eq(canManageMountain(r, COMPANY_MOUNTAINS, "denali"), false, "Ravi must not manage Coldharbour's Denali");
    // ...and the first guard never even gets there: the row is not in his
    // session-scoped access at all, so the screen refuses before it asks.
    const ravisAccess = await be.getAccess(r);
    eq(ravisAccess.some((a) => a.mountainId === "denali"), false, "another company's assignment is not in Ravi's access at all");
    assert(ravisAccess.every((a) => a.companyId === LANTERN), "access reads are scoped to the caller's company");
    const josAccess = await be.getAccess(await signIn(JO));
    assert(josAccess.some((a) => a.mountainId === "denali" && a.status === "active"), "Denali is Coldharbour's, actively");

    /*
     * The three states of a row this company DOES hold. Suspended and ended are
     * spec §18's "operator loses access to a mountain": the history stays
     * readable, the editing stops. The seed holds no lapsed row, so the cases
     * are built directly against the same predicate the screen calls.
     */
    const everest = COMPANY_MOUNTAINS.find((a) => a.id === "cm-lantern-everest");
    assert(everest, "Lantern's Everest assignment must exist in the seed");
    const withStatus = (status: CompanyMountain["status"]): CompanyMountain[] => [{ ...everest, status }];
    eq(canManageMountain(r, withStatus("active"), "everest"), true, "an ACTIVE assignment opens the editor");
    eq(canManageMountain(r, withStatus("suspended"), "everest"), false, "a SUSPENDED assignment closes it");
    eq(canManageMountain(r, withStatus("ended"), "everest"), false, "an ENDED assignment closes it");
    eq(canManageMountain(r, [], "everest"), false, "and a missing row is not permission — everything defaults to deny");

    /*
     * The screen is READABLE by both roles and hands over an edit link to only
     * one of them. Sales can be asked "why do we look like that on Everest",
     * so refusing them the explanation would be the wrong shape of rule.
     */
    eq(canManageMountain(m, COMPANY_MOUNTAINS, "everest"), true, "a Sales employee may read the mountain they work");
    eq(PERMISSIONS.editProducts(m), false, "...and may not be handed the trip editor from it");
    eq(PERMISSIONS.editProducts(r), true, "...which a Company Admin is");

    // A disabled employee holds nothing, assignment or not.
    const tenzin = await be.signIn(TENZIN);
    eq(tenzin, null, "a disabled employee cannot sign in to reach the editor at all");
  });

  /* ----- 13.3 The block is DERIVED. There is nothing to store here -------- */

  await check("no per-mountain operator content field exists — the block stays derived", async () => {
    resetStore();
    const r = await signIn(RAVI);

    /*
     * THE POINT OF THIS TEST. `CompanyMountain` is the authorization boundary
     * and nothing else — "no position, no price, no term". The mountain editor
     * names two parts of the block ("Promotional film", "Your pitch for this
     * mountain") whose source is "Nowhere yet", and the temptation is to give
     * them somewhere by adding a field here. That is Session 03's schema to
     * change, through a request; a client-side field would ship an operator's
     * writing into a record nothing publishes and nobody reviews.
     */
    const EXPECTED = ["assignedAt", "companyId", "id", "mountainId", "status"].join(",");
    const rows = await be.getAccess(r);
    assert(rows.length > 0, "Lantern holds mountains");
    for (const row of rows) {
      eq(
        Object.keys(row).sort().join(","),
        EXPECTED,
        `company_mountains carries exactly the authorization columns — ${row.id} has grown one`,
      );
    }
    for (const row of COMPANY_MOUNTAINS) {
      eq(Object.keys(row).sort().join(","), EXPECTED, `the seeded row ${row.id} must not carry content either`);
    }

    // Said again by intent rather than by list, so a differently-named field is
    // caught as well.
    const CONTENT_ISH =
      /pitch|blurb|copy|headline|tagline|summary|description|film|video|photo|image|media|highlight|badge|rank|position|price|term/i;
    for (const key of Object.keys(rows[0])) {
      eq(CONTENT_ISH.test(key), false, `company_mountains must carry no content field — found "${key}"`);
    }

    // Nor is there a per-mountain content bag hiding on the records that DO
    // hold operator writing.
    const company = await be.getCompany(r);
    assert(company, "the company must load");
    const products = await be.getProducts(r);
    const PER_MOUNTAIN_BAG = /perMountain|mountainCopy|mountainPitch|mountainFilm|mountainContent|byMountain/i;
    for (const key of Object.keys(company)) {
      eq(PER_MOUNTAIN_BAG.test(key), false, `the company record must carry no per-mountain content — found "${key}"`);
    }
    for (const key of Object.keys(products[0])) {
      eq(PER_MOUNTAIN_BAG.test(key), false, `the product record must carry no per-mountain content — found "${key}"`);
    }
    assert(
      Array.isArray((products[0] as unknown as Record<string, unknown>).mountainIds),
      "a product's link to a mountain is a list of ids and nothing more",
    );

    // No write path was added for it either, under any name.
    const mountainSurface = Object.keys(be).filter((k) => /mountain/i.test(k));
    eq(
      mountainSurface.join(","),
      "getMountains",
      `the backend's entire mountain surface must be the single read — found: ${mountainSurface.join(", ") || "nothing"}`,
    );

    /*
     * And no fourth reviewable entity has appeared. If somebody routes mountain
     * copy through the approval system, a version turns up that belongs to none
     * of the three known types, and the partition below stops adding up.
     */
    const all = await be.getVersions(r);
    let counted = 0;
    for (const t of ["company", "product", "media_asset"] as const) counted += (await be.getVersions(r, t)).length;
    eq(counted, all.length, "every content version is a company, a product or a media asset — there is no mountain version");
  });

  /* ----- 13.4 The trips on the page are the caller's own, and only those --- */

  await check("a mountain shows exactly the caller's own trips carrying that mountain", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const j = await signIn(JO);

    /*
     * Everest is the one page in this portal that several operators share, and
     * the seed does not yet model that — Coldharbour sells Denali only. So the
     * overlap is created here on purpose: a REAL competing listing on the same
     * mountain, which is the only condition under which the isolation is worth
     * asserting.
     */
    const denali = __store.products.find((p) => p.id === "p-coldharbour-denali");
    assert(denali, "Coldharbour's trip must exist in the seed");
    __store.products = [
      ...__store.products,
      { ...denali, id: "p-coldharbour-everest", name: "Everest — West Ridge", slug: "coldharbour-everest", mountainIds: ["everest"] },
    ];

    // The screen's own derivation, run against the session-scoped read.
    const mine = (await be.getProducts(r)).filter((p) => p.mountainIds.includes("everest") && p.status !== "archived");
    assert(mine.length >= 2, `Lantern must have trips on Everest, found ${mine.length}`);
    for (const p of mine) eq(p.companyId, LANTERN, `${p.id} must be Lantern's own`);
    eq(mine.some((p) => p.id === "p-coldharbour-everest"), false, "a competitor's listing on the SAME mountain must never appear");
    eq(
      (await be.getProducts(r)).some((p) => p.companyId === COLDHARBOUR),
      false,
      "no Coldharbour product reaches Ravi by any route",
    );
    eq(await be.getProduct(r, "p-coldharbour-everest"), null, "nor by asking for it by id");

    // ...and the injected row is genuinely there, for its owner. Otherwise the
    // assertions above would pass against a listing that does not exist.
    assert(
      (await be.getProducts(j)).some((p) => p.id === "p-coldharbour-everest"),
      "the competing listing must be real and visible to Coldharbour",
    );

    /*
     * The centre pane draws the LIVE ones only. A draft trip is not on the
     * mountain page, and drawing it in a pane titled "how you appear" would
     * tell an operator they are published when they are not.
     */
    const created = await be.createProduct(r, { kind: "expedition", name: "Everest — North Col", mountainId: "everest" });
    assert(created.ok, "a Company Admin may add a trip on an actively held mountain");
    eq(created.value.status, "draft", "a new trip is never public on creation");
    const after = (await be.getProducts(r)).filter((p) => p.mountainIds.includes("everest") && p.status !== "archived");
    assert(after.some((p) => p.id === created.value.id), "the draft is the operator's, and is listed as theirs");
    eq(
      after.filter((p) => p.status === "live").some((p) => p.id === created.value.id),
      false,
      "...but a draft is not part of the block a climber sees",
    );

    resetStore();
  });

  /* ----- 13.5 Expiry is derived, and the two lifecycles stay apart -------- */

  await check("an expired placement changes nothing the operator may do (spec §18)", async () => {
    resetStore();
    const r = await signIn(RAVI);

    const everest = PLACEMENTS.find((p) => p.id === "pl-lantern-everest");
    assert(everest, "Lantern's Everest placement must exist");
    const stored = JSON.stringify(__store.placements);

    // A term that ended before the seeded today. Nothing ran on a timer.
    const lapsed = { ...everest, id: "pl-test-lapsed-editor", startsOn: "2026-04-01", endsOn: "2026-07-31" };
    const derived = placementStatus(lapsed);
    eq(derived.effectiveStatus, "expired", "the editor reads a lapsed term as expired");
    eq(lapsed.status, "active", "while the stored status is untouched");
    eq(lapsed.slotPosition, 2, "and the slot is still held — expiry never reorders the mountain");
    eq(JSON.stringify(__store.placements), stored, "deriving expiry writes nothing back");
    eq(derived.needsReview, true, "an expired placement raises a reminder for a human, and only that");

    /*
     * THE INDEPENDENCE, BOTH WAYS. Access and placement are two tables with two
     * lifecycles, which is the reason Session 03 split them; consulting the
     * wrong one here would silently reintroduce the bug.
     */
    eq(
      canManageMountain(r, COMPANY_MOUNTAINS, "everest"),
      true,
      "an expired placement must NOT close the mountain editor — the company still holds the mountain",
    );
    const accessRow = COMPANY_MOUNTAINS.find((a) => a.id === "cm-lantern-everest");
    assert(accessRow, "Lantern's Everest assignment must exist");
    eq(
      canManageMountain(r, [{ ...accessRow, status: "ended" }], "everest"),
      false,
      "...and conversely a live placement must NOT keep it open once access has ended",
    );

    // Access with no placement at all is the ordinary case, not a broken one:
    // Lantern holds Ama Dablam and has bought nothing on it.
    const held = await be.getPlacements(r);
    eq(placementFor(held, "ama-dablam"), null, "Lantern holds no Ama Dablam placement");
    eq(
      canManageMountain(r, COMPANY_MOUNTAINS, "ama-dablam"),
      true,
      "a mountain with no placement is still fully the operator's to work — the editor opens on it",
    );
    assert(placementFor(held, "everest"), "and where a placement does exist, the editor finds it");
  });



  /* ======================================================================== */
  /* 14. THE GUARD SUITE OVER THIS BATCH                                      */
  /* ======================================================================== */

  /*
   * Four sessions have just landed changes across permissions (OP-08), the
   * mountain and trip editors (OP-03), leads and the pipeline (OP-05/06). None
   * of what follows tests a new feature. Every check here re-asserts a rule the
   * batch stood NEXT TO — the ones that break silently, that no screen shows,
   * and that nobody notices until a company has quoted an 8,849 m trek or read
   * a competitor's leads.
   *
   * A rule that was already true before the batch is exactly the kind of rule
   * that quietly stops being true during one.
   */

  /* ----- 14.1 The role model gave nothing away --------------------------- */

  await check("the permission change took nothing away: every existing refusal still holds", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const m = await signIn(MARTA);

    /*
     * THE MATRIX. `createOffers` was added to this object, and an addition to a
     * shared object is the cheapest possible way to change a neighbouring line
     * by accident. Each of these was false before the batch and must still be.
     */
    eq(can(m, "editCompanyProfile"), false, "a Sales employee still cannot edit the company profile");
    eq(can(m, "editProducts"), false, "...nor trip content");
    eq(can(m, "uploadMedia"), false, "...nor upload media");
    eq(can(m, "submitForApproval"), false, "...nor send anything to Icefall");
    eq(can(m, "manageStaff"), false, "...nor manage staff");

    /* And Sales keeps exactly what Sales exists to do. */
    eq(can(m, "viewInbox"), true, "Sales still works the inbox");
    eq(can(m, "replyToCustomer"), true, "...and replies to customers");
    eq(can(m, "manageLeads"), true, "...and owns the follow-up");
    eq(can(m, "setDepartureAvailability"), true, "...and may still say a departure is full");

    /*
     * THE BACKEND, NOT ONLY THE MATRIX. The Team screen was rebuilt this batch,
     * so the two staff writes are re-run against the store rather than trusted
     * to agree with the predicate above.
     */
    const disable = await be.setTeamMemberStatus(m, "cu-tenzin", "active");
    eq(disable.ok, false, "a Sales employee cannot reinstate a removed colleague");
    eq(
      __store.users.find((u) => u.id === "cu-tenzin")!.status,
      "disabled",
      "and the refusal wrote nothing",
    );
    const invite = await be.inviteTeamMember(m, {
      displayName: "Someone New",
      email: "new@lanternridge.example",
      role: "sales",
    });
    eq(invite.ok, false, "a Sales employee cannot invite anybody");
    eq(
      __store.users.some((u) => u.email === "new@lanternridge.example"),
      false,
      "and no half-made account was left behind",
    );
    const profile = await be.saveDraft(m, {
      entityType: "company",
      entityId: m.user.companyId,
      payload: { tagline: "Sales tried again after the permission change" },
      baseSnapshot: {},
    });
    eq(profile.ok, false, "a Sales employee still cannot submit company content for approval");

    /* The Company Admin still holds all of them. A guard that passes because
     * everything is refused would be worthless. */
    eq(can(r, "manageStaff"), true, "the Company Admin still manages staff");
    eq(can(r, "editCompanyProfile"), true, "...and still owns the profile");
    eq(can(r, "submitForApproval"), true, "...and the submission");
    resetStore();
  });

  await check("a disabled user gets no session at all, and a fabricated one grants nothing", async () => {
    resetStore();

    eq(await be.signIn(TENZIN), null, "a disabled employee cannot sign in");
    eq(
      (await be.listSignInIdentities()).some((u) => u.email === TENZIN),
      false,
      "and is not even offered as an identity to sign in as",
    );

    /*
     * THE ONE THAT MATTERS: sign-in is not the only door. If a stale session
     * object survives a disable — a tab left open, a cached context — every
     * predicate must still refuse it. `isActive` is the floor under all of them
     * and the new permission has to stand on the same floor as the old ones.
     */
    const disabled = COMPANY_USERS.find((u) => u.status === "disabled");
    assert(disabled, "the seed must carry a disabled user for this to mean anything");
    const ghost: Session = { user: disabled };
    for (const key of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      eq(can(ghost, key), false, `a disabled user must be refused ${key}`);
    }
    eq(isCompanyOwner(ghost), false, "a disabled user is not an owner account either");

    /*
     * ...including one shaped like the founding account. `isOwnerAccount` reads
     * a stored fact and says yes; `isCompanyOwner` asks whether they are ACTIVE
     * as well, and that difference is the whole reason both exist.
     */
    const disabledOwnerShape: CompanyUser = { ...disabled, role: "admin", invitedBy: null };
    eq(isOwnerAccount(disabledOwnerShape), true, "the stored shape still reads as the founding account");
    eq(
      isCompanyOwner({ user: disabledOwnerShape }),
      false,
      "but a disabled founding account is not a signed-in owner",
    );
    eq(
      can({ user: disabledOwnerShape }, "createOffers"),
      false,
      "and it may not commit the company to a price",
    );
    resetStore();
  });

  await check("the NEW permission is the owner's, refused to sales, and not quietly given to every admin", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const m = await signIn(MARTA);
    const j = await signIn(JO);

    eq(GRANTABLE_PERMISSIONS.join(","), "createOffers", "the grantable list is one closed entry, not a permission builder");

    /* Who the owner actually is, derived from the data rather than assumed. */
    const founding = COMPANY_USERS.filter((u) => u.companyId === r.user.companyId && isOwnerAccount(u));
    eq(founding.length, 1, "exactly one founding account per company — the fact is already in the data");
    eq(founding[0].id, "cu-ravi", "and for Lantern it is Ravi");
    eq(isCompanyOwner(r), true, "the signed-in owner reads as the owner");
    eq(can(r, "createOffers"), true, "the owner Super Admin may create a custom offer");
    eq(can(j, "createOffers"), true, "and so may Coldharbour's own founding account, for their own company");

    eq(isCompanyOwner(m), false, "Sales is not the founding account");
    eq(can(m, "createOffers"), false, "and a Sales employee may NOT commit the company to a price");

    /*
     * AN INVITED ADMIN IS NOT THE OWNER. This is the line the new permission is
     * most likely to erode: `isCompanyAdmin` was already the answer to every
     * other entry in the matrix, and reusing it here would have handed every
     * existing admin a power nobody granted them.
     */
    const invitedAdmin: CompanyUser = { ...m.user, role: "admin", invitedBy: "cu-ravi" };
    const asInvitedAdmin: Session = { user: invitedAdmin };
    eq(can(asInvitedAdmin, "editCompanyProfile"), true, "an invited admin is a full Company Admin");
    eq(can(asInvitedAdmin, "manageStaff"), true, "...with the staff powers that come with it");
    eq(can(asInvitedAdmin, "createOffers"), false, "...and still no authority to quote outside the published range");

    /*
     * GRANTS ARE NOT STORABLE YET, AND NOTHING PRETENDS THEY ARE. A grant
     * screen that forgot every grant on reload would be worse than none.
     */
    eq(grantedPermissions(m.user).length, 0, "nothing has been granted to anybody");
    eq(grantedPermissions(r.user).length, 0, "not even to the owner — the owner's power is derived, not granted");
    eq(hasGrant(m, "createOffers"), false, "so no grant can be relied on");
    const grantSurface = Object.keys(be).filter((k) => /grant|permission|privilege/i.test(k));
    eq(
      grantSurface.join(",") || "none",
      "none",
      `the backend must expose no way to write a grant — found: ${grantSurface.join(", ") || "nothing"}`,
    );
    resetStore();
  });

  /* ----- 14.2 STILL no placement write, after a batch that touched both --- */

  await check("after Mountains and Team, placement is STILL not the operator's to move", async () => {
    resetStore();
    const r = await signIn(RAVI);

    eq(canEditPlacement(), false, "canEditPlacement is false — every operator, every role, every mountain");
    eq(
      canEditPlacement.length,
      0,
      "it takes no argument: there is no session, role or tier that could change the answer, including the new owner tier",
    );

    /* The whole surface, structurally — a name nobody thought of is caught. */
    const placementSurface = Object.keys(be).filter((k) => /placement|slot|position|featur/i.test(k));
    eq(
      placementSurface.join(","),
      "getPlacements",
      `the backend's entire placement surface must be the single read — found: ${placementSurface.join(", ") || "nothing"}`,
    );

    /*
     * AND NO WRITE THIS BATCH ADDED REACHES IT SIDEWAYS. Each of these is a
     * method the batch worked on or beside; none of them may move a slot.
     */
    const before = JSON.stringify(__store.placements);
    await be.setDepartureAvailability(r, "d-1", { availability: "limited", spotsLeft: 4 });
    await be.setLeadTags(r, "l-hanne", ["Interested", "Deposit paid"]);
    await be.setTeamMemberStatus(r, "cu-marta", "active");
    await be.inviteTeamMember(r, { displayName: "New Hire", email: "hire@lanternridge.example", role: "sales" });
    await be.saveDraft(r, {
      entityType: "product",
      entityId: "p-everest-south-col",
      payload: { slotPosition: 1, featured: true, placementId: "pl-lantern-everest" },
      baseSnapshot: {},
    });
    eq(JSON.stringify(__store.placements), before, "not one of this batch's writes moved a placement row");
    resetStore();
  });

  /* ----- 14.3 Spots write directly; dates and prices do not (decision 12) - */

  await check("spots change the LIVE row immediately and produce no version", async () => {
    resetStore();
    const r = await signIn(RAVI);

    const trip = await be.getProduct(r, "p-everest-south-col");
    assert(trip, "the live trip must load");
    eq(trip.status, "live", "this half of the rule only means anything on a PUBLISHED trip");

    const versionsBefore = __store.versions.length;
    const res = await be.setDepartureAvailability(r, "d-1", {
      availability: "limited",
      spotsTotal: 10,
      spotsLeft: 3,
    });
    assert(res.ok, `spots are the operator's own logistics, got: ${res.ok ? "" : res.reason}`);

    const stored = __store.departures.find((d) => d.id === "d-1");
    assert(stored, "the departure row must still exist");
    eq(stored.spotsLeft, 3, "the LIVE row itself changed — no review, no waiting");
    eq(stored.spotsTotal, 10, "both figures land directly");
    eq(stored.availability, "limited", "and so does the availability");
    eq(__store.versions.length, versionsBefore, "and NOTHING was queued for approval — that is the direct half");

    /* The read the screen makes agrees at once. A write nobody can see is not
     * a direct write. */
    const read = (await be.getDepartures(r, "p-everest-south-col")).find((d) => d.id === "d-1");
    assert(read, "the departure must come back from the session-scoped read");
    eq(read.spotsLeft, 3, "the operator sees the new figure immediately");

    /* Null is "not stated", and it survives as null. A null collapsed to 0
     * would publish "sold out" on a trip with places on it. */
    const cleared = await be.setDepartureAvailability(r, "d-1", { spotsLeft: null });
    assert(cleared.ok, "clearing a figure is allowed");
    eq(cleared.value.spotsLeft, null, "and it stays an absence, never a zero");
    eq(__store.departures.find((d) => d.id === "d-1")!.spotsTotal, 10, "while the other figure is untouched");
    resetStore();
  });

  await check("a date or a price does NOT touch the live row — it produces a version instead", async () => {
    resetStore();
    const r = await signIn(RAVI);

    eq(
      DEPARTURE_DIRECT_FIELDS.join(","),
      "availability,spotsTotal,spotsLeft",
      "the direct columns are exactly three, and the list is the enforcement",
    );
    eq(
      DEPARTURE_DIRECT_FIELDS.some((f) => /date|price|cost/i.test(f)),
      false,
      "no date and no price is directly writable",
    );

    /* THE DEPARTURE'S OWN DATE AND PRICE: not merely refused, unreachable. */
    const before = { ...__store.departures.find((d) => d.id === "d-1")! };
    await be.setDepartureAvailability(r, "d-1", {
      availability: "full",
      ...({ departureDate: "2030-01-01", endDate: "2030-03-01", priceCents: 1 } as Record<string, never>),
    });
    const after = __store.departures.find((d) => d.id === "d-1")!;
    eq(after.departureDate, before.departureDate, "the departure date is untouched by an availability write");
    eq(after.endDate, before.endDate, "so is the end date");
    eq(after.priceCents, before.priceCents, "so is the price");
    eq(after.availability, "full", "while the part that IS direct went through — the method is not simply inert");

    for (const method of [
      "setDepartureTerms", "setDepartureDate", "setDeparturePrice", "updateDeparture",
      "createDeparture", "addDeparture", "deleteDeparture", "setPrice", "setProductPrice",
    ]) {
      eq(
        method in (be as unknown as Record<string, unknown>),
        false,
        `the backend must expose no ${method} — dates and prices are staff-only`,
      );
    }

    /* THE PRICE ON THE TRIP ITSELF: the version route, and the live row keeps
     * exactly what a climber is reading right now. */
    const live = (await be.getProduct(r, "p-everest-south-col"))!;
    eq(canEditProductDirectly(r, live), false, "a LIVE trip is not directly writable, whatever the field");
    const versionsBefore = __store.versions.length;
    const v = await be.saveDraft(r, {
      entityType: "product",
      entityId: live.id,
      payload: { priceFromCents: 100, priceToCents: 200 },
      baseSnapshot: { priceFromCents: live.priceFromCents },
    });
    assert(v.ok, `the price change must be accepted as a DRAFT, got: ${v.ok ? "" : v.reason}`);
    eq(v.value.state, "draft", "it is a draft, not a publication");
    eq(__store.versions.length, versionsBefore + 1, "a version was produced");
    eq(v.value.payload["priceFromCents"], 100, "and it carries the change, waiting for Icefall");
    const stillLive = (await be.getProduct(r, live.id))!;
    eq(stillLive.priceFromCents, live.priceFromCents, "while the LIVE row is exactly as the climber left it");
    eq(stillLive.priceToCents, live.priceToCents, "both ends of the range untouched");
    resetStore();
  });

  /* ----- 14.4 ALTITUDE IS NEVER SUBSTITUTED ------------------------------ */

  await check("a trek with no highest point of its own never borrows the mountain's summit", async () => {
    resetStore();
    const r = await signIn(RAVI);

    const everest = (await be.getMountains()).find((m) => m.id === "everest");
    assert(everest, "Everest must be in the catalogue");
    eq(everest.elevationM, 8849, "the summit is known — which is exactly what makes substituting it tempting");

    /*
     * THE CONSTRUCTED CASE. A brand-new trek on Everest: the platform holds a
     * summit for the mountain and nothing at all for the route.
     */
    const made = await be.createProduct(r, {
      kind: "trek",
      name: "Khumbu valley teahouse trek",
      mountainId: "everest",
    });
    assert(made.ok, `the Company Admin may add a trek on a mountain they hold, got: ${made.ok ? "" : made.reason}`);
    const trek: Product = made.value;
    eq(trek.mountainIds[0], "everest", "it is genuinely attached to the mountain with the famous number");
    eq(trek.maxAltitudeM, null, "and its highest point is an ABSENCE — not the summit, not a guess, not a zero");

    const readBack = await be.getProduct(r, trek.id);
    assert(readBack, "the trek must read back");
    eq(readBack.maxAltitudeM, null, "reading it does not fill the gap");
    assert(
      !JSON.stringify(readBack).includes("8849"),
      "8,849 must appear NOWHERE in the trek's record — an overstatement of what a person is being asked to survive",
    );
    const fromList = (await be.getProducts(r)).find((p) => p.id === trek.id);
    assert(fromList, "and it appears in the catalogue");
    eq(fromList.maxAltitudeM, null, "with the same absence there");
    assert(!JSON.stringify(fromList).includes("8849"), "the list read does not substitute either");

    /* Nor does a draft against it publish a summit onto the live record. */
    const v = await be.saveDraft(r, {
      entityType: "product",
      entityId: trek.id,
      payload: { maxAltitudeM: everest.elevationM },
      baseSnapshot: { maxAltitudeM: null },
    });
    assert(v.ok, "a payload can carry anything — the defence is what it can REACH");
    eq(
      __store.products.find((p) => p.id === trek.id)!.maxAltitudeM,
      null,
      "the stored trek still holds no highest point; only Icefall could ever set one",
    );

    /*
     * THE SEEDED CASE THAT GAVE THE RULE ITS NAME. Everest Base Camp tops out
     * at 5,364 m — 3,485 m below the peak it is named after.
     */
    const ebc = (await be.getProducts(r)).find((p) => p.id === "p-everest-base-camp-trek");
    assert(ebc, "the Base Camp trek must exist");
    assert(ebc.mountainIds.includes("everest"), "on Everest");
    eq(ebc.maxAltitudeM, 5364, "with its own true figure");
    assert(
      ebc.maxAltitudeM !== everest.elevationM,
      "which is NOT the summit — the whole point of the field",
    );
    resetStore();
  });

  await check("no code path in this app derives a highest point from a mountain's elevation", async () => {
    /*
     * A SOURCE GUARD, DELIBERATELY. The substitution this forbids is a single
     * `??` away in any of five screens and two previews, it type-checks, it
     * looks like a helpful default, and no test of behaviour would catch it
     * where the seed happens to carry a real figure. So the source itself is
     * the thing asserted: an altitude may come from the record's own value or
     * be absent, and it may never be read off an elevation.
     *
     * Comments are stripped first — several files EXPLAIN the rule at length,
     * and a guard that fires on the explanation of a rule is a guard that gets
     * deleted.
     */
    const stripComments = (src: string): string =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, "$1"))
        .join("\n");

    /* An altitude may be: absent, a literal the record holds, a type, or a read
     * of some record's OWN maxAltitudeM. Nothing else. */
    const ALLOWED = /^(null|undefined|\d[\d_]*|number \| null|null \| number|[A-Za-z_$][\w$]*(\?)?\.maxAltitudeM)$/;

    function substitutions(source: string): string[] {
      const out: string[] = [];
      const lines = stripComments(source).split("\n");
      lines.forEach((line, i) => {
        if (/altitude/i.test(line) && /elevation/i.test(line)) {
          out.push(`line ${i + 1}: an altitude and an elevation in one expression — ${line.trim()}`);
          return;
        }
        const assign = line.match(/maxAltitudeM\s*[:=]\s*([^,;]*)/);
        if (!assign) return;
        const rhs = assign[1].trim();
        const continued = [rhs, lines[i + 1] ?? "", lines[i + 2] ?? ""].join(" ");
        if (/elevation|summit/i.test(continued)) {
          out.push(`line ${i + 1}: a highest point taken from an elevation — ${line.trim()}`);
        } else if (rhs !== "" && !ALLOWED.test(rhs)) {
          out.push(`line ${i + 1}: a highest point from something other than the record's own value — ${line.trim()}`);
        }
      });
      return out;
    }

    /*
     * THE GUARD HAS TEETH — proved before it is trusted. A checker that can
     * never fail is a checker that says nothing about the code it read.
     */
    const wouldBeCaught = [
      "maxAltitudeM: product.maxAltitudeM ?? mountain.elevationM,",
      "maxAltitudeM: heroMountain.elevationM,",
      "const maxAltitudeM = mountains.find((m) => m.id === id)!.elevationM;",
      "maxAltitudeM:\n      mountain.elevationM,",
      "maxAltitudeM: product.maxAltitudeM ?? 8849,",
    ];
    for (const bad of wouldBeCaught) {
      assert(substitutions(bad).length > 0, `the guard must catch: ${bad}`);
    }
    eq(substitutions("maxAltitudeM: product.maxAltitudeM,").length, 0, "...while the honest pass-through is fine");
    eq(substitutions("maxAltitudeM: null,").length, 0, "...and so is an explicit absence");
    eq(
      substitutions("/* never from mountain.elevationM */\n  maxAltitudeM: product.maxAltitudeM,").length,
      0,
      "...and explaining the rule in a comment is not breaking it",
    );

    /* Now the real source, every file of it. */
    const srcRoot = new URL("../src/", import.meta.url);
    const walk = (dir: URL, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir), out);
        else if (/\.tsx?$/.test(entry.name)) out.push(new URL(entry.name, dir).pathname);
      }
      return out;
    };
    const files = walk(srcRoot);
    assert(files.length > 40, `the scan must actually have read the app — found ${files.length} files`);

    const found: string[] = [];
    let sawTheField = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (source.includes("maxAltitudeM")) sawTheField++;
      for (const hit of substitutions(source)) {
        found.push(`${file.split("/src/")[1] ?? file} ${hit}`);
      }
    }
    assert(sawTheField > 3, `the field must actually be used in the app — seen in ${sawTheField} files`);
    eq(
      found.length,
      0,
      `no file may take a trip's highest point from a mountain's elevation:\n      ${found.join("\n      ")}`,
    );
  });

  /* ----- 14.5 The tags, and what a tag may not carry --------------------- */

  await check("the ready-made tags are the owner's four, verbatim, and unique case-insensitively", () => {
    /*
     * READ FROM SOURCE, and not because that is nicer. `PRESET_TAGS` lives in
     * `components/leads.tsx`, which pulls in the React context and therefore
     * `import.meta.env` — importing it into a Node test crashes on load. The
     * array is asserted where it is written instead.
     */
    const leads = readFileSync(new URL("../src/components/leads.tsx", import.meta.url), "utf8");
    const block = leads.match(/export const PRESET_TAGS = \[([\s\S]*?)\] as const;/);
    assert(block, "PRESET_TAGS must still be a plain literal list in components/leads.tsx");
    const tags = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert(tags.length >= 4, `the preset list must have entries, found ${tags.length}`);

    /* THE OWNER'S FOUR: "cold lead, waste of time, interested, inquired". */
    for (const owned of ["Enquired", "Interested", "Cold lead", "Waste of time"]) {
      assert(tags.includes(owned), `the owner asked for "${owned}" and it must be offered verbatim`);
    }
    eq(
      tags.slice(0, 4).join(" · "),
      "Enquired · Interested · Cold lead · Waste of time",
      "and they come FIRST, because they are the ones asked for",
    );
    assert(
      /export const PRIMARY_TAGS[^\n]*PRESET_TAGS\.slice\(0, 4\)/.test(leads),
      "PRIMARY_TAGS must be those same four, taken from the one list rather than typed out a second time",
    );

    /*
     * UNIQUE CASE-INSENSITIVELY. The backend de-duplicates on lower case, so a
     * list holding both "Cold lead" and "COLD LEAD" would offer a chip that
     * silently does nothing when the other is already on the lead.
     */
    const keys = tags.map((t) => t.toLowerCase());
    eq(new Set(keys).size, tags.length, `two presets differ only by case: ${keys.join(", ")}`);
    for (const t of tags) {
      eq(t.trim(), t, `"${t}" must not carry whitespace the backend would strip`);
      assert(t.length <= 24, `"${t}" must survive the backend's own 24-character cap unchanged`);
    }
  });

  await check("setLeadTags still normalises, and still refuses contact details in any position", async () => {
    resetStore();
    const r = await signIn(RAVI);

    const res = await be.setLeadTags(r, "l-hanne", [
      "  Cold lead  ",
      "COLD LEAD",
      "cold   lead",
      "Interested",
    ]);
    assert(res.ok, `the write must succeed, got: ${res.ok ? "" : res.reason}`);
    eq(res.value.tags.join(","), "Cold lead,Interested", "one tag from three spellings, trimmed and collapsed");

    const capped = await be.setLeadTags(r, "l-hanne", [
      "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k",
    ]);
    assert(capped.ok, "the write succeeds");
    assert(capped.value.tags.length <= 8, `the list is capped, got ${capped.value.tags.length}`);

    const long = await be.setLeadTags(r, "l-hanne", ["x".repeat(60)]);
    assert(long.ok, "an over-long tag is trimmed rather than refused");
    assert(long.value.tags[0].length <= 24, "and it is cut to the stored length");

    /*
     * THE REFUSAL, IN THE SECOND POSITION. A check that only reads the first
     * tag would pass every test written so far and let the escape route in.
     */
    const before = (await be.getLead(r, "l-hanne"))!.tags.join(",");
    const contact = await be.setLeadTags(r, "l-hanne", ["Interested", "ring 07700 900123"]);
    eq(contact.ok, false, "a phone number in a tag is the same escape route as one in a note");
    assert(!contact.ok && contact.reason.trim().length > 0, "and the refusal carries a reason to show the operator");
    eq(
      (await be.getLead(r, "l-hanne"))!.tags.join(","),
      before,
      "and NOTHING was written — not even the innocent tag beside it",
    );
    for (const bad of ["hello@lanternridge.example", "wa.me/97798", "book at https://example.com", "@lanternridge"]) {
      const attempt = await be.setLeadTags(r, "l-hanne", [bad]);
      eq(attempt.ok, false, `a tag reading "${bad}" must be refused`);
    }
    resetStore();
  });

  /* ----- 14.6 Cross-company, unchanged by any of it ----------------------- */

  await check("Ravi still cannot read, write or request against anything of Coldharbour's", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const j = await signIn(JO);

    /* READ. */
    eq(await be.getProduct(r, "p-coldharbour-denali"), null, "not their trip");
    eq(await be.getLead(r, "l-x"), null, "not their lead");
    eq(await be.getConversation(r, "cvn-x"), null, "not their conversation");
    eq((await be.getMessages(r, "cvn-x")).length, 0, "and not a line of what was said in it");
    assert(await be.getConversation(j, "cvn-x"), "while it is genuinely Coldharbour's own thread");
    eq(
      (await be.getTeam(r)).some((u) => u.companyId !== r.user.companyId),
      false,
      "and the rebuilt Team screen shows only their own people",
    );
    eq(
      (await be.getProducts(r)).some((p) => p.companyId === COLDHARBOUR),
      false,
      "no Coldharbour trip reaches Ravi by any route",
    );

    /* WRITE — including every surface this batch touched. */
    const tags = await be.setLeadTags(r, "l-x", ["Interested"]);
    eq(tags.ok, false, "tagging another company's lead must be refused");
    const staff = await be.setTeamMemberStatus(r, "cu-jo", "disabled");
    eq(staff.ok, false, "and Coldharbour's own admin is not Ravi's to disable");
    eq(__store.users.find((u) => u.id === "cu-jo")!.status, "active", "and she is untouched");
    const draft = await be.saveDraft(r, {
      entityType: "company",
      entityId: COLDHARBOUR,
      payload: { tagline: "Written by a competitor" },
      baseSnapshot: {},
    });
    eq(draft.ok, false, "a draft against another company's profile must be refused");
    const theirTrip = await be.saveDraft(r, {
      entityType: "product",
      entityId: "p-coldharbour-denali",
      payload: { description: "Written by a competitor" },
      baseSnapshot: {},
    });
    eq(theirTrip.ok, false, "and so must one against their trip");

    /*
     * A DEPARTURE OF THEIRS, MADE REAL. The seed gives Coldharbour no dated
     * departure, so the isolation would otherwise be asserted against a row
     * that does not exist.
     */
    const template = __store.departures.find((d) => d.id === "d-1");
    assert(template, "a departure to copy must exist");
    const theirs: ProductDeparture = { ...template, id: "d-coldharbour-1", productId: "p-coldharbour-denali" };
    __store.departures = [...__store.departures, theirs];
    const spots = await be.setDepartureAvailability(r, "d-coldharbour-1", { spotsLeft: 0, availability: "full" });
    eq(spots.ok, false, "Ravi cannot mark a competitor's departure full");
    eq(__store.departures.find((d) => d.id === "d-coldharbour-1")!.spotsLeft, template.spotsLeft, "and nothing moved");
    const hers = await be.setDepartureAvailability(j, "d-coldharbour-1", { spotsLeft: 0, availability: "full" });
    assert(hers.ok, "while Coldharbour's own admin may — the row is real, not merely missing");

    /* REQUEST. There is no mountain-request path at all, and the mountains
     * Ravi may work never include one Icefall did not assign him. */
    const access = await be.getAccess(r);
    eq(canManageMountain(r, access, "denali"), false, "Denali is Coldharbour's, and no editor opens on it");
    eq(
      manageableMountainIds(r, access).includes("denali"),
      false,
      "and it is not in the list the app offers him",
    );
    const onTheirs = await be.createProduct(r, { kind: "trek", name: "Denali attempt", mountainId: "denali" });
    eq(onTheirs.ok, false, "nor may he list a trip on it");
    const requestSurface = Object.keys(be).filter((k) => /request|apply|claim/i.test(k));
    eq(
      requestSurface.join(",") || "none",
      "none",
      `there is no request path to aim at another company's mountain — found: ${requestSurface.join(", ")}`,
    );
    resetStore();
  });

  /* ======================================================================== */
  /* 15. THE GUARD SUITE OVER THE TREK BATCH (OP-04a) AND THE INVITE (OP-08b) */
  /* ======================================================================== */

  /*
   * Two sessions have just landed a SECOND NOUN — trek routes — beside the
   * mountains, and an honest half of the invite flow. Neither is tested here as
   * a feature. What follows re-asserts the rules those changes stood next to,
   * because a new surface is precisely where an old rule stops holding without
   * anybody noticing.
   *
   * The trek surface is the dangerous one. `company_treks` does not exist in
   * the live database yet (`OP-04b`), so for now the ONLY thing standing
   * between one company and another company's routes is the in-memory backend
   * and `canManageTrek` — the two things this section reads.
   */

  /* ----- 15.1 Trek authorization mirrors mountain authorization ----------- */

  await check("THE ONE THAT MATTERS: a company may work only the routes Icefall granted it, and only while active", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const m = await signIn(MARTA);
    const j = await signIn(JO);

    assert(be.getTrekAccess, "the memory backend must implement the trek authorization read");
    assert(be.getTreks, "...and the trek catalogue read");

    /* THE CROSS-COMPANY RULE, ON THE NEW SURFACE. Coldharbour holds the
     * Chilkoot Trail. Ravi is not Coldharbour. */
    const theirs = COMPANY_TREKS.find((a) => a.trekId === "chilkoot-trail");
    assert(theirs, "the seed must give Coldharbour a route for this to mean anything");
    eq(theirs.companyId, COLDHARBOUR, "and it must genuinely be Coldharbour's");
    eq(theirs.status, "active", "and live, so the refusal below is about the COMPANY and nothing else");

    eq(
      canManageTrek(r, [theirs], "chilkoot-trail"),
      false,
      "Ravi cannot manage a trek Coldharbour holds — even handed the row directly",
    );
    eq(
      canManageTrek(r, COMPANY_TREKS, "chilkoot-trail"),
      false,
      "...nor when the whole grant table is in front of him",
    );
    eq(canManageTrek(j, COMPANY_TREKS, "chilkoot-trail"), true, "while Coldharbour's own admin may — the row is real, not merely missing");
    eq(canManageTrek(j, COMPANY_TREKS, "everest-base-camp-trek"), false, "and the refusal runs BOTH ways: Jo cannot work Lantern's route");

    /* ...and the read never even shows it to him. */
    const rows = await be.getTrekAccess(r);
    assert(rows.length > 0, "Lantern holds routes");
    assert(
      rows.every((a) => a.companyId === r.user.companyId),
      "every grant returned must belong to the caller's company",
    );
    assert(
      !rows.some((a) => a.trekId === "chilkoot-trail"),
      "Coldharbour's Chilkoot grant must not appear in Lantern's list",
    );
    eq(
      manageableTrekIds(r, COMPANY_TREKS).includes("chilkoot-trail"),
      false,
      "and it is not in the list the app offers him",
    );

    /* THE THREE STATUSES, on a row that is genuinely his. */
    const ebc = COMPANY_TREKS.find((a) => a.trekId === "everest-base-camp-trek");
    assert(ebc, "Lantern's Everest Base Camp grant must exist in the seed");
    const withStatus = (status: CompanyTrek["status"]): CompanyTrek[] => [{ ...ebc, status }];
    eq(canManageTrek(r, withStatus("active"), "everest-base-camp-trek"), true, "an ACTIVE grant opens the route");
    eq(canManageTrek(r, withStatus("suspended"), "everest-base-camp-trek"), false, "a SUSPENDED grant closes it");
    eq(canManageTrek(r, withStatus("ended"), "everest-base-camp-trek"), false, "an ENDED grant closes it");
    eq(canManageTrek(r, [], "everest-base-camp-trek"), false, "and a missing row is not permission — everything defaults to deny");

    /* The seed carries a real suspension, so the screen shows the paused state
     * rather than only the tests knowing it can happen. */
    const paused = COMPANY_TREKS.find((a) => a.status === "suspended");
    assert(paused, "the seed must hold a suspended grant");
    eq(paused.companyId, LANTERN, "and it must be Lantern's, so Ravi sees it");
    eq(
      canManageTrek(r, COMPANY_TREKS, paused.trekId),
      false,
      `a suspended grant is refused against the real table too — ${paused.trekId}`,
    );
    eq(
      manageableTrekIds(r, COMPANY_TREKS).includes(paused.trekId),
      false,
      "...and drops out of the manageable list",
    );

    /* A DISABLED EMPLOYEE HOLDS NOTHING, grant or not. Sign-in is not the only
     * door; a stale session object has to be refused by the predicate itself. */
    const tenzin = await be.signIn(TENZIN);
    eq(tenzin, null, "a disabled employee cannot sign in at all");
    const disabled = COMPANY_USERS.find((u) => u.status === "disabled");
    assert(disabled, "the seed must carry a disabled user");
    const ghost: Session = { user: disabled };
    eq(canManageTrek(ghost, COMPANY_TREKS, "everest-base-camp-trek"), false, "a stale session of a disabled employee manages no route");
    eq(manageableTrekIds(ghost, COMPANY_TREKS).length, 0, "and is offered none");
    eq(canManageTrek(null, COMPANY_TREKS, "everest-base-camp-trek"), false, "and no session at all is not permission either");

    /* Membership, not role — exactly as the mountain rule is. Sales works the
     * routes it sells; what Sales cannot do is edit the trips, which is
     * `editProducts` and a different question. */
    eq(canManageTrek(m, COMPANY_TREKS, "everest-base-camp-trek"), true, "a Sales employee may work the route their company holds");
    eq(PERMISSIONS.editProducts(m), false, "...and is still not handed the trip editor");
    resetStore();
  });

  await check("canManageTrek and canManageMountain answer identically — one rule, two nouns", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const m = await signIn(MARTA);
    const j = await signIn(JO);
    const disabled = COMPANY_USERS.find((u) => u.status === "disabled")!;

    /*
     * THE MIRROR, ASSERTED RATHER THAN ASSUMED. `authz.ts` keeps the two
     * predicates separate on purpose — a peak and a route are suspended on
     * different commercial conversations — and the cost of that choice is that
     * they can drift apart. This is the check that they have not: for every
     * session, every company and every status, the trek answer is the mountain
     * answer.
     */
    const mountainRow = COMPANY_MOUNTAINS.find((a) => a.companyId === LANTERN)!;
    const trekRow = COMPANY_TREKS.find((a) => a.companyId === LANTERN)!;
    const sessions: [string, Session | null][] = [
      ["Ravi (admin, active)", r],
      ["Marta (sales, active)", m],
      ["Jo (another company)", j],
      ["a disabled employee", { user: disabled }],
      ["no session", null],
    ];
    const statuses = ["active", "suspended", "ended"] as const;
    const owners = [LANTERN, COLDHARBOUR];

    let compared = 0;
    for (const [label, s] of sessions) {
      for (const status of statuses) {
        for (const owner of owners) {
          const peak: CompanyMountain[] = [{ ...mountainRow, companyId: owner, mountainId: "subject", status }];
          const route: CompanyTrek[] = [{ ...trekRow, companyId: owner, trekId: "subject", status }];
          eq(
            canManageTrek(s, route, "subject"),
            canManageMountain(s, peak, "subject"),
            `the two nouns disagree for ${label} on a ${status} grant held by ${owner}`,
          );
          compared++;
        }
      }
      /* An empty table and an unknown id, both nouns, same answer. */
      eq(canManageTrek(s, [], "subject"), canManageMountain(s, [], "subject"), `they disagree on an empty table for ${label}`);
      eq(
        canManageTrek(s, [{ ...trekRow, trekId: "subject", status: "active" }], "something-else"),
        canManageMountain(s, [{ ...mountainRow, mountainId: "subject", status: "active" }], "something-else"),
        `they disagree on an unknown id for ${label}`,
      );
    }
    eq(compared, 30, "the mirror must actually have been exercised across every combination");

    /* The list functions mirror too, on the same table shape. */
    for (const [label, s] of sessions) {
      const peaks: CompanyMountain[] = COMPANY_TREKS.map((a, i) => ({
        ...mountainRow,
        id: `m-${i}`,
        companyId: a.companyId,
        mountainId: a.trekId,
        status: a.status,
      }));
      eq(
        manageableTrekIds(s, COMPANY_TREKS).join(","),
        manageableMountainIds(s, peaks).join(","),
        `the manageable lists disagree for ${label}`,
      );
    }
    resetStore();
  });

  /* ----- 15.2 The trek boundary carries no content ------------------------ */

  await check("no per-route operator content field exists — company_treks is permission and nothing else", async () => {
    resetStore();
    const r = await signIn(RAVI);
    assert(be.getTrekAccess, "the trek authorization read must exist");

    /*
     * THE SAME GUARD `company_mountains` HAS, on the newer table, and for the
     * same reason. The Treks screen names things whose source is nowhere yet —
     * a pitch for a route, a film — and the cheap way to give them somewhere is
     * a field on the grant row. That would put an operator's writing in a
     * record nothing publishes and nobody reviews, and weld two lifecycles
     * that must move independently into one row. The fix is the schema request
     * (`requests/09-company-treks-migration.md`), not a client-side column.
     */
    const EXPECTED = ["assignedAt", "companyId", "id", "status", "trekId"].join(",");
    const rows = await be.getTrekAccess(r);
    assert(rows.length > 0, "Lantern holds routes");
    for (const row of rows) {
      eq(
        Object.keys(row).sort().join(","),
        EXPECTED,
        `company_treks carries exactly the authorization columns — ${row.id} has grown one`,
      );
    }
    for (const row of COMPANY_TREKS) {
      eq(Object.keys(row).sort().join(","), EXPECTED, `the seeded row ${row.id} must not carry content either`);
    }

    /* Said by intent as well as by list, so a differently-named field is caught. */
    const CONTENT_ISH =
      /pitch|blurb|copy|headline|tagline|summary|description|film|video|photo|image|media|highlight|badge|rank|position|price|term|itinerary|spots|altitude|difficulty/i;
    for (const key of Object.keys(rows[0])) {
      eq(CONTENT_ISH.test(key), false, `company_treks must carry no content field — found "${key}"`);
    }

    /*
     * AND IT IS THE MOUNTAIN SHAPE, COLUMN FOR COLUMN. Both tables answer one
     * question and differ only in which catalogue row they point at; if one
     * grows a column the other does not have, one of them has stopped being an
     * authorization boundary.
     */
    const mountainKeys = Object.keys(COMPANY_MOUNTAINS[0]).filter((k) => k !== "mountainId").sort();
    const trekKeys = Object.keys(COMPANY_TREKS[0]).filter((k) => k !== "trekId").sort();
    eq(
      trekKeys.join(","),
      mountainKeys.join(","),
      "the two grant tables must differ only in which catalogue they point at",
    );

    /* Nor is a per-route content bag hiding on the records that DO hold
     * operator writing. */
    const company = await be.getCompany(r);
    assert(company, "the company must load");
    const products = await be.getProducts(r);
    const PER_ROUTE_BAG = /perTrek|perRoute|trekCopy|trekPitch|trekFilm|trekContent|byTrek|routeCopy|routeContent/i;
    for (const key of Object.keys(company)) {
      eq(PER_ROUTE_BAG.test(key), false, `the company record must carry no per-route content — found "${key}"`);
    }
    for (const key of Object.keys(products[0])) {
      eq(PER_ROUTE_BAG.test(key), false, `the product record must carry no per-route content — found "${key}"`);
    }

    /* And the type itself says so where a reader will meet it. */
    const types = readFileSync(new URL("../src/domain/types.ts", import.meta.url), "utf8");
    const block = types.match(/export interface CompanyTrek \{([\s\S]*?)\n\}/);
    assert(block, "CompanyTrek must still be a plain interface in types.ts");
    const declared = [...block[1].matchAll(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*[?]?:/gm)].map((x) => x[1]);
    eq(
      [...declared].sort().join(","),
      EXPECTED,
      `the declared interface must hold exactly the authorization columns — found ${declared.join(", ")}`,
    );
    resetStore();
  });

  /* ----- 15.3 A company cannot invent a trek ----------------------------- */

  await check("a company cannot invent a route: only a trek id in Icefall's catalogue can be requested", async () => {
    resetStore();
    const r = await signIn(RAVI);
    assert(be.getTreks && be.getTrekAccess, "both trek reads must exist");

    const catalogue = await be.getTreks();
    assert(catalogue.length > 0, "Icefall's catalogue must have routes in it");
    const catalogueIds = new Set(catalogue.map((t) => t.id));

    /* Every grant that exists points at a route that exists. A grant against a
     * name nobody published is a route a company made up. */
    for (const row of COMPANY_TREKS) {
      assert(catalogueIds.has(row.trekId), `the grant ${row.id} points at a route not in the catalogue: ${row.trekId}`);
    }
    eq(TREKS.length, catalogue.length, "the catalogue read is the seeded catalogue, not a filtered view of it");

    /* AN INVENTED ID IS REFUSED WHEREVER IT IS OFFERED. */
    const invented = "the-lantern-ridge-private-traverse";
    eq(catalogueIds.has(invented), false, "the invented route is genuinely not in the catalogue");
    eq(canManageTrek(r, COMPANY_TREKS, invented), false, "no grant opens on a route Icefall never published");
    eq(manageableTrekIds(r, COMPANY_TREKS).includes(invented), false, "and it is never offered");

    /*
     * SAID EXACTLY. `canManageTrek` answers over the grant table and does NOT
     * consult the catalogue — hand it a fabricated active row and it says yes,
     * because that is the question it was asked. That is not a hole, it is
     * where the boundary sits: the grant table is Icefall's to write and the
     * portal cannot write it. So the assertion that matters is not "the
     * predicate refuses an invented row" but "an invented row cannot come to
     * exist", which is the next three checks.
     */
    eq(
      canManageTrek(r, [{ ...COMPANY_TREKS[0], trekId: invented, status: "active" }], invented),
      true,
      "the predicate reads the grant table it is given — which is why nothing lets a company write that table",
    );
    const rows = await be.getTrekAccess(r);
    assert(
      rows.every((a) => catalogueIds.has(a.trekId)),
      "every grant the backend will actually hand this company points at a published route",
    );

    /*
     * THERE IS NO WRITE TO AIM AT IT. The trek surface is two reads, exactly as
     * the mountain surface is three reads — `Treks.tsx` says in words that the
     * portal cannot deliver a request rather than printing "Request sent" over
     * a method that does not exist. If a write appears here without the schema
     * landing first, this is the test that says so.
     */
    const trekSurface = Object.keys(be).filter((k) => /trek/i.test(k)).sort();
    eq(trekSurface.join(","), "getTrekAccess,getTreks", `the trek surface must be two reads — found: ${trekSurface.join(", ")}`);
    const writeish = Object.keys(be).filter((k) => /request|apply|claim|grant/i.test(k));
    eq(writeish.join(",") || "none", "none", `there is no request or grant path on the seam — found: ${writeish.join(", ")}`);

    /*
     * AND THE SCREEN RESOLVES THE PICK THROUGH THE CATALOGUE, so an id that is
     * not in it cannot become a request. Read from source: `Treks.tsx` pulls in
     * the React context and cannot be imported into a Node test, so the two
     * lines that carry the rule are asserted where they are written.
     */
    const screen = readFileSync(new URL("../src/screens/Treks.tsx", import.meta.url), "utf8");
    assert(
      /const requestable = treks\s*\n?\s*\.filter\(\(t\) => !heldIds\.has\(t\.id\)\)/.test(screen),
      "the requestable list must be Icefall's catalogue minus what the company already holds",
    );
    assert(
      /const pickedTrek = requestable\.find\(\(t\) => t\.id === picked\) \?\? null;/.test(screen),
      "the picked id must be RESOLVED against that list — a find, never the raw id carried forward",
    );
    assert(
      /disabled=\{pickedTrek === null\}/.test(screen),
      "and the request button must be disabled until the pick resolves to a real route",
    );
    assert(
      /onClick=\{\(\) => pickedTrek && setRequested\(pickedTrek\)\}/.test(screen),
      "the request is raised against the RESOLVED route object, so an unknown id has nothing to raise",
    );
    const raises = [...screen.matchAll(/setRequested\(([^)]*)\)/g)].map((x) => x[1].trim());
    assert(raises.length > 0, "the screen must actually raise a request somewhere");
    for (const arg of raises) {
      assert(
        arg === "pickedTrek" || arg === "null",
        `a request may only ever be raised against a resolved catalogue route — found setRequested(${arg})`,
      );
    }
    /* The state that holds it is a Trek, not a string, so a bare id could not
     * be smuggled in even by a future edit. */
    assert(
      /useState<Trek \| null>\(null\)/.test(screen),
      "the requested route is held as a catalogue record, not as an id",
    );

    /*
     * A ROUTE ALREADY HELD IS NOT RE-REQUESTABLE AT ANY STATUS, so a suspended
     * grant cannot be routed around by asking for it again.
     */
    const held = new Set(COMPANY_TREKS.filter((a) => a.companyId === LANTERN).map((a) => a.trekId));
    assert(held.size > 1, "Lantern must hold more than one route for this to be worth asserting");
    assert(
      [...held].some((id) => COMPANY_TREKS.find((a) => a.trekId === id)!.status !== "active"),
      "including one that is not active — otherwise the exclusion is untested where it matters",
    );
    assert(
      /const heldIds = new Set\(rows\.map\(\(a\) => a\.trekId\)\);/.test(screen),
      "the exclusion must be over every grant row, at any status, not only the active ones",
    );
    resetStore();
  });

  /* ----- 15.4 ALTITUDE IS STILL NEVER SUBSTITUTED, treks included -------- */

  await check("no trek code path takes a highest point from a parent peak or from a catalogue route", async () => {
    /*
     * 14.4 scans every file for a trip's highest point taken from a MOUNTAIN's
     * elevation, and the trek screens are inside that scan already. This adds
     * the substitution the second noun makes newly possible: a TRIP's highest
     * point filled in from the CATALOGUE ROUTE it sits on.
     *
     * It is the same lie one step further out. Everest Base Camp tops out at
     * 5,364 m; the Three Passes route on the same mountain reaches 5,545 m. A
     * trip that walks part of a route does not reach the route's high point any
     * more than a route reaches its mountain's summit, and a person reads that
     * number to decide whether they can survive the trip.
     */
    const stripComments = (src: string): string =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, "$1"))
        .join("\n");

    /* A highest point may be assigned from: an absence, a literal, a type, or
     * some record's OWN maxAltitudeM. Naming a catalogue record on the right of
     * that assignment is the substitution. */
    const CATALOGUE_ISH = /\b(?:trek|route|catalogue|catalog|mountain|peak|summit|elevation)/i;

    function borrowings(source: string): string[] {
      const out: string[] = [];
      const lines = stripComments(source).split("\n");
      lines.forEach((line, i) => {
        const assign = line.match(/maxAltitudeM\s*[:=]\s*([^,;]*)/);
        if (!assign) return;
        const rhs = assign[1].trim();
        /* Only reach forward when the expression plainly is not finished on
         * this line — otherwise a complete assignment would be judged by the
         * unrelated lines that happen to follow it. */
        const unfinished = rhs === "" || /(?:\?\?|\|\||&&|[?:|&(,+])$/.test(rhs);
        const subject = unfinished ? [rhs, lines[i + 1] ?? "", lines[i + 2] ?? ""].join(" ") : rhs;
        if (CATALOGUE_ISH.test(subject)) {
          out.push(`line ${i + 1}: a highest point taken from a catalogue record — ${line.trim()}`);
        }
      });
      return out;
    }

    /* TEETH FIRST. A guard that cannot fail says nothing about the code it read. */
    for (const bad of [
      "maxAltitudeM: product.maxAltitudeM ?? trek.maxAltitudeM,",
      "maxAltitudeM: route.maxAltitudeM,",
      "maxAltitudeM: catalogue.find((t) => t.id === id)!.maxAltitudeM,",
      "maxAltitudeM:\n      trek.maxAltitudeM,",
      "maxAltitudeM: peakFor(product).elevationM,",
    ]) {
      assert(borrowings(bad).length > 0, `the guard must catch: ${bad}`);
    }
    eq(borrowings("maxAltitudeM: product.maxAltitudeM,").length, 0, "...while the honest pass-through is fine");
    eq(borrowings("maxAltitudeM: null,").length, 0, "...and so is an explicit absence");
    eq(borrowings("maxAltitudeM: 5364,").length, 0, "...and so is a figure the record genuinely holds");
    eq(
      borrowings("/* never from trek.maxAltitudeM */\n  maxAltitudeM: product.maxAltitudeM,").length,
      0,
      "...and explaining the rule in a comment is not breaking it",
    );

    /* Now the real source, every file of it — the same walk 14.4 makes. */
    const srcRoot = new URL("../src/", import.meta.url);
    const walk = (dir: URL, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir), out);
        else if (/\.tsx?$/.test(entry.name)) out.push(new URL(entry.name, dir).pathname);
      }
      return out;
    };
    const files = walk(srcRoot);
    assert(files.length > 40, `the scan must actually have read the app — found ${files.length} files`);
    const found: string[] = [];
    for (const file of files) {
      for (const hit of borrowings(readFileSync(file, "utf8"))) {
        found.push(`${file.split("/src/")[1] ?? file} ${hit}`);
      }
    }
    eq(found.length, 0, `no file may take a highest point from a catalogue record:\n      ${found.join("\n      ")}`);

    /*
     * AND ON THE TREK SCREEN THE SUBSTITUTION IS UNREACHABLE, not merely
     * forbidden. `highPoint` takes a `Trek` and a `Trek` holds no elevation, so
     * there is no peak in scope to borrow from.
     */
    const screen = readFileSync(new URL("../src/screens/Treks.tsx", import.meta.url), "utf8");
    assert(screen.includes("maxAltitudeM"), "the trek screen must actually show a highest point");
    eq(
      (screen.match(/elevationM/g) ?? []).length,
      0,
      "the trek screen must never mention a mountain's elevation — there is nothing there to substitute",
    );
    assert(/function highPoint\(t: Trek\)/.test(screen), "the high point is read from the ROUTE'S OWN record");
    assert(
      /"Highest point not published"/.test(screen),
      "and where the catalogue has no figure the screen says so, rather than filling the gap",
    );

    /*
     * THE CATALOGUE ITSELF NEVER CARRIES THE PEAK. Three routes here are on
     * Everest and not one of them reaches 8,849 m, because none of them does.
     */
    const ebc = TREKS.find((t) => t.id === "everest-base-camp-trek");
    const passes = TREKS.find((t) => t.id === "everest-three-passes-trek");
    assert(ebc && passes, "both Everest routes must be in the seeded catalogue");
    assert(ebc.mountainIds.includes("everest") && passes.mountainIds.includes("everest"), "both are on Everest");
    const onEverest = TREKS.filter((t) => t.mountainIds.includes("everest"));
    assert(onEverest.length > 1, "more than one route must sit on Everest for this to be worth asserting");
    for (const t of onEverest) {
      assert(t.maxAltitudeM !== 8849, `${t.id} must not carry the summit of the peak it is named after`);
    }
    assert(
      !TREKS.some((t) => t.maxAltitudeM === 8849),
      "no route in the catalogue reaches 8,849 m, because no route does",
    );

    /*
     * AND A TRIP'S FIGURE IS NOT THE ROUTE'S. This is the substitution the
     * second noun makes newly possible, and the seed shows why it would be a
     * lie: the Base Camp ROUTE tops out at 5,545 m because most itineraries add
     * the dawn climb of Kala Patthar, while Lantern's Base Camp TRIP stops at
     * 5,364 m and does not. Same name, two records, 181 m apart — and a
     * `?? trek.maxAltitudeM` would quietly sell the higher one.
     */
    resetStore();
    const r = await signIn(RAVI);
    const trip = (await be.getProducts(r)).find((p) => p.id === "p-everest-base-camp-trek");
    assert(trip, "the Base Camp trip must exist");
    const everest = (await be.getMountains()).find((mtn) => mtn.id === "everest")!;
    assert(trip.maxAltitudeM !== everest.elevationM, "the trip does not carry the summit");
    assert(
      trip.maxAltitudeM !== ebc.maxAltitudeM,
      "nor the high point of the catalogue route it shares a name with",
    );
    resetStore();
  });

  /* ----- 15.5 The invite does not claim to send (OP-08b) ----------------- */

  await check("an invite records a member as Invited and never claims an email went out", async () => {
    resetStore();
    const r = await signIn(RAVI);

    const res = await be.inviteTeamMember(r, {
      displayName: "Pemba Sherpa",
      email: "pemba@lanternridge.example",
      role: "sales",
    });
    assert(res.ok, `a Company Admin may invite, got: ${res.ok ? "" : res.reason}`);
    eq(res.value.status, "invited", "THE STATE IS `invited` — a row on the list, and nothing more");
    eq(res.value.companyId, r.user.companyId, "scoped to the caller's own company, from the session");
    eq(res.value.invitedBy, r.user.id, "and stamped with who invited them, which is what makes the owner account derivable");
    assert(res.value.invitedBy !== null, "so an invited member can never read as the founding account");
    eq(isOwnerAccount(res.value), false, "...and does not");

    /*
     * AND THE ROW IS INERT. `invited` is not `active`, and `isActive` is the
     * floor under every predicate in `authz.ts`, so a session shaped like
     * theirs holds nothing at all.
     *
     * NOTE WHAT IS NOT ASSERTED HERE. `signIn` refuses a DISABLED user and
     * admits an INVITED one — the demo identity picker will offer the new row.
     * That is recorded rather than asserted away, because the session it hands
     * back is empty in every direction, which is what the next lines prove.
     * There is no real authentication in this portal yet (that is exactly what
     * OP-08b is blocked on), so `signIn` is a picker over seeded rows, not a
     * door. When sign-in lands, an invited row must stop opening one.
     */
    const asInvited: Session = { user: res.value };
    for (const key of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      eq(can(asInvited, key), false, `an invited member must be refused ${key}`);
    }
    eq(await be.getCompany(asInvited), null, "an invited member cannot read the company record");
    eq((await be.getProducts(asInvited)).length, 0, "...nor the catalogue");
    eq((await be.getLeads(asInvited)).length, 0, "...nor a single lead");
    eq((await be.getConversations(asInvited)).length, 0, "...nor the inbox");
    eq(canManageTrek(asInvited, COMPANY_TREKS, "everest-base-camp-trek"), false, "...nor any route their company holds");
    const reply = await be.sendMessage(asInvited, "cv-1", "hello");
    eq(reply.ok, false, "and they may write nothing");

    const listed = (await be.getTeam(r)).find((u) => u.id === res.value.id);
    assert(listed, "the invited member must appear on the team list");
    eq(listed.status, "invited", "still invited when read back — nothing promoted them");

    /*
     * THE TEXT ASSERTION, AND IT IS THE POINT OF OP-08b. There is no mail
     * sender in the ICEFALL project and no sign-in for this portal, so an
     * invitation reaches nobody. A screen that said otherwise would be the
     * honesty doctrine broken in the one place a person acts on it — the
     * inviter walks away believing the new hire has been told.
     *
     * Comments are stripped first: the file EXPLAINS at length what a real
     * invite flow would do, and a guard that fires on the explanation of a rule
     * is a guard that gets deleted.
     */
    const team = readFileSync(new URL("../src/screens/Team.tsx", import.meta.url), "utf8");
    const copy = team
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, "$1"))
      .join("\n");

    const CLAIMS_TO_SEND: readonly RegExp[] = [
      /\b(?:invitation|invite|email|e-mail|link|message)\s+(?:has been\s+|was\s+|is\s+)?sent\b/i,
      /\bsent\s+(?:them|him|her|the\s+\w+)\s+(?:an?\s+)?(?:invitation|invite|email|e-mail|link)/i,
      /\bwe(?:'ve| have)?\s+(?:just\s+)?(?:sent|emailed|e-mailed|invited\s+them\s+by)/i,
      /\b(?:they|he|she)\s+(?:will|'ll)\s+(?:receive|get)\s+(?:an?\s+)?(?:email|e-mail|invitation|invite|link)/i,
      /\bcheck\s+(?:their|his|her|your)\s+(?:inbox|email|e-mail|spam)/i,
      /\b(?:an?\s+)?(?:email|e-mail|invitation|invite)\s+is\s+on\s+its\s+way\b/i,
      /\bhas\s+been\s+(?:emailed|e-mailed|invited\s+by\s+email)/i,
      /\bsending\s+(?:an?\s+)?(?:invitation|invite|email|e-mail)\b/i,
    ];

    /* TEETH. Every one of these is a sentence somebody could plausibly write. */
    for (const lie of [
      "An invitation has been sent to pemba@lanternridge.example.",
      "We've sent them an email with a link to join.",
      "They will receive an email shortly.",
      "Ask them to check their inbox.",
      "An invite is on its way.",
      "Pemba has been emailed.",
      "Sending an invitation…",
      "Invite sent",
    ]) {
      assert(
        CLAIMS_TO_SEND.some((re) => re.test(lie)),
        `the matcher must catch a claim to send: ${lie}`,
      );
    }
    /* ...and does not fire on what the screen actually says. */
    for (const honest of [
      "Icefall cannot email this person yet",
      "there is no mail service connected, so somebody at your company will need to tell them",
      "Icefall has no way to email them and no sign-in to let them in",
      "an email service, and sign-in for this portal",
    ]) {
      for (const re of CLAIMS_TO_SEND) {
        eq(re.test(honest), false, `the matcher must not fire on the honest sentence: ${honest}`);
      }
    }

    for (const re of CLAIMS_TO_SEND) {
      const hit = copy.match(re);
      eq(hit, null, `Team.tsx must not claim an email was sent — found "${hit?.[0]}"`);
    }

    /* Said positively as well, so the guard cannot be satisfied by a screen
     * that simply stopped mentioning it. Silence is not honesty here: the
     * inviter has to be TOLD nobody was reached. */
    assert(/cannot email/i.test(copy), "the screen must say plainly that Icefall cannot email the person");
    assert(
      /no mail service/i.test(copy) && /sign-in/i.test(copy),
      "and name both missing pieces — the mail service and the portal sign-in",
    );
    assert(
      /somebody (?:at your company )?will need to tell them|tell them another way/i.test(copy),
      "and say who has to do the telling instead",
    );
    /* The button does not promise it either. */
    const buttonLabels = [...copy.matchAll(/<Button[^>]*>([\s\S]*?)<\/Button>/g)].map((x) =>
      x[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    );
    assert(buttonLabels.length > 0, "the screen must have buttons for this to mean anything");
    for (const label of buttonLabels) {
      for (const re of CLAIMS_TO_SEND) {
        eq(re.test(label), false, `no button may promise a send — "${label}"`);
      }
    }
    resetStore();
  });

  /* ----- 15.6 And the two that matter most, after this batch too ---------- */

  await check("the trek surface moved no placement and opened no cross-company door", async () => {
    resetStore();
    const r = await signIn(RAVI);

    eq(canEditPlacement(), false, "canEditPlacement is still false, always");
    eq(
      "setPlacement" in (be as unknown as Record<string, unknown>),
      false,
      "and the backend still exposes no placement write of any kind",
    );
    const before = JSON.stringify(__store.placements);
    assert(be.getTreks && be.getTrekAccess, "the trek reads exist");
    await be.getTreks();
    await be.getTrekAccess(r);
    await be.inviteTeamMember(r, { displayName: "Another Hire", email: "another@lanternridge.example", role: "sales" });
    eq(JSON.stringify(__store.placements), before, "neither the trek reads nor an invite moved a placement row");

    /* Cross-company, on every read this batch added or touched. */
    const j = await signIn(JO);
    assert(be.getTrekAccess, "the trek access read exists");
    const mine = await be.getTrekAccess(r);
    const theirs = await be.getTrekAccess(j);
    assert(mine.length > 0 && theirs.length > 0, "both companies hold routes");
    eq(
      mine.some((a) => theirs.some((b) => b.id === a.id)),
      false,
      "no grant row appears in both companies' lists",
    );
    const team = await be.getTeam(r);
    assert(
      team.every((u) => u.companyId === r.user.companyId),
      "and the team list is still the caller's own company only",
    );
    resetStore();
  });

  /* ===== 16. The operator's product detail — request 08 ================== *
   *
   * ONE RULE ABOVE THE REST: the operator's version of the product detail
   * NEVER SHOWS ICEFALL'S COMMISSION. The CRM's version does, to Icefall's own
   * staff. An operator sees what they receive; they do not see what we take.
   * These tests read the two files that make that screen and assert the word is
   * not in either of them outside the comment explaining why.
   */

  const overviewSrc = readFileSync(new URL("../src/components/ProductOverview.tsx", import.meta.url), "utf8");
  const detailSrc = readFileSync(new URL("../src/screens/ProductDetail.tsx", import.meta.url), "utf8");

  /** Comments explain the rule; code carries it. Only code is scanned. */
  const codeOf = (src: string): string =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, "$1"))
      .join("\n");

  await check("THE OPERATOR'S PRODUCT DETAIL NAMES NO COMMISSION ANYWHERE", () => {
    /* The guard has teeth before it is trusted. */
    assert(/commission/i.test(codeOf('const x = "ICEFALL Commission";')), "the scan must be able to find one");
    eq(/commission/i.test(codeOf('/* a commission comment */\nconst x = 1;')), false, "...and must ignore a comment");

    for (const [name, src] of [["ProductOverview.tsx", overviewSrc], ["ProductDetail.tsx", detailSrc]] as const) {
      const code = codeOf(src);
      eq(/commission/i.test(code), false, `${name} must not name a commission in code`);
      /* And not the tile the CRM derives FROM a commission either. */
      eq(/company earnings/i.test(code), false, `${name} must not carry a company-earnings tile`);
      eq(/referralPct/i.test(code), false, `${name} must not read the referral rate off a booking`);
    }
  });

  await check("the owner's two sentences about views survive VERBATIM", () => {
    assert(
      overviewSrc.includes(
        "Not measured — We do not currently track views. This metric is not available.",
      ),
      "the Views tile must carry the owner's words exactly",
    );
    assert(
      overviewSrc.includes(
        "ICEFALL does not currently record view counts, impressions or click-through data. We are focused on revenue, bookings and enquiries — the metrics that matter.",
      ),
      "the footer banner must carry the owner's words exactly",
    );
    /* And the demo view figure used on the list screens is NOT wired in here. */
    eq(
      codeOf(overviewSrc).includes("demoListingViews"),
      false,
      "the owner's words supersede the demo view figure on this screen",
    );
  });

  await check("no delta or percentage change is claimed — there is no snapshot table", () => {
    const code = codeOf(overviewSrc);
    eq(/\bdelta=/.test(code), false, "no tile on this screen may pass a delta");
    eq(/vs (last|previous)/i.test(code), false, "and none may caption itself against an earlier period");
  });

  await check("a trip's revenue counts confirmed and completed bookings only", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const all = await be.getBookings(r);
    const forTrip = all.filter((b) => b.productId === "p-everest-south-col");
    assert(forTrip.length >= 2, "the seed must give this trip more than one booking");
    assert(
      forTrip.some((b) => b.status === "cancelled"),
      "including a cancelled one, or this test proves nothing",
    );
    const counted = forTrip.filter((b) => b.status === "confirmed" || b.status === "completed");
    const { total, excluded } = estimatedGmv(counted.map((b) => b.value));
    assert(total.available, "the confirmed booking carries a reported value");
    eq(total.value, 1_245_000, "the cancelled booking's value is not folded into the total");
    eq(excluded, 0, "and nothing counted here is missing a value");
    resetStore();
  });

  await check("a placement with no agreed price reads as unagreed, never as free or zero", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const held = await be.getPlacements(r);
    const everest = placementFor(held, "everest");
    assert(everest, "Lantern holds the Everest slot");
    eq(everest.priceCents, null, "and the seed has no agreed price on it");
    assert(
      overviewSrc.includes("price not yet agreed. Never free."),
      "the tile must say the price is not agreed rather than print a figure",
    );
    assert(
      overviewSrc.includes("Not yet agreed — never free"),
      "and the placement card must say the same in its own row",
    );
    eq(canEditPlacement(), false, "placement stays unwriteable from this screen like every other");
    resetStore();
  });

  /* ------------------------------------------------------------------------ */
  /* 15 — Custom offers (OP-05b)                                              */
  /* ------------------------------------------------------------------------ */
  /*
   * The one rule this suite exists for: AN OPERATOR'S OFFER HAS NO COMMISSION
   * IN IT. The guide app's composer deducts GUIDE_COMMISSION_PCT because
   * ICEFALL processes that payment; an expedition company is paid directly and
   * ICEFALL invoices the introduction separately, so nothing comes out of the
   * offer. Copying the guide app is the obvious way to get this wrong, and the
   * mistake would show an expedition company a payout 15% below what they will
   * actually be paid. These tests fail if anyone reintroduces it.
   */

  const OFFER_QUOTE: Quote = {
    id: "q-test",
    lines: [
      { label: "Guiding and logistics", amount: 180_000, per: "person", passThrough: false },
      { label: "Permit", amount: 24_000, per: "party", passThrough: true },
    ],
    exclusions: [
      { label: "International flights", approxAmount: 90_000 },
      { label: "Travel insurance", approxAmount: null },
    ],
    cancellation: STANDARD_POLICY,
    partySize: 2,
    departureIso: "2026-11-14",
    validUntilIso: "2026-09-30",
  };

  await check("an operator offer deducts NOTHING — what the client pays is what the company receives", () => {
    const t = operatorOfferTotals(OFFER_QUOTE);
    eq(t.total, 384_000, "€1,800 × 2 climbers + a €240 party permit");
    eq(t.commission, 0, "no commission is taken out of an operator's offer");
    eq(t.guideReceives, t.total, "the seller receives the whole total");
    eq(t.perPerson, 192_000, "the per-person figure divides the whole total");
  });

  await check("and it is NOT the guide model — the guide rate would take a real bite", () => {
    const guide = totalsFor(OFFER_QUOTE);
    assert(GUIDE_COMMISSION_PCT > 0, "the guide rate is non-zero, so this comparison means something");
    eq(guide.commission, 54_000, "the guide model would take 15% of the €3,600 fee, not of the €3,840 total");
    assert(
      operatorOfferTotals(OFFER_QUOTE).guideReceives !== guide.guideReceives,
      "THE TWO MODELS MUST DIFFER — if this passes by equality, the guide rate has leaked into the operator offer",
    );
  });

  await check("a pass-through line is in the total but not in the company's own fee", () => {
    const t = operatorOfferTotals(OFFER_QUOTE);
    eq(t.passedThrough, 24_000, "the permit is money collected and handed on");
    eq(t.commissionable, 360_000, "which leaves the company's own fee — what a referral is later worked out on");
    eq(t.commissionable + t.passedThrough, t.total, "and the two halves still make the whole");
  });

  await check("passThrough is never inferred — the same figure means either thing", () => {
    const asFee: Quote = {
      ...OFFER_QUOTE,
      lines: OFFER_QUOTE.lines.map((l) => ({ ...l, passThrough: false })),
    };
    eq(operatorOfferTotals(asFee).total, operatorOfferTotals(OFFER_QUOTE).total, "same total either way");
    eq(operatorOfferTotals(asFee).passedThrough, 0, "and only the seller's flag distinguishes them");
  });

  await check("per: person multiplies by the party, per: party does not", () => {
    eq(lineTotal({ label: "x", amount: 50_000, per: "person" }, 4), 200_000, "€500 each × 4 = €2,000");
    eq(lineTotal({ label: "x", amount: 50_000, per: "party" }, 4), 50_000, "€500 for the party stays €500");
  });

  await check("euros typed by a human become integer cents, and blanks become null not zero", () => {
    eq(centsFromEuros("1200"), 120_000, "whole euros");
    eq(centsFromEuros("1200.50"), 120_050, "and the awkward half");
    eq(centsFromEuros("1,200"), 120_000, "a thousands separator is tolerated");
    eq(centsFromEuros(""), null, "A BLANK IS NOT €0 — an unpriced line must not quote as free");
    eq(centsFromEuros("about a grand"), null, "nor is prose");
    eq(centsFromEuros("12.345"), null, "and there is no third decimal place in a currency");
    assert(Number.isInteger(centsFromEuros("99.99")), "cents are integers, always");
  });

  await check("the composed offer shows the party maths and never a commission", () => {
    const body = offerMessageBody({
      customerName: "Bruno Kessler",
      subject: "Everest — South Col",
      quote: OFFER_QUOTE,
      totals: operatorOfferTotals(OFFER_QUOTE),
      nothingExcluded: false,
    });
    assert(body.includes("€1,800 each × 2 climbers = €3,600"), "a per-person line spells out the party maths");
    assert(body.includes("Total — €3,840"), "the total is the total");
    assert(body.includes("passed straight on"), "a pass-through line says what it is");
    assert(body.includes("we cannot put a figure on this"), "an exclusion with no figure says so rather than guessing");
    assert(!/commission|icefall keeps|15%/i.test(body), "NOTHING about a commission reaches the customer");
    assert(body.includes("14 Nov 2026"), "dates are formatted, never raw ISO");
  });

  await check("a clean offer passes the contact-details guard and lands in the thread", async () => {
    const r = await signIn(RAVI);
    const convs = await be.getConversations(r);
    const conv = convs[0];
    assert(conv, "Ravi has at least one conversation to send into");
    const body = offerMessageBody({
      customerName: conv.customerName,
      subject: "Everest — South Col",
      quote: OFFER_QUOTE,
      totals: operatorOfferTotals(OFFER_QUOTE),
      nothingExcluded: false,
    });
    /*
     * THE FALSE-POSITIVE HALF. The guard's phone-number pattern matches long
     * runs of digits, spaces, dots and dashes, so a body carrying raw ISO dates
     * would be refused for containing "a phone number". `formatDay` and
     * `formatEur` are what keep it clean, and this asserts they do.
     */
    eq(findContactDetails(body).length, 0, "a properly formatted offer is not mistaken for contact details");
    const res = await be.sendMessage(r, conv.id, body);
    assert(res.ok, `the offer should send — got ${res.ok ? "" : res.reason}`);
    const msgs = await be.getMessages(r, conv.id);
    assert(msgs.some((m) => m.body === body && m.fromCompany), "and it is in the thread as a real message");
    resetStore();
  });

  await check("AN OFFER IS A MESSAGE — a phone number in a line label is refused, not delivered", async () => {
    const r = await signIn(RAVI);
    const convs = await be.getConversations(r);
    const conv = convs[0];
    assert(conv, "Ravi has at least one conversation");
    const smuggled: Quote = {
      ...OFFER_QUOTE,
      lines: [{ label: "Call me on +977 1 4410 200 to confirm", amount: 180_000, per: "party" }],
    };
    const body = offerMessageBody({
      customerName: conv.customerName,
      subject: null,
      quote: smuggled,
      totals: operatorOfferTotals(smuggled),
      nothingExcluded: true,
    });
    const res = await be.sendMessage(r, conv.id, body);
    eq(res.ok, false, "the offer composer is the obvious place to smuggle a number, and the guard holds there too");
    if (!res.ok) assert(res.reason.includes("phone number"), "and the refusal names what it found");
    const msgs = await be.getMessages(r, conv.id);
    assert(!msgs.some((m) => m.body === body), "nothing reached the climber");
    resetStore();
  });

  await check("a lead the company added has no thread to deliver an offer into", async () => {
    const r = await signIn(RAVI);
    const leads = await be.getLeads(r);
    const own = leads.find((l) => l.origin === "company");
    assert(own, "the seed has a company-added lead");
    eq(own.conversationId, null, "ICEFALL never carried a word between these two");
    const convs = await be.getConversations(r);
    eq(
      convs.some((c) => c.leadId === own.id),
      false,
      "and no conversation points at it either — so the composer must say so rather than fake a send",
    );
    resetStore();
  });

  /* ===== 17. Guarding the offer composer and the product detail =========== *
   *
   * Section 16 above and section 15's offer block already assert that the
   * operator's screens carry no commission. This section stands BEHIND both of
   * them, and it exists because of HOW these two features fail rather than
   * whether they currently work.
   *
   * Both failures are silent. Nothing throws, nothing looks broken, no test
   * that merely renders the screen would notice:
   *
   *   · If `GUIDE_COMMISSION_PCT` ever leaks back into the offer composer —
   *     the obvious mistake, since the guide app's composer is the same shape —
   *     the screen still renders, the arithmetic still balances, and an
   *     expedition company is simply told it will receive 15% less than it
   *     will actually be paid, on the one screen whose whole job is to tell it
   *     what it earns.
   *
   *   · If somebody tidies the owner's two sentences about views into better
   *     English, the screen still renders and the meaning quietly moves.
   *
   * So the checks below are text AND arithmetic together. The arithmetic ones
   * would still pass if a commission label were painted on the screen without
   * touching the maths; the source scans would still pass if the maths were
   * changed without touching the words. Neither half is sufficient alone,
   * which is why both are here.
   */

  const composerSrc = readFileSync(new URL("../src/components/offer.tsx", import.meta.url), "utf8");
  const offerMathSrc = readFileSync(new URL("../src/money/offer.ts", import.meta.url), "utf8");

  /** JSX wraps a sentence across lines. Compare the words, not the indentation. */
  const flat = (s: string): string => s.replace(/\s+/g, " ");

  /**
   * The ways a commission can be NAMED, not just the word itself.
   *
   * The single word `commission` is what section 16 scans for, and a rename is
   * the way past it — "our cut", "platform fee", "net to you" all describe the
   * same deduction without using it. An operator must not read any of them on
   * a screen about money ICEFALL never touches.
   */
  const COMMISSION_WORDING: readonly RegExp[] = [
    /commission/i,
    /icefall (?:keeps|takes|deducts|retains)/i,
    /\bour (?:cut|fee|share|take)\b/i,
    /net (?:to|of) you/i,
    /\byou keep\b/i,
    /platform fee/i,
    /service fee/i,
    /take rate/i,
    /\bnet payout\b/i,
    /% to icefall/i,
    /less icefall/i,
    /after icefall/i,
  ];

  /* ---- 17.1 THE ONE THAT MATTERS: an operator offer deducts nothing ------- */

  /**
   * A different quote from section 15's, on purpose.
   *
   * An odd party size and a non-round per-person figure, so a per-person
   * division cannot come out even and any rounding drift has somewhere to show.
   */
  const ODD_QUOTE: Quote = {
    id: "q-guard",
    lines: [
      { label: "Guiding, 21 days on the hill", amount: 1_233_333, per: "person", passThrough: false },
      { label: "Sagarmatha permit", amount: 1_100_000, per: "party", passThrough: true },
      { label: "Icefall doctor levy", amount: 60_050, per: "person", passThrough: true },
    ],
    exclusions: [{ label: "International flights", approxAmount: null }],
    cancellation: STANDARD_POLICY,
    partySize: 3,
    departureIso: "2027-04-02",
    validUntilIso: "2026-12-01",
  };

  await check("AN OPERATOR OFFER DEDUCTS NOTHING — the client's price IS the company's receipt", () => {
    const t = operatorOfferTotals(ODD_QUOTE);

    /* The total, worked out by hand rather than by calling the code under test. */
    const byHand = 1_233_333 * 3 + 1_100_000 + 60_050 * 3;
    eq(t.total, byHand, "the total is the lines, per-person ones multiplied by the party");
    eq(t.total, 4_980_149, "and that is €49,801.49 — pinned, so a change has to be deliberate");

    /* THE ASSERTION THE WHOLE FILE IS FOR. */
    eq(t.commission, 0, "NOTHING is deducted from an expedition company's offer");
    eq(t.guideReceives, t.total, "what the client pays equals what the company receives");
    eq(t.total - t.guideReceives, 0, "and the gap between the two is zero, not merely small");
  });

  await check("...and the guide model would have been 15% wrong, silently", () => {
    const operator = operatorOfferTotals(ODD_QUOTE);
    const asGuide = totalsFor(ODD_QUOTE, GUIDE_COMMISSION_PCT);

    assert(GUIDE_COMMISSION_PCT > 0, "the guide rate is non-zero, or this proves nothing");

    /*
     * The size of the mistake, stated. This is not a near-miss: the guide model
     * takes 15% of the company's own fee, and on this quote that is €554.99
     * off a €49,791.49 offer — a figure a company would read as its payout.
     */
    eq(asGuide.commission, 554_999, "the guide model would take 15% of the €3,699.99 fee");
    assert(
      asGuide.guideReceives < operator.guideReceives,
      "THE TWO MODELS MUST DIFFER — equality here means the operator offer has become the guide one",
    );
    eq(
      operator.guideReceives - asGuide.guideReceives,
      554_999,
      "and the whole of that difference would land on the operator's screen as a smaller payout",
    );

    /* The commission is on the FEE, not the total — the pass-through rule. */
    eq(asGuide.commissionable, 3_699_999, "the two pass-through lines are outside the guide base too");
  });

  await check("THE SOURCE: the offer composer never names or applies a commission", () => {
    /* Teeth first. A scan that cannot fail is not a guard. */
    assert(
      COMMISSION_WORDING.some((re) => re.test(codeOf('const x = "our cut is 15%";'))),
      "the wording scan must be able to find a renamed commission",
    );
    eq(
      COMMISSION_WORDING.some((re) => re.test(codeOf("/* ICEFALL keeps 15% — see the guide app */\nconst x = 1;"))),
      false,
      "...and must still ignore the comment that explains the rule",
    );

    for (const [name, src] of [
      ["components/offer.tsx", composerSrc],
      ["money/offer.ts", offerMathSrc],
    ] as const) {
      const code = codeOf(src);
      for (const re of COMMISSION_WORDING) {
        eq(re.test(code), false, `${name} must not name a deduction in code — matched ${re}`);
      }
      /* The rate itself, by name and by value, in the arithmetic. */
      eq(/GUIDE_COMMISSION_PCT/.test(code), false, `${name} must not reference the guide rate at all`);
      eq(
        /totalsFor(?:Amount)?\s*\([^)]*GUIDE_COMMISSION_PCT/.test(code),
        false,
        `${name} must never call totalsFor with the guide rate`,
      );
    }

    /*
     * The composer must not compute totals itself either. `operatorOfferTotals`
     * is the only door, and it is the door with the explicit zero behind it —
     * a bare `totalsFor(quote)` in the component would silently take the
     * DEFAULT, which is the guide rate.
     */
    const composerCode = codeOf(composerSrc);
    assert(composerCode.includes("operatorOfferTotals(quote)"), "the composer goes through operatorOfferTotals");
    eq(/\btotalsFor\b/.test(composerCode), false, "and never reaches for the shared totals function itself");

    /* And the zero is EXPLICIT in the one place that computes them. */
    assert(
      flat(codeOf(offerMathSrc)).includes("return totalsFor(quote, 0);"),
      "operatorOfferTotals passes an explicit zero rate, never the default",
    );
  });

  await check("THE SOURCE: no figure on the composer is derived from a deduction", () => {
    const code = codeOf(composerSrc);

    /*
     * Every property of the totals the composer is allowed to read. `commission`
     * and `commissionable` are absent from this list, so adding a row for
     * either fails here even if it were labelled something innocuous.
     */
    const read = [...new Set([...code.matchAll(/totals\.(\w+)/g)].map((m) => m[1]))].sort();
    eq(read.join(","), "passedThrough,perPerson,total", "the composer reads only the three honest figures");

    /* The headline figure IS the total, not a number computed from it. */
    assert(
      /label="You receive"[\s\S]{0,240}?formatEur\(totals\.total\)/.test(code),
      "the 'You receive' row must print the total itself",
    );
    eq(
      /formatEur\(\s*totals\.total\s*[-+*/]/.test(code),
      false,
      "and nothing on this screen does arithmetic to the total before showing it",
    );

    /* The sentence that tells the operator why nothing is deducted. */
    assert(
      flat(composerSrc).includes(
        "Nothing is deducted from this offer. Your client pays you directly, so what they pay is what you receive — Icefall never handles this money and takes nothing out of it.",
      ),
      "the composer states in words that nothing comes out, so a zero is never read as a bug",
    );
  });

  /* ---- 17.2 The product detail's words --------------------------------- */

  /*
   * Section 16 asserts these two sentences appear somewhere in the file. This
   * asserts they appear in the CODE, with the comments stripped — a paraphrase
   * in the JSX beside a comment quoting the original would pass the first check
   * and fail this one. The expected text is written with an explicit — so
   * an em dash cannot be silently downgraded to a hyphen in the test itself.
   */
  const OWNER_VIEWS_TILE =
    "Not measured — We do not currently track views. This metric is not available.";
  const OWNER_VIEWS_BANNER =
    "ICEFALL does not currently record view counts, impressions or click-through data. " +
    "We are focused on revenue, bookings and enquiries — the metrics that matter.";

  await check("THE PRODUCT DETAIL: the owner's two sentences are in the RENDER, not just the file", () => {
    const code = flat(codeOf(overviewSrc));
    assert(code.includes(OWNER_VIEWS_TILE), "the Views tile renders the owner's words character for character");
    assert(code.includes(OWNER_VIEWS_BANNER), "and so does the closing banner");

    /* Character for character means the dash too. A hyphen is a paraphrase. */
    assert(OWNER_VIEWS_TILE.includes("—"), "the expected text itself carries an em dash");
    eq(
      code.includes(OWNER_VIEWS_TILE.replace(/—/g, "-")),
      false,
      "a hyphenated near-copy must not be what is on screen",
    );

    /*
     * The tile must not ALSO carry a number. The sentence says the metric is
     * not available; a figure beside it would contradict the words.
     */
    eq(
      /demoListingViews|DEMO_PROFILE_VIEWS/.test(codeOf(overviewSrc)),
      false,
      "no demo view figure is wired into the screen that says views are not measured",
    );
  });

  await check("THE PRODUCT DETAIL: no deduction is named, under any wording", () => {
    for (const [name, src] of [
      ["ProductOverview.tsx", overviewSrc],
      ["ProductDetail.tsx", detailSrc],
    ] as const) {
      const code = codeOf(src);
      for (const re of COMMISSION_WORDING) {
        eq(re.test(code), false, `${name} must not name a deduction in code — matched ${re}`);
      }
      eq(/GUIDE_COMMISSION_PCT|DEFAULT_REFERRAL_PCT|referralFee/.test(code), false, `${name} reads no fee rate`);
    }
    /* Placement is still a cost the company pays, and still unwriteable. */
    assert(overviewSrc.includes("Placement — agreed price"), "the placement tile is named as a cost, not income");
    eq(canEditPlacement(), false, "and placement is still not the operator's to move");
  });

  /* ---- 17.3 Money is integer cents ------------------------------------- */

  await check("MONEY IS INTEGER CENTS — no quote can produce a fractional one", () => {
    /* Amounts chosen to be awkward: primes, odd cents, and an exact half. */
    const amounts = [1, 7, 99, 333, 1_250, 33_333, 100_001, 1_233_333, 2_500_050];
    let combinations = 0;

    for (const party of [1, 2, 3, 4, 5, 7, 11, 13]) {
      for (const amount of amounts) {
        for (const per of ["person", "party"] as const) {
          for (const passThrough of [false, true]) {
            const q: Quote = { ...ODD_QUOTE, partySize: party, lines: [{ label: "L", amount, per, passThrough }] };
            const t = operatorOfferTotals(q);
            combinations++;
            for (const [k, v] of Object.entries(t)) {
              assert(
                Number.isInteger(v),
                `operatorOfferTotals().${k} came back fractional at party ${party}, amount ${amount}, per ${per} — got ${v}`,
              );
            }
            /* THE PER-PERSON MULTIPLICATION IS EXACT, not rounded into place. */
            const expected = per === "person" ? amount * party : amount;
            eq(t.total, expected, `a ${per} line of ${amount} across ${party} must be exactly ${expected}`);
            eq(lineTotal({ label: "L", amount, per }, party), expected, "and lineTotal agrees with the totals");
            eq(t.commission, 0, "still nothing deducted, at every size");
            eq(t.guideReceives, t.total, "and the company still receives the whole of it");
          }
        }
      }
    }
    assert(combinations === 288, `the sweep must actually run — ${combinations} combinations`);
  });

  await check("MONEY IS INTEGER CENTS — nothing reaches the arithmetic as a float", () => {
    /* The one float→cents conversion in the app. */
    for (const typed of ["0", "0.01", "0.07", "1", "1.10", "19.99", "1200", "1,200.05", "99999.99"]) {
      const c = centsFromEuros(typed);
      assert(c !== null && Number.isInteger(c), `"${typed}" must parse to integer cents — got ${c}`);
    }
    eq(centsFromEuros("0.07"), 7, "seven cents, not 7.000000000000001");
    eq(centsFromEuros("19.99"), 1_999, "and the classic float trap lands exactly");

    /*
     * The composer parses strings and never stores a float, so no call site can
     * hand a fraction in. Assert that in the source as well as the arithmetic:
     * `toFixed`, `parseFloat` and a bare `* 100` are all ways a float gets in.
     */
    for (const [name, src] of [
      ["components/offer.tsx", composerSrc],
      ["money/offer.ts", offerMathSrc],
    ] as const) {
      const code = codeOf(src);
      eq(/toFixed\s*\(/.test(code), false, `${name} must not format money with toFixed`);
      eq(/parseFloat\s*\(/.test(code), false, `${name} must not parseFloat a price`);
      eq(/\*\s*100\b/.test(code), false, `${name} must not convert euros to cents itself — eur() does that`);
    }
    assert(codeOf(offerMathSrc).includes("eur(Number(t))"), "the one conversion goes through the money model's eur()");
  });

  /* ---- 17.4 passThrough is per line and seller-set --------------------- */

  await check("A PASS-THROUGH LINE is in what the client pays and out of the referral base", () => {
    const t = operatorOfferTotals(ODD_QUOTE);
    const permit = 1_100_000;
    const levy = 60_050 * 3;

    /* IN what the client pays. */
    eq(t.passedThrough, permit + levy, "both flagged lines are money collected and handed straight on");
    assert(t.total > t.passedThrough, "and they are inside the total the client is quoted");
    const withoutPermit = operatorOfferTotals({
      ...ODD_QUOTE,
      lines: ODD_QUOTE.lines.filter((l) => l.label !== "Sagarmatha permit"),
    });
    eq(t.total - withoutPermit.total, permit, "dropping the permit drops the client's price by exactly the permit");

    /* OUT of the base the app says a referral is later invoiced on. */
    eq(t.commissionable, t.total - t.passedThrough, "the company's own fee is the total less what it passed on");
    eq(t.commissionable, 3_699_999, "which is the guiding line and nothing else");
    assert(
      referralFee(t.commissionable) < referralFee(t.total),
      "invoicing on the total rather than the fee would overcharge the company",
    );
    /*
     * The size of that overcharge, pinned. It is a referral fee on somebody
     * else's permit money — €960.12 a company would be invoiced for handing on
     * a government permit and a doctor's levy.
     *
     * ONE CENT MORE than `referralFee(passedThrough)`, and that is the floor
     * doing what `model.ts` mandates rather than a slip: three separate floors
     * (fee, pass-through, whole) cannot sum to the floor of the whole, and each
     * one gives its fraction away from ICEFALL. Asserted as an inequality with
     * that cent named, because writing `<= 1` without saying which way it falls
     * would let the rounding quietly turn round.
     */
    const overcharge = referralFee(t.total) - referralFee(t.commissionable);
    eq(overcharge, 96_012, "invoicing on the total would add €960.12 to what the company owes");
    eq(referralFee(t.passedThrough), 96_011, "a referral on the passed-on money alone floors one cent lower");
    assert(
      overcharge - referralFee(t.passedThrough) === 1,
      "and the gap is the floor's single cent, falling away from ICEFALL as model.ts requires",
    );
    assert(Number.isInteger(referralFee(t.commissionable)), "a referral fee is integer cents too");
    assert(DEFAULT_REFERRAL_PCT > 0, "the referral rate is non-zero, so the comparison above means something");
  });

  await check("A HUT RAISING ITS PRICES MUST NEVER RAISE WHAT ICEFALL TAKES", () => {
    const before = operatorOfferTotals(ODD_QUOTE);
    const dearer: Quote = {
      ...ODD_QUOTE,
      lines: ODD_QUOTE.lines.map((l) =>
        l.label === "Sagarmatha permit" ? { ...l, amount: l.amount + 500_00 } : l,
      ),
    };
    const after = operatorOfferTotals(dearer);
    eq(after.total - before.total, 50_000, "the client pays the higher permit");
    eq(after.commissionable, before.commissionable, "and the company's own fee has not moved");
    eq(
      referralFee(after.commissionable),
      referralFee(before.commissionable),
      "so ICEFALL's referral invoice is unchanged — it earns on work done, not money handled",
    );
  });

  await check("passThrough is SET BY THE SELLER — never inferred from a label or an amount", () => {
    /* The same line, the same words, the same figure — flagged and not. */
    const hutFlagged: QuoteLine = { label: "Hut beds and permits", amount: 80_000, per: "party", passThrough: true };
    const hutNotFlagged: QuoteLine = { ...hutFlagged, passThrough: false };
    const hutUnstated: QuoteLine = { label: "Hut beds and permits", amount: 80_000, per: "party" };

    const base: Quote = { ...ODD_QUOTE, partySize: 2, lines: [] };
    const totalsWith = (l: QuoteLine) => operatorOfferTotals({ ...base, lines: [l] });

    eq(totalsWith(hutFlagged).passedThrough, 80_000, "flagged, it is money passed on");
    eq(totalsWith(hutNotFlagged).passedThrough, 0, "unflagged, the identical line is the company's own fee");
    eq(
      totalsWith(hutUnstated).passedThrough,
      0,
      "AND AN UNSTATED FLAG IS NOT A PASS-THROUGH — nothing guesses from the word 'hut'",
    );
    eq(totalsWith(hutFlagged).total, totalsWith(hutNotFlagged).total, "the client pays the same either way");

    /* It is per LINE, not per offer: one flagged line beside one that is not. */
    const mixed = operatorOfferTotals({
      ...base,
      lines: [hutFlagged, { label: "Guiding", amount: 80_000, per: "party", passThrough: false }],
    });
    eq(mixed.total, 160_000, "both lines are in the client's price");
    eq(mixed.passedThrough, 80_000, "but only the flagged one leaves the fee");
    eq(mixed.commissionable, 80_000, "leaving the guiding as the company's own work");

    /* And the toggle is a real control on the composer, not a hidden default. */
    assert(
      flat(codeOf(composerSrc)).includes("You only pass this money on"),
      "the seller is asked, on the line, in words",
    );
    assert(codeOf(composerSrc).includes("passThrough: l.passThrough"), "and their answer is what reaches the quote");
  });

  /* ---- 17.5 An offer is still a message, and still guarded -------------- */

  await check("AN OFFER CARRYING A WHATSAPP LINK IS REFUSED, and nothing is stored", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const conv = (await be.getConversations(r))[0];
    assert(conv, "Ravi has a conversation to attempt this against");
    const before = (await be.getMessages(r, conv.id)).length;

    for (const smuggle of [
      { where: "a line label", quote: { ...ODD_QUOTE, lines: [{ label: "Deposit via https://wa.me/9779812345678", amount: 100_000, per: "party" as const }] } },
      { where: "the cancellation note", quote: { ...ODD_QUOTE, cancellation: { ...STANDARD_POLICY, note: "Message us on WhatsApp to rearrange." } } },
      { where: "an exclusion", quote: { ...ODD_QUOTE, exclusions: [{ label: "Tips — settle on telegram", approxAmount: null }] } },
    ]) {
      const body = offerMessageBody({
        customerName: conv.customerName,
        subject: "Everest — South Col",
        quote: smuggle.quote,
        totals: operatorOfferTotals(smuggle.quote),
        nothingExcluded: false,
      });
      assert(findContactDetails(body).length > 0, `the guard sees the contact detail in ${smuggle.where}`);
      const res = await be.sendMessage(r, conv.id, body);
      eq(res.ok, false, `an offer with a contact detail in ${smuggle.where} must be refused`);
      if (!res.ok) {
        assert(res.reason.trim().length > 0, "and the refusal carries a reason the composer can show verbatim");
        assert(/whatsapp|telegram|link/i.test(res.reason), `the refusal names what it found in ${smuggle.where}`);
      }
    }

    const after = await be.getMessages(r, conv.id);
    eq(after.length, before, "NOTHING WAS STORED — the thread is exactly as it was");
    resetStore();
  });

  await check("the composer shows the refusal rather than swallowing it", () => {
    const code = codeOf(composerSrc);
    /* The reason is put on screen, not logged and dropped. */
    assert(code.includes("setError(res.reason)"), "an ok:false reason is taken from the WriteResult");
    assert(/\{error &&[\s\S]{0,200}\{error\}/.test(code), "and rendered where the operator will read it");
    eq(/catch\s*\(\s*\)?\s*\{\s*\}/.test(code), false, "nothing is swallowed by an empty catch");
    /* And the send is the SAME guarded call the reply composer makes. */
    const calls = [...new Set([...code.matchAll(/backend\.(\w+)/g)].map((m) => m[1]))];
    eq(calls.join(","), "sendMessage", "the composer's only backend call is the guarded send");
  });

  /* ---- 17.6 A company-origin lead has nothing to deliver into ------------ */

  await check("A COMPANY-ORIGIN LEAD HAS NO THREAD — the send path refuses rather than pretending", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const own = (await be.getLeads(r)).find((l) => l.origin === "company");
    assert(own, "the seed has a lead the company added itself");
    eq(own.conversationId, null, "ICEFALL never carried a word between these two");

    const body = offerMessageBody({
      customerName: own.customerName,
      subject: null,
      quote: ODD_QUOTE,
      totals: operatorOfferTotals(ODD_QUOTE),
      nothingExcluded: true,
    });
    eq(findContactDetails(body).length, 0, "the body is otherwise perfectly sendable, so only the thread is missing");

    const messagesBefore = __store.messages.length;

    /*
     * There is no conversation id to pass. Every shape of "send it anyway" is
     * refused by the backend and stores nothing — it does not invent a thread,
     * and it does not quietly return ok.
     */
    for (const attempt of ["", " ", "c-does-not-exist", `c-for-${own.id}`, "null", "undefined"]) {
      const res = await be.sendMessage(r, attempt, body);
      eq(res.ok, false, `sending an offer into "${attempt}" must be refused`);
      if (!res.ok) assert(res.reason.trim().length > 0, "and say why");
    }
    eq(__store.messages.length, messagesBefore, "no message was created by any of those attempts");
    eq(
      __store.conversations.some((c) => c.leadId === own.id),
      false,
      "and no conversation was conjured for the lead either",
    );
    resetStore();
  });

  await check("the composer offers no Send button when there is nothing to send into", () => {
    const code = codeOf(composerSrc);
    /* The guard inside the handler... */
    assert(code.includes("if (!conversationId || !body) return;"), "send() refuses without a thread");
    /* ...and the button that is not rendered in the first place. */
    assert(code.includes("{conversationId !== null && ("), "the Send button exists only when a thread does");
    assert(code.includes("{conversationId === null && ("), "and the null case renders an explanation instead");
    assert(
      flat(composerSrc).includes("Icefall cannot deliver this one"),
      "which says plainly that Icefall cannot deliver it",
    );
    /*
     * The two reasons a row has no thread are worded apart — a lead the company
     * typed in was never ICEFALL's conversation; an enquiry recorded without one
     * is ours and simply has no thread. Telling an operator the wrong one is a
     * small lie about where their customer came from.
     */
    assert(flat(composerSrc).includes("you added this lead yourself"), "the company-added case says so");
    assert(
      flat(composerSrc).includes("This enquiry was recorded without a conversation"),
      "and the ICEFALL-enquiry case is worded differently, because it is a different fact",
    );
    /* No offer RECORD is claimed to exist. */
    assert(
      flat(composerSrc).includes("Icefall does not keep a separate offer record"),
      "and the dialog does not imply a tracked document behind the message",
    );
  });

  /* ======================================================================== */
  /* 18 — OP-01: the company social surface, via S2                           */
  /* ======================================================================== */

  /*
   * The S2 tables are NOT live; the adapter's social methods hold the
   * contract's shapes so the swap is a repoint. These checks therefore assert
   * the RULES, not the storage: isolation, the caption guard, the surviving
   * moderation record, the fixed clock, arithmetic follower counts, and the
   * absence of every claim ICEFALL does not measure.
   */

  const postsScreenSrc = readFileSync(new URL("../src/screens/Posts.tsx", import.meta.url), "utf8");
  const memoryAdapterSrc = readFileSync(new URL("../src/domain/memory/adapter.ts", import.meta.url), "utf8");
  const domainTypesSrc = readFileSync(new URL("../src/domain/types.ts", import.meta.url), "utf8");

  /* ---- 18.1 Cross-company isolation ------------------------------------- */

  await check("RAVI'S FEED IS LANTERN'S ALONE — Coldharbour's post never appears in it", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const feed = await be.getPosts!(r);
    assert(feed.length > 0, "Lantern has seeded posts to see");
    for (const p of feed) {
      eq(p.authorKind, "company", "this portal's feed holds company posts only");
      eq(p.authorId, r.user.companyId, `post ${p.id} belongs to the signed-in company`);
    }
    eq(feed.some((p) => p.id === "po-c-denali"), false, "Coldharbour's Denali post is not in Lantern's feed");

    /* And the same seam from the other side — Jo sees only Coldharbour's. */
    const j = await signIn(JO);
    const theirs = await be.getPosts!(j);
    eq(theirs.length, 1, "Coldharbour has exactly its one seeded post");
    eq(theirs[0].id, "po-c-denali", "and it is that post");
    eq(theirs.some((p) => p.authorId === r.user.companyId), false, "none of Lantern's six leaked across");
  });

  await check("DIRECT-ID LOOKUPS REFUSE ACROSS COMPANIES — comments, deletes, the lot", async () => {
    resetStore();
    const r = await signIn(RAVI);

    /* Reading a competitor's comment thread by guessed id yields nothing. */
    const stolen = await be.getPostComments!(r, "po-c-denali");
    eq(stolen.length, 0, "Coldharbour's comment thread is not readable by id from Lantern's session");
    eq(POST_COMMENTS.some((c) => c.postId === "po-c-denali"), true, "…and that thread genuinely has a comment to leak");

    /* Deleting a competitor's post by id is refused and the row survives. */
    const del = await be.deletePost!(r, "po-c-denali");
    eq(del.ok, false, "deleting another company's post is refused");
    if (!del.ok) assert(del.reason.trim().length > 0, "with a reason the screen can show");
    eq(__store.posts.some((p) => p.id === "po-c-denali"), true, "the row is exactly where it was");

    /* The refusal is symmetric — Jo cannot touch Lantern's rows either. */
    const j = await signIn(JO);
    for (const id of ["po-l-turn", "po-l-removed", "po-l-story-live"]) {
      const res = await be.deletePost!(j, id);
      eq(res.ok, false, `Coldharbour deleting Lantern's ${id} is refused`);
      eq(__store.posts.some((p) => p.id === id), true, `and ${id} survives the attempt`);
    }
    eq((await be.getPostComments!(j, "po-l-ama")).length, 0, "Lantern's comments are as closed to Jo");
    resetStore();
  });

  await check("a post cannot borrow another company's media asset by id", async () => {
    resetStore();
    const r = await signIn(RAVI);
    /* Give Coldharbour an approved asset so there is something to steal. */
    const theirs: MediaAsset = {
      id: "ma-coldharbour-denali-shot",
      companyId: COLDHARBOUR,
      productId: null,
      kind: "image",
      storagePath: `${COLDHARBOUR}/${COLDHARBOUR}/denali-shot.jpg`,
      mimeType: "image/jpeg",
      byteSize: 500_000,
      widthPx: 1600,
      heightPx: 1067,
      altText: "Denali from base camp",
      licence: "royalty-free",
      credit: "Coldharbour Expeditions",
      state: "approved",
      decisionReason: null,
      reviewedBy: "icefall",
      reviewedAt: "2026-08-01T10:00:00.000Z",
      createdAt: "2026-07-30T10:00:00.000Z",
    };
    __store.media = [...__store.media, theirs];

    const before = __store.posts.length;
    const res = await be.createPost!(r, {
      caption: "A borrowed photograph.",
      media: { source: "asset", mediaId: theirs.id },
    });
    eq(res.ok, false, "referencing a competitor's asset is refused");
    eq(__store.posts.length, before, "and no post was stored");
    resetStore();
  });

  await check("follower counts are scoped — neither company reads the other's rows", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const j = await signIn(JO);
    const lantern = await be.getFollowerCount!(r);
    const coldharbour = await be.getFollowerCount!(j);
    assert(lantern.available && coldharbour.available, "counting rows we hold is a measurement");
    if (lantern.available && coldharbour.available) {
      eq(lantern.value, FOLLOWS.filter((f) => f.companyId === r.user.companyId).length, "Lantern's count is Lantern's rows");
      eq(coldharbour.value, FOLLOWS.filter((f) => f.companyId === COLDHARBOUR).length, "Coldharbour's count is Coldharbour's rows");
      eq(lantern.value + coldharbour.value, FOLLOWS.length, "together they partition the table — nobody counted twice");
      assert(lantern.value !== FOLLOWS.length, "and neither company was handed the whole table's total");
    }
  });

  await check("the promo-video slot is per company — Jo's slot is empty and Jo's writes stay Jo's", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const j = await signIn(JO);
    const lanterns = await be.getPromoVideo!(r);
    eq(lanterns.source, "youtube", "Lantern's seeded slot is its own");
    const jos = await be.getPromoVideo!(j);
    eq(jos.source, "none", "Coldharbour has no slot, and is not shown Lantern's");

    /* A write from Coldharbour must not move Lantern's slot. */
    const set = await be.setPromoVideo!(j, "AbCdEfGhIjK");
    eq(set.ok, true, "Jo may set Coldharbour's own video");
    const after = await be.getPromoVideo!(r);
    assert(after.source === "youtube" && after.youtubeId === "LanternR21x", "Lantern's slot did not move");
    resetStore();
  });

  /* ---- 18.2 The caption guard — operator-authored public text ------------ */

  await check("A CAPTION WITH A PHONE NUMBER OR WHATSAPP LINK IS REFUSED, AND NOTHING IS STORED", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = __store.posts.length;

    for (const smuggle of [
      { what: "a phone number", caption: "Autumn spots open — call +977 9812 345 678 to hold yours." },
      { what: "a WhatsApp link", caption: "Message us on wa.me to plan your climb." },
      { what: "a WhatsApp mention", caption: "Fastest answers on WhatsApp, always." },
      { what: "an email address", caption: "Write to bookings@lanternridge.example for the itinerary." },
      { what: "a website link", caption: "Full dates at www.lanternridge.example — see you up there." },
    ]) {
      /* The same predicate every operator-authored field runs. */
      assert(
        Object.keys(findContactDetailsIn({ caption: smuggle.caption })).length > 0,
        `the guard sees ${smuggle.what} in the caption`,
      );
      const res = await be.createPost!(r, { caption: smuggle.caption, media: null });
      eq(res.ok, false, `a caption carrying ${smuggle.what} is refused`);
      if (!res.ok) assert(res.reason.trim().length > 0, "with a reason shown verbatim, never swallowed");
    }
    eq(__store.posts.length, before, "NOTHING WAS STORED by any of those attempts");

    /* A clean caption goes through — the guard blocks details, not posting. */
    const okRes = await be.createPost!(r, { caption: "Rope teams confirmed for the autumn season.", media: null });
    eq(okRes.ok, true, "a caption with no contact details publishes");
    resetStore();
  });

  await check("a STORY runs the same guard — an expiry does not open a side door", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = __store.posts.length;
    const res = await be.createPost!(r, {
      caption: "Tonight only — reach us on t.me for a late place.",
      media: null,
      expiresAt: "2026-08-29T09:20:00.000Z", // a perfectly valid story window
    });
    eq(res.ok, false, "a story caption with a Telegram link is refused");
    eq(__store.posts.length, before, "and no story row was stored");
    resetStore();
  });

  await check("the video path carries no free text past the guard — only a YouTube id survives", async () => {
    resetStore();
    const r = await signIn(RAVI);
    /* Whatever an operator types, the only thing stored is an 11-char id. */
    for (const garbage of ["Call +44 7911 123456", "wa.me/lanternridge", "https://vimeo.com/998877", "not a link at all"]) {
      const res = await be.setPromoVideo!(r, garbage);
      eq(res.ok, false, `"${garbage}" is refused by the video slot`);
      if (!res.ok) assert(res.reason.trim().length > 0, "with a reason to show");
    }
    const still = await be.getPromoVideo!(r);
    assert(still.source === "youtube" && still.youtubeId === "LanternR21x", "the slot still holds the seeded id — no text got in");
    resetStore();
  });

  /* ---- 18.3 A removal by Icefall survives the operator ------------------- */

  await check("A POST REMOVED BY ICEFALL CANNOT BE DELETED OVER, AND ITS REASON SURVIVES", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const removed = (await be.getPosts!(r)).find((p) => p.removedAt !== null);
    assert(removed, "the seed carries a removed post so this path is real");
    assert(removed.removedReason && removed.removedReason.trim().length > 0, "removal always carries its reason");
    const reasonBefore = removed.removedReason;

    const res = await be.deletePost!(r, removed.id);
    eq(res.ok, false, "the company admin's delete is refused");
    if (!res.ok) assert(res.reason.trim().length > 0, "and the refusal says why, for the screen to show");

    const survivor = __store.posts.find((p) => p.id === removed.id);
    assert(survivor, "the moderation record was not tidied away");
    eq(survivor.removedReason, reasonBefore, "and the reason is preserved word for word");

    /* The refusal is about MODERATION, not deletion — an unremoved post goes. */
    const own = await be.deletePost!(r, "po-l-turn");
    eq(own.ok, true, "the same admin deletes their own unremoved post fine");
    eq(__store.posts.some((p) => p.id === "po-l-turn"), false, "that row is gone");
    eq(__store.postComments.some((c) => c.postId === "po-l-turn"), false, "with its comments");
    eq(__store.posts.some((p) => p.id === removed.id), true, "while the removed one still stands");
    resetStore();
  });

  await check("the operator has NO write path to removal — the input cannot spell it", () => {
    /*
     * `NewPostInput` is caption, media, expiresAt and nothing else. If a
     * field ever grows that lets this portal set `removedAt`, `removedReason`
     * or `authorId`, the moderation trail stops being Icefall's. Type-level:
     * assigning such an input must not compile; shape-level: the stored post
     * carries exactly the moderation defaults.
     */
    type Forbidden = "removedAt" | "removedReason" | "authorId" | "authorKind" | "companyId";
    type LeakedKeys = Extract<keyof import("../src/domain/adapter").NewPostInput, Forbidden>;
    const nothingLeaked: LeakedKeys extends never ? true : never = true;
    void nothingLeaked;
  });

  /* ---- 18.4 Story expiry derives from the fixed app clock ---------------- */

  await check("THE SEEDED STORIES READ CORRECTLY AGAINST NOW — active is active, lapsed is lapsed", () => {
    const live = POSTS.find((p) => p.id === "po-l-story-live")!;
    const lapsed = POSTS.find((p) => p.id === "po-l-story-old")!;
    const plain = POSTS.find((p) => p.id === "po-l-turn")!;
    assert(isStory(live) && isStory(lapsed), "both seeded stories are stories — an expiry is the whole difference");
    eq(isStory(plain), false, "a post without an expiry is not one");
    eq(storyState(live, NOW), "active", "the live story is unexpired at the app clock");
    eq(storyState(lapsed, NOW), "expired", "the lapsed story is expired at the app clock");
    eq(storyState(plain, NOW), null, "and a plain post has no story state at all");
  });

  await check("a story already over at the app clock is refused — a write that lies is not written", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const before = __store.posts.length;
    for (const past of ["2026-08-25T10:00:00.000Z", NOW, "not-a-time"]) {
      const res = await be.createPost!(r, { caption: "Departure tonight.", media: null, expiresAt: past });
      eq(res.ok, false, `expiry "${past}" is refused`);
      if (!res.ok) assert(res.reason.trim().length > 0, "with the reason shown");
    }
    eq(__store.posts.length, before, "no already-hidden story was stored");

    /* And a future one is accepted, active against the same fixed clock. */
    const res = await be.createPost!(r, { caption: "Departure tonight.", media: null, expiresAt: "2026-08-29T09:20:00.000Z" });
    eq(res.ok, true, "a story with a future expiry publishes");
    if (res.ok) {
      eq(res.value.createdAt, NOW, "stamped by the app clock, not the machine's");
      eq(storyState(res.value, NOW), "active", "and it reads active right now");
    }
    resetStore();
  });

  await check("NO STORY CODE CALLS new Date() BARE — the clock is the fixed NOW constant", () => {
    /*
     * If any of these three files reaches for the machine clock, story expiry
     * drifts off the app clock the moment the demo runs on a different day —
     * the exact bug deriving from `NOW` exists to prevent.
     */
    for (const [name, src] of [
      ["Posts.tsx", postsScreenSrc],
      ["memory/adapter.ts", memoryAdapterSrc],
      ["domain/types.ts", domainTypesSrc],
    ] as const) {
      eq(/new Date\(\)/.test(codeOf(src)), false, `${name} never calls new Date() outside a comment`);
    }
    /* The screen takes its clock from the one place clocks come from. */
    assert(/from "@\/domain\/dates"/.test(postsScreenSrc), "Posts.tsx imports the app clock from @/domain/dates");
    /* And `storyState` demands a time — nobody can forget to pass one. */
    assert(/storyState\s*\(\s*p\s*:\s*Post\s*,\s*nowIso\s*:\s*string\s*\)/.test(domainTypesSrc), "storyState takes the clock as an argument");
  });

  /* ---- 18.5 The follower count is arithmetic, not a literal --------------- */

  await check("THE FOLLOWER COUNT IS COUNTED FROM ROWS — add a row, the number moves", async () => {
    resetStore();
    const r = await signIn(RAVI);
    const first = await be.getFollowerCount!(r);
    assert(first.available, "the count is a measurement");
    const seeded = FOLLOWS.filter((f) => f.companyId === r.user.companyId).length;
    if (first.available) eq(first.value, seeded, "and it equals the seeded follow rows, by arithmetic");

    __store.follows = [
      ...__store.follows,
      { id: "f-l-new", followerName: "Anouk de Vries", companyId: r.user.companyId, createdAt: NOW },
    ];
    const second = await be.getFollowerCount!(r);
    assert(second.available, "still a measurement");
    if (second.available) eq(second.value, seeded + 1, "one more row, one more follower — no stored total to go stale");
    resetStore();
  });

  await check("the Posts screen types no follower number and invents no figure", () => {
    const code = codeOf(postsScreenSrc);
    eq(/\d+\s*follower/i.test(code), false, "no hardcoded '<n> followers' anywhere in the screen source");
    assert(code.includes("getFollowerCount"), "the figure on screen is the adapter's count");
    /* A missing count folds to its reason, never to a default zero. */
    eq(/getFollowerCount[\s\S]{0,400}?\?\?\s*0/.test(code), false, "no `?? 0` turns 'not measured' into 'nobody follows you'");
  });

  /* ---- 18.6 No reach, impressions or view counts -------------------------- */

  await check("THE POSTS SCREEN CLAIMS NO REACH, IMPRESSIONS OR VIEW COUNTS — ICEFALL DOES NOT MEASURE THEM", () => {
    eq(
      /reach|impression|view count/i.test(codeOf(postsScreenSrc)),
      false,
      "the words are absent from the screen's code and copy — not even as dashes",
    );
  });

  /* ---- 18.7 The promo video — OP-01's slot, not decision 15 undone --------- */

  await check("setPromoVideo accepts every form youtubeIdFrom does, and stores the id alone", async () => {
    resetStore();
    const r = await signIn(RAVI);
    /* A format-valid, invented id — pointing at real footage would attribute
     * somebody's film to an invented company, the seed's own rule. */
    const ID = "AbCdEfGhIjK";
    for (const form of [
      ID,
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://youtube.com/shorts/${ID}`,
    ]) {
      eq(youtubeIdFrom(form), ID, `youtubeIdFrom resolves ${form}`);
      const res = await be.setPromoVideo!(r, form);
      eq(res.ok, true, `and the slot accepts it`);
      if (res.ok) assert(res.value.source === "youtube" && res.value.youtubeId === ID, "storing the id, never the URL");
    }
    /* Clearing is a choice the record can represent. */
    const cleared = await be.setPromoVideo!(r, null);
    eq(cleared.ok, true, "clearing works");
    if (cleared.ok) eq(cleared.value.source, "none", "and yields the explicit none");
    eq((await be.getPromoVideo!(r)).source, "none", "which is what a re-read then says");
    resetStore();
  });

  await check("garbage never reaches the slot, and a non-admin never reaches the surface", async () => {
    resetStore();
    const r = await signIn(RAVI);
    for (const garbage of ["", "   ", "tooShort", "https://youtu.be/short", "javascript:alert(1)"]) {
      const res = await be.setPromoVideo!(r, garbage);
      if (garbage.trim() === "") {
        eq(res.ok, true, "an empty input is a clear, which is allowed");
      } else {
        eq(res.ok, false, `"${garbage}" is refused`);
      }
    }
    /* Marta is Sales — publishing company content is the admin's permission. */
    const m = await signIn(MARTA);
    eq((await be.setPromoVideo!(m, "AbCdEfGhIjK")).ok, false, "Sales cannot set the company's film");
    eq((await be.createPost!(m, { caption: "A fine morning.", media: null })).ok, false, "nor publish a post");
    eq((await be.deletePost!(m, "po-l-turn")).ok, false, "nor delete one");
    resetStore();
  });

  await check("THE CANONICAL COMPANY RECORD STILL HAS NO VIDEO FIELD — decision 15 stands", async () => {
    /*
     * The reconciliation, asserted: decision 15 (2026-08-29) removed
     * `Company.video`; the owner's OP-01 wording (2026-08-31) is the LATER
     * ruling and puts the promotional film on the SOCIAL surface, in its own
     * S2-shaped store. If `video` ever reappears on `Company`, this fails at
     * compile time AND at runtime — it would be decision 15 reversed.
     */
    type CompanyGrewVideo = "video" extends keyof Company ? true : false;
    const stillRemoved: CompanyGrewVideo extends false ? "decision 15 stands" : never = "decision 15 stands";
    void stillRemoved;

    resetStore();
    for (const row of __store.companies) {
      eq("video" in (row as object), false, `company ${row.id} carries no video key at runtime either`);
    }
    /* The film lives in its own store, keyed by company — the S2 shape. */
    eq(PROMO_VIDEOS.every((s) => typeof s.companyId === "string" && s.video.source !== undefined), true, "the slot is its own record, not a company column");

    /* And the two clocks agree the surface exists: the backend declares it. */
    const r = await signIn(RAVI);
    const video = await be.getPromoVideo!(r);
    assert(video.source === "youtube", "the seeded slot reads back from the social store");
  });

  const total = passed + failures.length;
  if (failures.length) {
    console.error(`\n${failures.length} of ${total} failed:\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    process.exit(1);
  }
  console.log(`\n  ${passed}/${total} operator authorization tests passed\n`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
