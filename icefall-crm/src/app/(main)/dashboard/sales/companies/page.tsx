import { CompaniesRoster } from "./_components/companies-roster";
import { companies, revenueRecords } from "./_components/data";
import { ok } from "./_components/states";

/**
 * The expedition company roster.
 *
 * "Documents checked" is the only claim this screen makes about trust, and it
 * means exactly one thing: a member of ICEFALL staff read the papers on a named
 * date. It never means an insurer, a registrar or an awarding association
 * confirmed anything — none of them were contacted — and no wording here may be
 * allowed to imply otherwise.
 *
 * ROWS ARE PLACEHOLDERS until the data layer is wired. They are handed over
 * inside the same `Result` the query layer will return, so the screen's
 * loading / unavailable / error / forbidden / empty branches are the ones that
 * ship rather than ones written later.
 */
export default function Page() {
  return <CompaniesRoster result={ok(companies)} ledger={ok(revenueRecords)} />;
}
