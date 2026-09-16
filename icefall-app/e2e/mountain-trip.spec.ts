/**
 * THE TRIP TAB WITH NO SIGNAL (brief M5; plan §3.5, §8.2).
 *
 * Journal, documents, gear, contacts and the phrasebook are the screens that
 * are supposed to be identical in aeroplane mode — everything they show is
 * already on the phone. So each case here cuts the network first and then does
 * the real thing: writes a note with a photo, saves a document, ticks a piece
 * of kit and reloads, edits a contact, opens the phrasebook.
 *
 * Run with its own config so it does not fight the main suite for a port:
 *   ICEFALL_E2E_PROD_DIST=<built dist> npx playwright test -c e2e/playwright.trip.config.ts
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { installApp, phoneReportsNoNetwork, seedTripRunningToday, sosLink, watchExternalRequests } from "./helpers";

/** A real 1×1 PNG, so the photo path runs through createImageBitmap for real. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const DRAFT_LABEL = "Draft — needs native-speaker review";

/** Install the saved copy with a signal, seed the trip, then cut the network. */
async function openOffline(page: Page, context: BrowserContext, path: string) {
  await seedTripRunningToday(context);
  await installApp(page);
  await phoneReportsNoNetwork(context);
  await page.goto(path);
  await expect(sosLink(page)).toBeVisible();
}

test.describe("with no signal", () => {
  test("a journal note with a photo is saved, stamped and shown as kept on this phone", async ({ page, context }) => {
    await openOffline(page, context, "/mountain/trip/journal");
    const external = watchExternalRequests(page);

    await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();
    await expect(page.getByText("Nothing written yet.")).toBeVisible();

    await page.getByRole("button", { name: "Write a note" }).click();
    await page.getByLabel("Your note").fill("Wind picked up above the hut.");
    await page.getByLabel("Choose a photo for this note").setInputFiles({
      name: "hut.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByText("Photo 1", { exact: false })).toBeVisible();
    await expect(page.getByText(/^Stamped /)).toBeVisible();

    await page.getByRole("button", { name: "Save on this phone" }).click();

    const entry = page.getByRole("listitem").filter({ hasText: "Wind picked up above the hut." });
    await expect(entry).toHaveCount(1);
    await expect(entry.getByText("1 photo", { exact: false })).toBeVisible();
    // The queue calls the journal a kept-on-phone kind, so this is the truth,
    // not a placeholder: there is no server table to sync it to.
    await expect(entry.getByText("Kept on this phone")).toBeVisible();

    // The photo really is in storage, not just in the form's memory.
    await entry.getByRole("button", { name: "Open" }).click();
    await expect(entry.locator("img")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Wind picked up above the hut.")).toBeVisible();
    expect(external()).toEqual([]);
  });

  test("a document is saved on the phone and listed with its size", async ({ page, context }) => {
    await openOffline(page, context, "/mountain/trip/documents");
    const external = watchExternalRequests(page);

    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await page.getByLabel("Choose a file to save on this phone").setInputFiles({
      name: "goûter-booking.png",
      mimeType: "image/png",
      buffer: PNG,
    });

    await expect(page.getByRole("heading", { name: "New document" })).toBeVisible();
    await page.getByLabel("Name").fill("Goûter hut booking");
    await page.getByRole("button", { name: "Hut booking" }).click();
    await page.getByLabel("Note (optional)").fill("Ref 4417");
    await page.getByRole("button", { name: "Save on this phone" }).click();

    const doc = page.getByRole("listitem").filter({ hasText: "Goûter hut booking" });
    await expect(doc).toHaveCount(1);
    await expect(doc.getByText(/^Hut booking · .* · added /)).toBeVisible();
    await expect(doc.getByText("Ref 4417")).toBeVisible();
    await expect(page.getByText(/^1 file · .* used on this phone\.$/)).toBeVisible();

    await page.reload();
    await expect(page.getByText("Goûter hut booking")).toBeVisible();
    expect(external()).toEqual([]);
  });

  test("a ticked gear item is still ticked after a reload", async ({ page, context }) => {
    await openOffline(page, context, "/mountain/trip/gear");
    const external = watchExternalRequests(page);

    await expect(page.getByRole("heading", { name: "Gear" })).toBeVisible();
    await expect(page.getByText(/^\d+ of \d+ packed$/)).toBeVisible();

    const first = page.getByRole("checkbox").first();
    const label = ((await first.textContent()) ?? "").replace("✓", "").trim();
    expect(label.length).toBeGreaterThan(0);
    await expect(first).toHaveAttribute("aria-checked", "false");
    await first.click();
    await expect(first).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/^1 of \d+ packed$/)).toBeVisible();

    // The tick renders optimistically the instant it is tapped, but the write to
    // IndexedDB that makes it durable is fire-and-forget (GearScreen's `toggle`).
    // Reloading right after the render, with no wait at all, can race ahead of
    // that write landing — not a UI bug, just this test moving faster than a
    // real tap-then-close ever would. Poll the store itself so the reload only
    // happens once the tick is actually durable.
    await page.waitForFunction(
      () =>
        new Promise<boolean>((resolve) => {
          const req = indexedDB.open("icefall-device", 1);
          req.onsuccess = () => {
            try {
              const tx = req.result.transaction("gearTicks", "readonly");
              const count = tx.objectStore("gearTicks").count();
              count.onsuccess = () => resolve(count.result > 0);
              count.onerror = () => resolve(false);
            } catch {
              resolve(false);
            }
          };
          req.onerror = () => resolve(false);
        }),
    );

    await page.reload();
    const again = page.getByRole("checkbox").filter({ hasText: label }).first();
    await expect(again).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/^1 of \d+ packed$/)).toBeVisible();
    expect(external()).toEqual([]);
  });

  test("a contact can be added and then edited, and the new number is what it dials", async ({ page, context }) => {
    await openOffline(page, context, "/mountain/trip/contacts");
    const external = watchExternalRequests(page);

    await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
    await page.getByRole("button", { name: "Add a contact" }).click();
    // By role, not by label: the SOS link's own label contains the word "number".
    await page.getByRole("textbox", { name: "Name" }).fill("Luc, guide");
    await page.getByRole("textbox", { name: "Number" }).fill("+33 6 12 34 56 78");
    await page.getByRole("button", { name: "Save on this phone" }).click();

    await expect(page.getByText("Luc, guide")).toBeVisible();
    await expect(page.locator('a[href="tel:+33612345678"]')).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByRole("textbox", { name: "Number" }).fill("+33 6 99 88 77 66");
    await page.getByRole("textbox", { name: "Note" }).fill("Sat phone after 18:00");
    await page.getByRole("button", { name: "Save on this phone" }).click();

    await expect(page.locator('a[href="tel:+33699887766"]')).toBeVisible();
    await expect(page.locator('a[href="tel:+33612345678"]')).toHaveCount(0);
    await expect(page.getByText("Sat phone after 18:00")).toBeVisible();

    await page.reload();
    await expect(page.locator('a[href="tel:+33699887766"]')).toBeVisible();
    expect(external()).toEqual([]);
  });

  test("the phrasebook says every phrase is an unreviewed draft, on the list and on the phrase", async ({ page, context }) => {
    await openOffline(page, context, "/mountain/trip/phrasebook");
    const external = watchExternalRequests(page);

    await expect(page.getByRole("heading", { name: "Phrasebook" })).toBeVisible();
    await expect(
      page.getByText(
        "No native speaker has checked these. Point at the words and show the screen; do not rely on them alone.",
      ),
    ).toBeVisible();

    // Mont Blanc is France and Italy, so both are offered before the rest.
    const french = page.getByRole("button").filter({ hasText: "Français" }).first();
    await expect(french).toContainText(DRAFT_LABEL);
    await french.click();

    await expect(page.getByRole("heading", { name: /French/ })).toBeVisible();
    await expect(page.getByText(DRAFT_LABEL).first()).toBeVisible();

    // The label follows the phrase onto the screen you hold out to a stranger.
    await page.getByRole("button").filter({ hasText: "J'ai besoin d'aide." }).first().click();
    const shown = page.getByRole("dialog");
    await expect(shown).toBeVisible();
    await expect(shown.getByText(DRAFT_LABEL)).toBeVisible();
    expect(external()).toEqual([]);
  });
});
