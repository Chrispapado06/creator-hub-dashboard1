import { SlotCalculator } from "./_components/slot-calculator";

/**
 * The page header lives in the client component: the "Reset calculator" action
 * sits on the same row as the title and needs the calculator's own state.
 */
export default function Page() {
  return <SlotCalculator />;
}
