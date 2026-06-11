// Tiny country list for the staff roster picker. ISO 3166-1 alpha-2
// codes, with flag emojis derived from the regional-indicator unicode
// trick (each ASCII letter maps to its flag-letter codepoint).
//
// We keep the list short — the most common countries OFM agencies
// hire from. "Other" is always available as a free-text fallback in
// the UI for anything not on the list.

export type Country = { code: string; name: string };

/** Common chat / VA hiring locales — alpha order. */
export const COUNTRIES: Country[] = [
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CO", name: "Colombia" },
  { code: "CZ", name: "Czechia" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "EG", name: "Egypt" },
  { code: "ES", name: "Spain" },
  { code: "FR", name: "France" },
  { code: "GR", name: "Greece" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IN", name: "India" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KE", name: "Kenya" },
  { code: "KR", name: "South Korea" },
  { code: "MA", name: "Morocco" },
  { code: "MX", name: "Mexico" },
  { code: "NG", name: "Nigeria" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "NZ", name: "New Zealand" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "RS", name: "Serbia" },
  { code: "SE", name: "Sweden" },
  { code: "SG", name: "Singapore" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Türkiye" },
  { code: "UA", name: "Ukraine" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "ZA", name: "South Africa" },
];

/** Convert a 2-letter ISO code to its flag emoji. Bad codes → "🏳". */
export function flagEmoji(code?: string | null): string {
  if (!code || code.length !== 2) return "🏳";
  const upper = code.toUpperCase();
  // Regional-indicator letters are at codepoint 0x1F1E6 + (letter - 'A').
  const a = upper.charCodeAt(0);
  const b = upper.charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return "🏳";
  return String.fromCodePoint(0x1f1e6 + a - 65) + String.fromCodePoint(0x1f1e6 + b - 65);
}

/** Lookup helper — returns the row (or null) for an ISO code. */
export function countryByCode(code?: string | null): Country | null {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code.toUpperCase() === code.toUpperCase()) ?? null;
}
