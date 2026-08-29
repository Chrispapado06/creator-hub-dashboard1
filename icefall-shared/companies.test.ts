/**
 * The canonical company record's own suite.
 *
 * `companies.ts` is copied verbatim into six apps, so a fault here is a fault in
 * six places at once — the same reason `money.ts` carries 63 assertions.
 */
import { COMPANIES, companyBySlug, companyById, listedCompanies, DOCUMENTS_CHECKED_NOTICE } from "./companies";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(" PASS", n, d)) : (fail++, console.log(" FAIL", n, d)); };

ok("the fixture loads (the coherence guard runs at import)", COMPANIES.length === 8, `${COMPANIES.length} companies`);

// The table's CHECK: slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
ok("every slug satisfies the database's slug CHECK",
   COMPANIES.every(c => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug)));

// The table's CHECK: length(trim(name)) between 1 and 120
ok("every name satisfies the database's length CHECK",
   COMPANIES.every(c => c.name.trim().length >= 1 && c.name.trim().length <= 120));

// companies_verification_coherent, both directions
ok("a 'verified' company always carries BOTH a date and a reviewer",
   COMPANIES.filter(c => c.verificationStatus === "verified")
            .every(c => !!c.documentsCheckedAt && !!c.documentsCheckedBy));
ok("a company that is NOT 'verified' carries NEITHER",
   COMPANIES.filter(c => c.verificationStatus !== "verified")
            .every(c => c.documentsCheckedAt === null && c.documentsCheckedBy === null));

// Owner decision 2 — no real, identifiable business may reappear here.
ok("no company is flagged as a real business", COMPANIES.every(c => c.realBusiness === false));
const REAL = ["seven summit", "adventure consultants", "elite exped", "14 peaks", "alpine ascents"];
ok("no removed real company name has crept back",
   !COMPANIES.some(c => REAL.some(r => c.name.toLowerCase().includes(r))));

ok("slugs are unique", new Set(COMPANIES.map(c => c.slug)).size === COMPANIES.length);
ok("ids are unique", new Set(COMPANIES.map(c => c.id)).size === COMPANIES.length);

// The whole point: one identity across the family.
ok("every app's former company is present in the one list",
   ["solukhumbu-expeditions", "lantern-ridge-expeditions", "northwind-ascents", "falkenrath-expeditions"]
     .every(s => !!companyBySlug(s)));
ok("lookup by id and by slug agree",
   COMPANIES.every(c => companyById(c.id)?.slug === c.slug));

ok("listedCompanies hides prospects, suspended and churned",
   !listedCompanies().some(c => ["prospect", "suspended", "churned"].includes(c.status)),
   `${listedCompanies().length} of ${COMPANIES.length}`);
ok("a suspended company is genuinely excluded", !listedCompanies().some(c => c.slug === "cold-harbour-guides"));

ok("the verification notice refuses the 'association confirmed it' reading",
   DOCUMENTS_CHECKED_NOTICE.includes("not contacted the issuing association"));

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
