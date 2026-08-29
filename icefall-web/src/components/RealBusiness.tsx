import { DEMO_NOTICE } from "@/data/demo";
import type { Company } from "@/data/companies";

/**
 * The real-business disclosure, in ONE place.
 *
 * ── THE BUG THIS EXISTS TO END ──────────────────────────────────────────────
 * `realBusiness` was honoured on the company page and nowhere else. Elite Exped
 * is a real UK operator; its company page carried the banner and said "No
 * ratings published", and its own trip pages — one click away, on a €62,000
 * listing with a Request-to-book button — carried neither. Worse, they printed
 * the blanket demo notice, whose first clause is "These guides and companies do
 * not exist". That is not a missing label. It is a false published statement
 * about an identifiable business, sitting under fabricated departure dates.
 *
 * The guard was in one component and the claim was rendered by three, so the
 * two drifted the moment a page was added. Keying both the banner and the
 * notice off the company record means a page cannot render a real operator
 * without the disclosure travelling with it.
 */

export function RealBusinessBanner({ company }: { company: Company | undefined }) {
  if (!company?.realBusiness) return null;
  return (
    <p className="rounded-tile border border-alert/35 bg-alert/[0.07] px-4 py-2.5 text-[11.5px] leading-relaxed text-alert">
      {company.name} is a real company. ICEFALL has no partnership with it, and the figures,
      departures and prices on this page are ICEFALL&rsquo;s placeholders — not theirs. Contact the
      operator directly.
    </p>
  );
}

/**
 * The demo notice, correct for whose page it is on.
 *
 * The blanket wording asserts the companies do not exist. On a page whose
 * operator DOES exist that sentence is simply false, so the clause is replaced
 * rather than appended to.
 */
export function demoNoticeFor(company: Company | undefined): string {
  if (!company?.realBusiness) return DEMO_NOTICE;
  return (
    `Demonstration listing. ${company.name} is a real company, but this listing is not theirs: ` +
    "the departures, prices and figures were invented by ICEFALL to show how the marketplace " +
    "works, and no booking made here reaches them. A production build lists only real, verified " +
    "partners."
  );
}
