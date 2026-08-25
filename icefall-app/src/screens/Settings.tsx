import { RotateCcw } from "lucide-react";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";

/**
 * Settings.
 *
 * Deliberately short. Body mass is here because the calorie estimate was
 * previously computed from a hardcoded 72 kg — wrong for everyone who isn't,
 * with no way to correct it.
 */
export default function Settings() {
  const { bodyMassKg, setBodyMassKg, autoPause, setAutoPause, resetAll } = useApp();

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="Settings" back="/profile" />
      </div>

      <Stagger className="px-5">
        <Rise>
          <SectionLabel>Athlete</SectionLabel>
          <Card className="mt-3">
            <div className="flex items-baseline justify-between">
              <div className="min-w-0">
                <p className="text-[14px] text-snow">Body mass</p>
                <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">
                  Used only for the energy estimate, which is always marked “est”.
                </p>
              </div>
              <div className="flex shrink-0 items-baseline gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min={30}
                  max={200}
                  value={bodyMassKg}
                  onChange={(e) => setBodyMassKg(Number(e.target.value))}
                  aria-label="Body mass in kilograms"
                  className="tnum h-10 w-[74px] rounded-tile border border-hairline bg-elevated/40 px-3 text-right text-[15px] text-snow outline-none focus:border-azure/50"
                />
                <span className="text-[12px] text-mist">kg</span>
              </div>
            </div>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Recording</SectionLabel>
          <Card className="mt-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[14px] text-snow">Auto-pause</p>
                <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">
                  Stops the clock when you stop moving, so a break at the col doesn't count as
                  moving time.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoPause}
                aria-label="Auto-pause"
                onClick={() => setAutoPause(!autoPause)}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                  autoPause ? "bg-azure" : "bg-white/12",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] h-[18px] w-[18px] rounded-full bg-obsidian transition-transform",
                    autoPause ? "translate-x-[26px]" : "translate-x-[3px]",
                  )}
                />
              </button>
            </div>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Data</SectionLabel>
          <Card className="mt-3">
            <p className="text-[12px] leading-relaxed text-mist">
              Everything ICEFALL records stays on this device. Nothing is uploaded, and nothing is
              shared until you choose to share it.
            </p>
            <Button
              variant="danger"
              className="mt-4 w-full"
              onClick={() => {
                resetAll();
                window.location.href = "/";
              }}
            >
              <RotateCcw size={14} strokeWidth={1.7} />
              Erase all data and replay onboarding
            </Button>
          </Card>
          <Disclaimer className="mt-4">
            This removes your activities, points and achievements permanently. There is no backup
            yet — an account and sync are not built.
          </Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}
