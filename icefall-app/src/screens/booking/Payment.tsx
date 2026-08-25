import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, CreditCard, Lock } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { BookingSummary, PriceLines, StepHeader } from "@/components/booking/parts";
import {
  AmexMark,
  AppleMark,
  GoogleMark,
  MastercardMark,
  VisaMark,
} from "@/components/booking/PayMarks";
import { BOOKING, GUIDE, SERVICE_FEE_EXPLAINER } from "./data";
import { PAYMENTS_NOT_CONNECTED, formatEur } from "@/money/model";
import { cn } from "@/lib/utils";

type Method = "card" | "apple" | "google" | "bank";

/** Step 2 of 3 — how you pay. */
export default function Payment() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("card");
  const [saveCard, setSaveCard] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  return (
    <Screen>
      <Stagger>
        <StepHeader title="Payment" onBack={() => navigate(-1)} />

        <Rise>
          <BookingSummary onVerified={() => setNote(GUIDE.verificationSentence)} />
        </Rise>

        {note && (
          <Rise className="pt-3">
            <Disclaimer>{note}</Disclaimer>
          </Rise>
        )}

        <Rise className="pt-4">
          <PriceLines onFeeInfo={() => setNote(SERVICE_FEE_EXPLAINER)} />
        </Rise>

        {/* ---- Method -------------------------------------------------------- */}
        <Rise className="pt-7">
          <SectionLabel>Payment method</SectionLabel>
          <div className="mt-3 space-y-2.5">
            <MethodRow
              active={method === "card"}
              onClick={() => setMethod("card")}
              icon={<CreditCard size={17} strokeWidth={1.6} />}
              label="Credit or debit card"
              trailing={
                <span className="flex items-center gap-1">
                  <VisaMark className="h-5 w-auto" />
                  <MastercardMark className="h-5 w-auto" />
                  <AmexMark className="h-5 w-auto" />
                </span>
              }
            />
            <MethodRow
              active={method === "apple"}
              onClick={() => setMethod("apple")}
              icon={<AppleMark className="h-[17px] w-auto" />}
              label="Apple Pay"
              sub="One tap — nothing to type"
            />
            <MethodRow
              active={method === "google"}
              onClick={() => setMethod("google")}
              icon={<GoogleMark className="h-[17px] w-auto" />}
              label="Google Pay"
              sub="One tap — nothing to type"
            />
            <MethodRow
              active={method === "bank"}
              onClick={() => setMethod("bank")}
              icon={<Building2 size={17} strokeWidth={1.6} />}
              label="Bank transfer"
              sub="Slower to clear — your dates are held for 3 days"
            />
          </div>
        </Rise>

        {/* ---- Card fields ---------------------------------------------------- */}
        {method === "card" && (
          <Rise className="pt-6">
            <SectionLabel>Card details</SectionLabel>
            <Card className="mt-3 space-y-3" inset={false}>
              <div className="p-4 pb-0">
                <Field label="Card number" placeholder="1234 1234 1234 1234" />
              </div>
              <div className="px-4">
                <Field label="Name on card" placeholder="Name as printed" />
              </div>
              <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                <Field label="Expiry" placeholder="MM / YY" />
                <Field label="CVC" placeholder="123" />
              </div>
            </Card>

            {/* These inputs are DISABLED and take nothing. When payments are
                wired, they are replaced by the provider's hosted fields — a card
                number must never touch ICEFALL's own DOM, or the whole app falls
                inside PCI scope. Building real-looking inputs now and swapping
                them later is how that mistake gets shipped. */}
            <Disclaimer className="mt-3">
              These fields are inert. Real card entry runs inside our payment provider's own hosted
              fields, so the number never reaches ICEFALL.
            </Disclaimer>

            <button
              type="button"
              onClick={() => setSaveCard((s) => !s)}
              className="mt-4 flex w-full items-center justify-between gap-3 rounded-tile border border-hairline bg-graphite px-4 py-3.5"
            >
              <span className="text-[13px] text-snow">Save card for future bookings</span>
              <span
                className={cn(
                  "relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors",
                  saveCard ? "bg-azure" : "bg-elevated",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] h-5 w-5 rounded-full bg-obsidian transition-all",
                    saveCard ? "left-[23px]" : "left-[3px]",
                  )}
                />
              </span>
            </button>
          </Rise>
        )}

        {method !== "card" && (
          <Rise className="pt-6">
            <Card>
              <p className="text-[12.5px] leading-relaxed text-mist">
                {method === "bank"
                  ? "You will be shown transfer details on the next step. Your dates are held for three days while the transfer clears."
                  : "You will confirm the payment in your wallet on the next step. Nothing is charged until you do."}
              </p>
            </Card>
          </Rise>
        )}

        {/* ---- Pay ------------------------------------------------------------ */}
        <Rise className="pt-7">
          <Button size="lg" className="w-full" onClick={() => navigate("/book/review")}>
            <Lock size={15} strokeWidth={1.8} />
            Review — {formatEur(BOOKING.pricing.total)}
          </Button>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-mist-dim">
            You will see the full amount and confirm on the next screen. Nothing is charged here.
          </p>

          <Disclaimer className="mt-4">{PAYMENTS_NOT_CONNECTED}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="section-label">{label}</span>
      <input
        disabled
        placeholder={placeholder}
        className="mt-2 w-full rounded-tile border border-hairline bg-elevated/50 px-3 py-2.5 text-[14px] text-snow outline-none placeholder:text-mist-dim disabled:cursor-not-allowed disabled:opacity-70"
      />
    </label>
  );
}

function MethodRow({
  active,
  onClick,
  icon,
  label,
  sub,
  trailing,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="block w-full text-left">
      <Card
        className={cn(
          "flex items-center gap-3 transition-colors",
          active ? "border-azure/55" : "hover:border-hairline-strong",
        )}
      >
        <span className={cn("shrink-0", active ? "text-azure" : "text-mist")}>{icon}</span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-snow">{label}</span>
          {sub && <span className="mt-0.5 block truncate text-[11px] text-mist-dim">{sub}</span>}
          {trailing && <span className="mt-1.5 block">{trailing}</span>}
        </span>

        <span
          className={cn(
            "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border",
            active ? "border-azure" : "border-hairline-strong",
          )}
        >
          {active && <span className="h-2 w-2 rounded-full bg-azure" />}
        </span>
      </Card>
    </button>
  );
}
