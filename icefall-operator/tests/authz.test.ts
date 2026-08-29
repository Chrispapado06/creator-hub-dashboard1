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

  /* ---------------------------------------------------------------------- */

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
