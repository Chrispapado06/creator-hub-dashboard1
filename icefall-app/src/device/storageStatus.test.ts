/**
 * `npm run test:storage-status` - esbuild to node. Covers the formatting and
 * the honesty rules: a refusal is reported as a refusal, and missing figures
 * stay missing rather than becoming zero.
 */
import {
  availableSentence,
  formatBytes,
  isStandalone,
  persistSentence,
  readStorageStatus,
  requestPersistentStorage,
  shouldShowHomeScreenPrompt,
  storageCheck,
  usedSentence,
  PERSIST_REFUSED_SENTENCE,
  IOS_CLEARING_SENTENCE,
  type StorageNavigator,
} from "@/device/storageStatus";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;
function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}
function eq<T>(a: T, b: T, label: string) {
  ok(a === b, `${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}

const MB = 1024 * 1024;
const GB = 1024 * MB;
const noMedia = { matchMedia: () => ({ matches: false }) };

async function main() {
  // formatBytes
  eq(formatBytes(null), null, "null bytes");
  eq(formatBytes(undefined), null, "undefined bytes");
  eq(formatBytes(NaN), null, "NaN bytes");
  eq(formatBytes(-5), null, "negative bytes");
  eq(formatBytes(0), "0 KB", "zero");
  eq(formatBytes(1), "1 KB", "one byte rounds up");
  eq(formatBytes(2048), "2 KB", "2 KB");
  eq(formatBytes(41 * MB), "41 MB", "41 MB");
  eq(formatBytes(1.24 * GB), "1.2 GB", "1.2 GB");
  eq(formatBytes(10 * GB), "10 GB", "10 GB");
  eq(formatBytes(1023 * 1024), "1023 KB", "just under a MB");
  eq(formatBytes(5000 * GB * 1024), "5000 TB", "caps at TB");

  // sentences
  eq(usedSentence({ used: 41 * MB }), "About 41 MB saved.", "used sentence");
  eq(usedSentence({ used: null }), null, "no used figure means no sentence");
  ok(availableSentence({ available: 10 * GB })!.includes("roughly 10 GB free"), "available sentence");
  ok(availableSentence({ available: 10 * GB })!.includes("estimate"), "available says estimate");
  eq(availableSentence({ available: null }), null, "no available figure");
  eq(persistSentence("refused"), PERSIST_REFUSED_SENTENCE, "refused copy");

  // isStandalone
  eq(isStandalone({ ...noMedia, navigator: {} }), false, "browser tab");
  eq(isStandalone({ matchMedia: (q) => ({ matches: q.includes("standalone") }) }), true, "media query");
  eq(isStandalone({ ...noMedia, navigator: { standalone: true } }), true, "iOS flag");
  eq(
    isStandalone({ matchMedia: () => { throw new Error("x"); }, navigator: {} }),
    false,
    "throwing matchMedia",
  );
  eq(shouldShowHomeScreenPrompt({ standalone: false }), true, "prompt in tab");
  eq(shouldShowHomeScreenPrompt({ standalone: true }), false, "no prompt when installed");

  // readStorageStatus
  const full: StorageNavigator = {
    storage: {
      estimate: async () => ({ usage: 41 * MB, quota: 10 * GB }),
      persisted: async () => false,
      persist: async () => true,
    },
  };
  const s = await readStorageStatus(full, noMedia, 1000);
  eq(s.supported, true, "supported");
  eq(s.used, 41 * MB, "used");
  eq(s.available, 10 * GB - 41 * MB, "available");
  eq(s.persisted, "refused", "persisted false reads as refused");
  eq(s.checkedAt, 1000, "checkedAt");

  const none = await readStorageStatus({}, noMedia);
  eq(none.supported, false, "no storage API");
  eq(none.used, null, "no used");
  eq(none.persisted, "unsupported", "no persisted API");

  const over = await readStorageStatus(
    { storage: { estimate: async () => ({ usage: 20, quota: 10 }) } },
    noMedia,
  );
  eq(over.available, 0, "available clamps at zero");

  const partial = await readStorageStatus({ storage: { estimate: async () => ({ usage: 5 }) } }, noMedia);
  eq(partial.available, null, "no quota means no available figure");

  const broken = await readStorageStatus(
    {
      storage: {
        estimate: async () => { throw new Error("x"); },
        persisted: async () => { throw new Error("y"); },
      },
    },
    noMedia,
  );
  eq(broken.used, null, "estimate throwing gives null");
  eq(broken.persisted, "unknown", "persisted throwing gives unknown");

  // requestPersistentStorage
  eq(await requestPersistentStorage(full), "granted", "persist granted");
  eq(
    await requestPersistentStorage({ storage: { persisted: async () => false, persist: async () => false } }),
    "refused",
    "persist refused",
  );
  let asked = false;
  eq(
    await requestPersistentStorage({
      storage: { persisted: async () => true, persist: async () => ((asked = true), true) },
    }),
    "granted",
    "already persisted",
  );
  eq(asked, false, "does not re-ask when already granted");
  eq(await requestPersistentStorage({}), "unsupported", "no persist API");
  eq(await requestPersistentStorage(undefined), "unsupported", "no navigator");
  eq(
    await requestPersistentStorage({ storage: { persist: async () => { throw new Error("z"); } } }),
    "unknown",
    "persist throwing",
  );

  // storageCheck: a tick only for a real yes
  const refusedCheck = storageCheck({ ...s, standalone: false });
  eq(refusedCheck.ok, false, "refused is not ok");
  ok(refusedCheck.detail.includes(IOS_CLEARING_SENTENCE), "refused in tab explains iOS clearing");
  ok(refusedCheck.detail.includes("About 41 MB saved."), "check includes used");
  eq(storageCheck({ ...s, persisted: "unknown" }).ok, false, "unknown is not ok");
  eq(storageCheck({ ...s, persisted: "granted" }).ok, true, "granted is ok");
  ok(
    !storageCheck({ ...s, standalone: true }).detail.includes(IOS_CLEARING_SENTENCE),
    "installed app skips Safari sentence",
  );

  if (failures.length) {
    console.error(`storageStatus: ${passCount} passed, ${failures.length} failed`);
    for (const f of failures) console.error("  FAIL " + f);
    if (proc) proc.exitCode = 1;
  } else {
    console.log(`storageStatus: ${passCount} passed, 0 failed`);
  }
}

void main();
