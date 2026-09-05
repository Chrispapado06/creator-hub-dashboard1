import { toast } from "sonner";

/**
 * What a confirm does while there is no data layer.
 *
 * Every write in this area is built in full — the validation, the guards, the
 * busy state — and stops at the wire. The notice says the change was NOT saved
 * and names why, because a success message for a record that did not change is
 * the one thing this product may never print.
 */
export function notSaved(detail: string) {
  toast("Nothing was saved", {
    description: `${detail} The data layer is not connected yet, so no record was changed.`,
  });
}
