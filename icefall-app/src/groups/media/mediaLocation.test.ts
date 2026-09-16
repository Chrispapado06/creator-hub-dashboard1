/**
 * `npm run test:groups-media-location`.
 *
 * Structure plan R13 and slice S3: no group picture may carry the place it was
 * taken.
 *
 * WHAT IS PROVEN
 *   1. `jpegHasExif` and `jpegHasGps` find the GPS tag in a tagged photo and
 *      nothing in a clean one. The tagged fixture was written by Pillow, not by
 *      this code, so the reader is not only checked against its own writer.
 *      Both byte orders and GPS in XMP are covered too.
 *   2. `stripJpegMetadata` removes Exif, XMP, IPTC, MPF, comments and trailing
 *      bytes, keeps the picture byte for byte, and keeps the colour profile.
 *   3. `prepareGroupImage` refuses the upload when metadata survives or the
 *      bytes cannot be read as a JPEG, and what it does hand over has none.
 *   4. `uploadGroupImage` uploads only the checked bytes, to
 *      `<group>/<uid>/<random>.jpg` in `group-media`.
 *   5. No other code uploads to `group-media`, and chat sends go through the
 *      re-save first.
 *
 * WHAT IS NOT PROVEN HERE: the canvas re-encoding itself, which cannot run
 * under node. That is checked in a real browser (slice S3 note).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  jpegCarriesMetadata,
  jpegHasExif,
  jpegHasGps,
  scanJpeg,
  stripJpegMetadata,
} from "@/groups/media/jpegMetadata";
import {
  GROUP_IMAGE_MESSAGES,
  GROUP_MEDIA_BUCKET,
  GROUP_MEDIA_MAX_BYTES,
  prepareGroupImage,
  uploadGroupImage,
  type EncodedImage,
  type GroupImageEncoder,
} from "@/groups/media/groupImage";
import {
  CLEAN_JPEG_BASE64,
  GPS_TAGGED_JPEG_BASE64,
  bytesFromBase64,
} from "@/groups/media/fixtures/jpegFixtures";

let passed = 0;
const failures: string[] = [];
const pending: Promise<void>[] = [];
const section = (title: string) => {
  const run = async () => console.log(`\n${title}`);
  pending.push(pending.length === 0 ? run() : pending[pending.length - 1].then(run));
};
const test = (name: string, fn: () => void | Promise<void>) => {
  const run = async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failures.push(name);
      console.log(`  ✗ ${name}`);
      console.log(`    ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  pending.push(pending.length === 0 ? run() : pending[pending.length - 1].then(run));
};

const root = resolve(process.cwd());
const readSrc = (p: string) => readFileSync(resolve(root, p), "utf8");

/* ---- fixtures ---------------------------------------------------------------- */

/** Written by Pillow: Exif (big-endian) with a GPS directory, plus an sRGB ICC profile. */
const TAGGED = bytesFromBase64(GPS_TAGGED_JPEG_BASE64);
/** The same pixels, written by Pillow with no Exif and no profile. */
const CLEAN = bytesFromBase64(CLEAN_JPEG_BASE64);

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

function includesAscii(bytes: Uint8Array, text: string): boolean {
  const needle = ascii(text);
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let k = 0; k < needle.length; k++) if (bytes[i + k] !== needle[k]) continue outer;
    return true;
  }
  return false;
}

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
}

/** SOI, the given segments, then everything the clean fixture has after its SOI. */
function withSegments(base: Uint8Array, ...segments: number[][]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, ...segments.flat(), ...base.subarray(2)]);
}

/** A little-endian Exif block, with or without a GPS directory. */
function exifLittleEndian(withGps: boolean): number[] {
  const tiff = new Uint8Array(withGps ? 64 : 34);
  const v = new DataView(tiff.buffer);
  tiff.set(ascii("II"), 0);
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true);
  const entries = withGps ? 2 : 1;
  v.setUint16(8, entries, true);
  const makeAt = 8 + 2 + entries * 12 + 4;
  // Make, ASCII, 8 bytes, stored at makeAt.
  v.setUint16(10, 0x010f, true);
  v.setUint16(12, 2, true);
  v.setUint32(14, 8, true);
  v.setUint32(18, makeAt, true);
  if (withGps) {
    const gpsAt = makeAt + 8;
    v.setUint16(22, 0x8825, true);
    v.setUint16(24, 4, true);
    v.setUint32(26, 1, true);
    v.setUint32(30, gpsAt, true);
    // GPS directory: GPSLatitudeRef "N".
    v.setUint16(gpsAt, 1, true);
    v.setUint16(gpsAt + 2, 0x0001, true);
    v.setUint16(gpsAt + 4, 2, true);
    v.setUint32(gpsAt + 6, 2, true);
    tiff.set(ascii("N\0"), gpsAt + 10);
  }
  tiff.set(ascii("Fixture\0"), makeAt);
  return [...ascii("Exif\0\0"), ...tiff];
}

const XMP_WITH_GPS = [
  ...ascii("http://ns.adobe.com/xap/1.0/\0"),
  ...ascii(
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="45,49.95N" exif:GPSLongitude="6,51.9E"/>' +
      "</rdf:RDF></x:xmpmeta>",
  ),
];

/** Index just past the SOS header of a well-formed file. */
function sosPayloadEnd(bytes: Uint8Array): number {
  let i = 2;
  for (;;) {
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xda) return i + 2 + length;
    i += 2 + length;
  }
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, ...ascii("IHDR")]);

const picture = (name = "summit.jpg", type = "image/jpeg") => new File([new Uint8Array([1, 2, 3])], name, { type });

const encoderOf =
  (bytes: Uint8Array, width = 64, height = 48): GroupImageEncoder =>
  async () =>
    ({ bytes, width, height }) satisfies EncodedImage;

const blobBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

/* ---- 1. reading ---------------------------------------------------------------- */

section("Reading what a JPEG carries");

test("the tagged fixture is a JPEG with Exif and the GPS tag", () => {
  const scan = scanJpeg(TAGGED);
  assert.equal(scan.wellFormed, true);
  assert.equal(jpegHasExif(TAGGED), true);
  assert.equal(jpegHasGps(TAGGED), true);
  assert.equal(jpegCarriesMetadata(TAGGED), true);
});

test("the clean fixture carries nothing", () => {
  assert.deepEqual(scanJpeg(CLEAN), {
    wellFormed: true,
    exif: false,
    gps: false,
    xmp: false,
    otherMetadata: false,
    trailing: false,
  });
  assert.equal(jpegHasExif(CLEAN), false);
  assert.equal(jpegHasGps(CLEAN), false);
  assert.equal(jpegCarriesMetadata(CLEAN), false);
});

test("little-endian Exif: the GPS tag is found, and Exif without it is still Exif", () => {
  const withGps = withSegments(CLEAN, segment(0xe1, exifLittleEndian(true)));
  assert.equal(jpegHasExif(withGps), true);
  assert.equal(jpegHasGps(withGps), true);
  const noGps = withSegments(CLEAN, segment(0xe1, exifLittleEndian(false)));
  assert.equal(jpegHasExif(noGps), true);
  assert.equal(jpegHasGps(noGps), false);
  assert.equal(jpegCarriesMetadata(noGps), true);
});

test("GPS written as XMP is found", () => {
  const xmp = withSegments(CLEAN, segment(0xe1, XMP_WITH_GPS));
  const scan = scanJpeg(xmp);
  assert.equal(scan.xmp, true);
  assert.equal(scan.gps, true);
  assert.equal(jpegHasExif(xmp), false);
});

test("the word Exif inside the picture data is not read as metadata", () => {
  const at = sosPayloadEnd(CLEAN) + 4;
  const bytes = new Uint8Array([...CLEAN.subarray(0, at), ...ascii("Exif\0\0MM\0*"), ...CLEAN.subarray(at)]);
  const scan = scanJpeg(bytes);
  assert.equal(scan.wellFormed, true);
  assert.equal(scan.exif, false);
  assert.equal(jpegCarriesMetadata(bytes), false);
});

test("comments, IPTC, MPF and bytes after the end all count as metadata", () => {
  assert.equal(scanJpeg(withSegments(CLEAN, segment(0xfe, ascii("Taken on the ridge")))).otherMetadata, true);
  assert.equal(scanJpeg(withSegments(CLEAN, segment(0xed, ascii("Photoshop 3.0\0 8BIM")))).otherMetadata, true);
  assert.equal(scanJpeg(withSegments(CLEAN, segment(0xe2, ascii("MPF\0MM\0*")))).otherMetadata, true);
  const trailing = new Uint8Array([...CLEAN, ...ascii("ftypmp42")]);
  assert.equal(scanJpeg(trailing).trailing, true);
  assert.equal(jpegCarriesMetadata(trailing), true);
});

test("a truncated tagged file is not well formed and still reads as tagged", () => {
  const cut = TAGGED.subarray(0, 120);
  const scan = scanJpeg(cut);
  assert.equal(scan.wellFormed, false);
  assert.equal(jpegHasExif(cut), true);
  assert.equal(jpegCarriesMetadata(cut), true);
});

test("a PNG or empty bytes can never be vouched for", () => {
  assert.equal(jpegCarriesMetadata(PNG), true);
  assert.equal(jpegCarriesMetadata(new Uint8Array()), true);
  assert.equal(stripJpegMetadata(PNG), null);
  assert.equal(stripJpegMetadata(new Uint8Array()), null);
});

/* ---- 2. stripping ---------------------------------------------------------------- */

section("Stripping");

test("stripping the tagged fixture leaves no Exif and no GPS", () => {
  const out = stripJpegMetadata(TAGGED);
  assert.ok(out);
  assert.equal(jpegHasExif(out), false);
  assert.equal(jpegHasGps(out), false);
  assert.equal(jpegCarriesMetadata(out), false);
});

test("stripping keeps the picture byte for byte and keeps the colour profile", () => {
  const out = stripJpegMetadata(TAGGED);
  assert.ok(out);
  const dqt = (b: Uint8Array) => {
    for (let i = 2; i + 1 < b.length; i++) if (b[i] === 0xff && b[i + 1] === 0xdb) return i;
    return -1;
  };
  assert.deepEqual(out.subarray(dqt(out)), TAGGED.subarray(dqt(TAGGED)));
  assert.ok(includesAscii(out, "ICC_PROFILE\0"), "ICC profile kept");
  assert.ok(includesAscii(out, "JFIF\0"), "JFIF header kept");
  assert.ok(!includesAscii(out, "Exif\0\0"), "Exif header gone");
});

test("a clean file comes out of the stripper unchanged", () => {
  assert.deepEqual(stripJpegMetadata(CLEAN), CLEAN);
});

test("stripping removes XMP, comments, IPTC, MPF and trailing bytes together", () => {
  const messy = new Uint8Array([
    ...withSegments(
      CLEAN,
      segment(0xe1, exifLittleEndian(true)),
      segment(0xe1, XMP_WITH_GPS),
      segment(0xfe, ascii("Taken on the ridge")),
      segment(0xed, ascii("Photoshop 3.0\0 8BIM")),
      segment(0xe2, ascii("MPF\0MM\0*")),
    ),
    ...ascii("ftypmp42 and a video"),
  ]);
  const out = stripJpegMetadata(messy);
  assert.ok(out);
  assert.deepEqual(out, CLEAN);
});

test("a truncated file cannot be stripped", () => {
  assert.equal(stripJpegMetadata(TAGGED.subarray(0, TAGGED.length - 40)), null);
});

/* ---- 3. the re-save refuses when metadata survives ------------------------------------- */

section("Re-saving before upload");

test("a tagged encoder output is handed over with no Exif and no GPS", async () => {
  const prepared = await prepareGroupImage(picture(), encoderOf(TAGGED, 64, 48));
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const bytes = await blobBytes(prepared.image.blob);
  assert.equal(jpegHasExif(bytes), false);
  assert.equal(jpegHasGps(bytes), false);
  assert.equal(jpegCarriesMetadata(bytes), false);
  assert.equal(prepared.image.blob.type, "image/jpeg");
  assert.deepEqual(prepared.image.meta, { kind: "image", mime: "image/jpeg", bytes: bytes.length, width: 64, height: 48 });
});

test("the upload is refused when metadata survives, even if the stripper let it through", async () => {
  const prepared = await prepareGroupImage(picture(), encoderOf(TAGGED), (bytes) => bytes);
  assert.deepEqual(prepared, { ok: false, reason: "not-clean", message: GROUP_IMAGE_MESSAGES["not-clean"] });
  const xmp = withSegments(CLEAN, segment(0xe1, XMP_WITH_GPS));
  const xmpPrepared = await prepareGroupImage(picture(), encoderOf(xmp), (bytes) => bytes);
  assert.equal(xmpPrepared.ok === false && xmpPrepared.reason, "not-clean");
  const cleanPrepared = await prepareGroupImage(picture(), encoderOf(CLEAN), (bytes) => bytes);
  assert.equal(cleanPrepared.ok, true);
});

test("the upload is refused when the bytes are not a JPEG it can check", async () => {
  const prepared = await prepareGroupImage(picture(), encoderOf(PNG));
  assert.deepEqual(prepared, { ok: false, reason: "not-clean", message: GROUP_IMAGE_MESSAGES["not-clean"] });
});

test("the upload is refused when a tagged file cannot be followed to its end", async () => {
  const prepared = await prepareGroupImage(picture(), encoderOf(TAGGED.subarray(0, TAGGED.length - 40)));
  assert.equal(prepared.ok, false);
  if (!prepared.ok) assert.equal(prepared.reason, "not-clean");
});

test("anything that is not a picture is refused before encoding", async () => {
  let calls = 0;
  const prepared = await prepareGroupImage(picture("clip.mp4", "video/mp4"), async () => {
    calls += 1;
    return { bytes: CLEAN, width: 64, height: 48 };
  });
  assert.equal(prepared.ok, false);
  if (!prepared.ok) assert.equal(prepared.reason, "not-an-image");
  assert.equal(calls, 0);
});

test("a HEIC with no type is tried, and a browser that cannot open it gets the HEIC sentence", async () => {
  let called = 0;
  const prepared = await prepareGroupImage(picture("IMG_0001.HEIC", ""), async () => {
    called += 1;
    throw { reason: "heic", message: "x" };
  });
  assert.equal(called, 1);
  assert.equal(prepared.ok, false);
  if (!prepared.ok) assert.equal(prepared.reason, "heic");
});

test("an encoder failure or an empty drawing is unreadable", async () => {
  const thrown = await prepareGroupImage(picture(), async () => {
    throw new Error("decode failed");
  });
  assert.equal(thrown.ok === false && thrown.reason, "unreadable");
  const empty = await prepareGroupImage(picture(), encoderOf(CLEAN, 0, 48));
  assert.equal(empty.ok === false && empty.reason, "unreadable");
});

test("a re-saved picture over the bucket limit is refused", async () => {
  const size = GROUP_MEDIA_MAX_BYTES + 1024;
  const big = new Uint8Array(size);
  big.set([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00], 0);
  big.set([0xff, 0xd9], size - 2);
  const prepared = await prepareGroupImage(picture(), encoderOf(big));
  assert.equal(prepared.ok === false && prepared.reason, "too-large");
});

test("every refusal is one sentence", () => {
  for (const [reason, message] of Object.entries(GROUP_IMAGE_MESSAGES)) {
    assert.match(message, /^[^.!?]+\.$/, `${reason}: ${message}`);
  }
});

/* ---- 4. the upload ------------------------------------------------------------------ */

section("Uploading");

const GROUP = "3f2b8a1e-6c4d-4e8f-9a0b-1c2d3e4f5a6b";
const UID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

function recordingClient(error: unknown = null) {
  const calls: { bucket: string; path: string; body: Blob; options: { contentType: string; upsert: boolean } }[] = [];
  return {
    calls,
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, body: Blob, options: { contentType: string; upsert: boolean }) {
            calls.push({ bucket, path, body, options });
            return { error };
          },
        };
      },
    },
  };
}

test("only the checked bytes go up, to group-media at <group>/<uid>/<random>.jpg", async () => {
  const prepared = await prepareGroupImage(picture(), encoderOf(TAGGED));
  assert.ok(prepared.ok);
  if (!prepared.ok) return;
  const client = recordingClient();
  const result = await uploadGroupImage(client, GROUP, UID, prepared.image);
  assert.equal(client.calls.length, 1);
  const [call] = client.calls;
  assert.equal(call.bucket, "group-media");
  assert.equal(GROUP_MEDIA_BUCKET, "group-media");
  assert.match(call.path, new RegExp(`^${GROUP}/${UID}/[0-9a-f-]{36}\\.jpg$`));
  assert.deepEqual(call.options, { contentType: "image/jpeg", upsert: false });
  const sent = await blobBytes(call.body);
  assert.equal(jpegHasExif(sent), false);
  assert.equal(jpegHasGps(sent), false);
  assert.deepEqual(result, { ok: true, path: call.path, meta: prepared.image.meta });
});

test("a storage error is reported as a failed upload", async () => {
  const prepared = await prepareGroupImage(picture(), encoderOf(CLEAN));
  assert.ok(prepared.ok);
  if (!prepared.ok) return;
  const result = await uploadGroupImage(recordingClient({ message: "denied" }), GROUP, UID, prepared.image);
  assert.deepEqual(result, { ok: false });
});

/* ---- 5. nothing else uploads to group-media ------------------------------------------------ */

section("Source");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

test("no code outside groupImage.ts writes to group-media", () => {
  const offenders: string[] = [];
  for (const full of sourceFiles(resolve(root, "src"))) {
    const rel = full.slice(root.length + 1);
    const text = readFileSync(full, "utf8");
    if (rel === "src/groups/media/groupImage.ts") continue;
    // Every storage chain on the group bucket, by constant or by literal.
    const chains = text.matchAll(/\.from\(\s*(GROUP_MEDIA_BUCKET|["']group-media["'])\s*\)\s*\.(\w+)\(/g);
    for (const m of chains) {
      if (m[2] !== "createSignedUrls" && m[2] !== "createSignedUrl" && m[2] !== "remove") offenders.push(`${rel}: .${m[2]}(`);
    }
    if (/["']group-media["']/.test(text)) offenders.push(`${rel}: bucket literal`);
  }
  assert.deepEqual(offenders, []);
});

test("groupImage.ts uploads only a checked image, re-saved through prepareImage", () => {
  const src = readSrc("src/groups/media/groupImage.ts");
  const uploads = [...src.matchAll(/\.upload\(/g)];
  assert.equal(uploads.length, 1);
  assert.match(src, /\.upload\(path, image\.blob,/);
  assert.match(src, /image: CleanGroupImage,\n\): Promise<GroupImageUpload>/);
  assert.match(src, /encode: GroupImageEncoder = encodeThroughCanvas/);
  assert.match(src, /await prepareImage\(file, GROUP_IMAGE_EDGE_PX\)/);
  assert.match(src, /canvas\.toBlob\(resolve, "image\/jpeg", GROUP_IMAGE_QUALITY\)/);
  assert.match(src, /strip: \(bytes: Uint8Array\) => Uint8Array \| null = stripJpegMetadata/);
  assert.match(src, /if \(!stripped \|\| jpegCarriesMetadata\(stripped\)\) return refuse\("not-clean"\)/);
});

test("chat sends re-save the picture before the session gate and never upload the raw file", () => {
  const src = readSrc("src/social/groupSpace.ts");
  assert.equal(/\.upload\(/.test(src), false, "groupSpace.ts calls .upload( directly");
  const sendAt = src.indexOf("const send = useCallback(");
  assert.ok(sendAt > 0);
  const body = src.slice(sendAt, src.indexOf("return { create, join, requestJoin", sendAt));
  const prepareAt = body.indexOf("await prepareGroupImage(file)");
  const refusedAt = body.indexOf("if (!prepared.ok) {");
  const gateAt = body.indexOf("await gate()");
  const uploadAt = body.indexOf("await uploadGroupImage(session.client, groupId, session.uid, image)");
  assert.ok(prepareAt > 0 && refusedAt > prepareAt && gateAt > refusedAt && uploadAt > gateAt, JSON.stringify({ prepareAt, refusedAt, gateAt, uploadAt }));
  assert.match(body.slice(refusedAt, gateAt), /return false;/);
  assert.match(body, /mediaMeta = \{ \.\.\.upload\.meta \};/);
});

test("the byte reader is pure and the media files hold no hex colour", () => {
  const pure = readSrc("src/groups/media/jpegMetadata.ts");
  assert.equal(/^import /m.test(pure), false);
  for (const f of ["src/groups/media/jpegMetadata.ts", "src/groups/media/groupImage.ts"]) {
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(readSrc(f)), false, f);
  }
});

void Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
});
