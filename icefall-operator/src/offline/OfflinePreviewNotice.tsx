/**
 * What the two embedded previews show when the app is running offline.
 *
 * Both preview panes are iframes into `icefall-web`, and both are honest about
 * failure already — but their honest failure states are about a server that is
 * down, and they take six seconds of spinner to reach. Offline the answer is
 * known before anything is attempted, so it is said immediately, calmly, and
 * without firing a request that cannot succeed.
 *
 * A blank grey rectangle would be the wrong answer here, and so would a drawn
 * imitation of the page: the pane's entire value is being trustworthy about
 * what a climber will actually see, and a picture invented offline could not be.
 * So it says what it is, points at the pane that DOES work offline, and stops.
 */

export function OfflinePreviewNotice({ what }: { what: "company page" | "trip page" }) {
  return (
    <div className="grid h-full w-full place-items-center bg-canvas px-8 text-center">
      <div className="flex max-w-[400px] flex-col items-center gap-3">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M2 19 L8.5 7.5 L12.2 14 L14.8 10 L22 19 Z"
            className="text-line"
            fill="currentColor"
          />
          <circle cx="17.5" cy="6" r="2.4" className="text-line-soft" fill="currentColor" />
        </svg>
        <span className="text-[13px] text-ink">This preview needs a connection.</span>
        <span className="text-[12px] leading-relaxed text-muted">
          Your live {what} is rendered by the Icefall website, which cannot be reached while this
          demo is running offline. Nothing you type is affected — switch the preview to{" "}
          <span className="text-ink">App</span> to see your content laid out, drawn here.
        </span>
      </div>
    </div>
  );
}
