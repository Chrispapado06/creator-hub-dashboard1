/**
 * What a JPEG carries besides its picture, read from the bytes alone.
 *
 * Pure: no DOM, no canvas, no network, so it runs under node in
 * `test:groups-media-location`. Structure plan R13 and slice S3.
 *
 * WHY THIS EXISTS. Group chat photos used to go up as the raw file, and a phone
 * photo's Exif block usually holds the GPS position it was taken at. Every
 * group-media upload is now redrawn through a canvas first (`groupImage.ts`),
 * which drops that block in practice. This module is what checks it, and it
 * also removes any metadata segment an encoder adds of its own, so the check
 * does not depend on one browser's JPEG writer.
 *
 * WHAT IS KEPT: the picture (frame, tables, scans), the JFIF header, an ICC
 * colour profile and the Adobe colour-transform segment. None of these can
 * hold a place, a time or a device.
 *
 * WHAT IS REMOVED: every other APPn segment (Exif, XMP, IPTC, MPF, maker
 * data), comments, and anything after the end-of-image marker, where some
 * phones append extra pictures or video.
 */

/** Everything this module learnt from one pass over the bytes. */
export interface JpegScan {
  /** Starts with SOI, every segment fits, and it ends with EOI. */
  wellFormed: boolean;
  /** An APP1 segment with the `Exif` header. */
  exif: boolean;
  /** The Exif GPS tag (0x8825) in IFD0, or GPS fields in an XMP packet. */
  gps: boolean;
  /** An APP1 XMP packet (standard or extended). */
  xmp: boolean;
  /** Any other segment this module would remove (IPTC, MPF, comments…). */
  otherMetadata: boolean;
  /** Bytes after the end-of-image marker. */
  trailing: boolean;
}

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const APP15 = 0xef;
const COM = 0xfe;

/** The Exif tag whose value points at the GPS directory. */
const GPS_IFD_POINTER = 0x8825;

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const JFIF_HEADER = [0x4a, 0x46, 0x49, 0x46, 0x00]; // "JFIF\0"
const ICC_HEADER = ascii("ICC_PROFILE\0");
const ADOBE_HEADER = ascii("Adobe");
const XMP_HEADER = ascii("http://ns.adobe.com/xap/1.0/\0");
const XMP_EXT_HEADER = ascii("http://ns.adobe.com/xmp/extension/\0");

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

function startsWith(bytes: Uint8Array, at: number, end: number, header: number[]): boolean {
  if (at + header.length > end) return false;
  for (let i = 0; i < header.length; i++) if (bytes[at + i] !== header[i]) return false;
  return true;
}

/** A marker with no length field after it. */
function standalone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

/** One segment in file order. `end` is exclusive and includes the entropy data after an SOS. */
interface Segment {
  marker: number;
  start: number;
  /** First payload byte (after the two length bytes). */
  payload: number;
  end: number;
}

/**
 * Walks the file segment by segment, including the entropy-coded data after
 * each SOS, so a progressive file's later segments are seen too. Returns null
 * when the structure cannot be followed to EOI.
 */
function walk(bytes: Uint8Array): { segments: Segment[]; eoiEnd: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return null;
  const segments: Segment[] = [];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    // Fill bytes: any number of 0xFF before a marker.
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) return null;
    const marker = bytes[i];
    const start = i - 1;
    i++;
    if (marker === EOI) return { segments, eoiEnd: i };
    if (marker === SOI || marker === 0x00) return null;
    if (standalone(marker)) {
      segments.push({ marker, start, payload: i, end: i });
      continue;
    }
    if (i + 2 > bytes.length) return null;
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) return null;
    const payload = i + 2;
    let end = i + length;
    if (marker === SOS) {
      // Entropy-coded data runs until a marker that is not stuffing (FF00),
      // a restart (FFD0–FFD7) or fill (FFFF).
      let j = end;
      for (;;) {
        if (j + 1 >= bytes.length) return null;
        if (bytes[j] === 0xff) {
          const next = bytes[j + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7) || next === 0xff) {
            j += next === 0xff ? 1 : 2;
            continue;
          }
          break;
        }
        j++;
      }
      end = j;
    }
    segments.push({ marker, start, payload, end });
    i = end;
  }
  return null;
}

/** Is this segment one the stripper keeps? */
function kept(bytes: Uint8Array, s: Segment): boolean {
  if (s.marker === APP0) return startsWith(bytes, s.payload, s.end, JFIF_HEADER);
  if (s.marker === APP2) return startsWith(bytes, s.payload, s.end, ICC_HEADER);
  if (s.marker === APP14) return startsWith(bytes, s.payload, s.end, ADOBE_HEADER);
  if (s.marker >= APP0 && s.marker <= APP15) return false;
  if (s.marker === COM) return false;
  return true;
}

/** Reads the TIFF block inside an Exif segment and looks for the GPS pointer in IFD0. */
function exifHasGpsPointer(bytes: Uint8Array, from: number, to: number): boolean {
  const tiff = from + EXIF_HEADER.length;
  if (tiff + 8 > to) return false;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!little && !big) return false;
  const u16 = (at: number) => (little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
  const u32 = (at: number) =>
    little
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
      : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  if (u16(tiff + 2) !== 42) return false;
  const ifd0 = tiff + u32(tiff + 4);
  if (ifd0 + 2 > to) return false;
  const count = u16(ifd0);
  for (let n = 0; n < count; n++) {
    const entry = ifd0 + 2 + n * 12;
    if (entry + 12 > to) return false;
    if (u16(entry) === GPS_IFD_POINTER) return true;
  }
  return false;
}

function textIncludes(bytes: Uint8Array, from: number, to: number, needle: string): boolean {
  const n = ascii(needle);
  outer: for (let i = from; i + n.length <= to; i++) {
    for (let k = 0; k < n.length; k++) if (bytes[i + k] !== n[k]) continue outer;
    return true;
  }
  return false;
}

/** One pass over the bytes. Never throws. */
export function scanJpeg(bytes: Uint8Array): JpegScan {
  const scan: JpegScan = {
    wellFormed: false,
    exif: false,
    gps: false,
    xmp: false,
    otherMetadata: false,
    trailing: false,
  };
  const walked = walk(bytes);
  if (!walked) {
    // Not followable, so nothing is vouched for. Exif near the start is still
    // reported, so a truncated tagged file reads as tagged, not clean.
    const head = Math.min(bytes.length, 65_536);
    for (let i = 0; i + 1 < head; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === APP1 && startsWith(bytes, i + 4, head, EXIF_HEADER)) {
        scan.exif = true;
        const length = i + 3 < head ? (bytes[i + 2] << 8) | bytes[i + 3] : 0;
        scan.gps = exifHasGpsPointer(bytes, i + 4, Math.min(head, i + 2 + length));
        break;
      }
    }
    return scan;
  }
  scan.wellFormed = true;
  scan.trailing = walked.eoiEnd < bytes.length;
  for (const s of walked.segments) {
    if (kept(bytes, s)) continue;
    if (s.marker === APP1 && startsWith(bytes, s.payload, s.end, EXIF_HEADER)) {
      scan.exif = true;
      if (exifHasGpsPointer(bytes, s.payload, s.end)) scan.gps = true;
    } else if (
      s.marker === APP1 &&
      (startsWith(bytes, s.payload, s.end, XMP_HEADER) || startsWith(bytes, s.payload, s.end, XMP_EXT_HEADER))
    ) {
      scan.xmp = true;
      if (textIncludes(bytes, s.payload, s.end, "GPSLatitude") || textIncludes(bytes, s.payload, s.end, "GPSLongitude")) {
        scan.gps = true;
      }
    } else {
      scan.otherMetadata = true;
    }
  }
  return scan;
}

/** True when the JPEG holds an Exif block. */
export function jpegHasExif(bytes: Uint8Array): boolean {
  return scanJpeg(bytes).exif;
}

/** True when the JPEG holds a GPS position, in Exif or XMP. */
export function jpegHasGps(bytes: Uint8Array): boolean {
  return scanJpeg(bytes).gps;
}

/**
 * True unless the bytes are a well-formed JPEG holding nothing but the picture
 * and the segments this module keeps. An unreadable file counts as carrying
 * metadata, because nothing about it can be vouched for.
 */
export function jpegCarriesMetadata(bytes: Uint8Array): boolean {
  const s = scanJpeg(bytes);
  return !s.wellFormed || s.exif || s.gps || s.xmp || s.otherMetadata || s.trailing;
}

/**
 * The same picture without its metadata segments or trailing bytes. The frame,
 * tables and scans are copied byte for byte, so the picture is not re-encoded
 * here. Returns null when the bytes are not a JPEG this module can follow.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  const walked = walk(bytes);
  if (!walked) return null;
  const keep = walked.segments.filter((s) => kept(bytes, s));
  let size = 2 + 2; // SOI + EOI
  for (const s of keep) size += s.end - s.start;
  const out = new Uint8Array(size);
  out[0] = 0xff;
  out[1] = SOI;
  let at = 2;
  for (const s of keep) {
    out.set(bytes.subarray(s.start, s.end), at);
    at += s.end - s.start;
  }
  out[at] = 0xff;
  out[at + 1] = EOI;
  return out;
}
