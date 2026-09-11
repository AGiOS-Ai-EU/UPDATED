import type { SearchCitation } from "./types.js";

/** Canonical source-class labels for certificate UI. */
export type SourceClass =
  | "primary"
  | "encyclopedic"
  | "press"
  | "professional"
  | "commercial"
  | "community"
  | "unknown";

const PRIMARY_EXACT = new Set([
  "gov.uk",
  "gov.gr",
  "gov.cy",
  "gov.au",
  "gov.ca",
  "bankofengland.co.uk",
  "fca.org.uk",
]);

const PRIMARY_SUFFIXES = [
  ".gov",
  ".gov.uk",
  ".gov.gr",
  ".gov.cy",
  ".gouv.fr",
  ".gob.es",
  ".gov.au",
  ".gov.ca",
  ".europa.eu",
  "europa.eu",
] as const;

const ENCYCLOPEDIC_DOMAINS = [
  "wikipedia.org",
  "wikimedia.org",
  "britannica.com",
  "dbpedia.org",
  "wikidata.org",
] as const;

const PRESS_DOMAINS = [
  "nytimes.com",
  "bbc.co.uk",
  "bbc.com",
  "reuters.com",
  "theguardian.com",
  "ft.com",
  "wsj.com",
  "economist.com",
  "apnews.com",
  "cnn.com",
  "bloomberg.com",
  "politico.com",
  "techcrunch.com",
  "arstechnica.com",
  "kathimerini.gr",
  "cyprusmail.com",
] as const;

const PROFESSIONAL_KEYWORDS = [
  "law",
  "legal",
  "attorney",
  "solicitor",
  "barrister",
  "accounting",
  "accountancy",
  "consulting",
  "consultancy",
  "advisory",
  "pwc.",
  "deloitte.",
  "kpmg.",
  "ey.com",
  "bakermckenzie",
  "cliffordchance",
  "linklaters",
  "freshfields",
  "allen-overy",
  "whitecase",
  "hoganlovells",
] as const;

const COMMUNITY_DOMAINS = [
  "reddit.com",
  "stackexchange.com",
  "stackoverflow.com",
  "quora.com",
  "news.ycombinator.com",
] as const;

const COMMUNITY_KEYWORDS = ["discourse.", "forum.", "forums."] as const;

const COMMERCIAL_KEYWORDS = [
  "shop",
  "store",
  "buy",
  "pricing",
  "product",
  "saas",
  "cloud",
  "aws.",
  "azure.",
  "googlecloud",
  "salesforce",
  "hubspot",
  "stripe.",
] as const;

function normalizeHost(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).hostname.replace(/^www\./, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0];
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function hostIncludesAny(host: string, needles: readonly string[]): boolean {
  return needles.some((needle) => host.includes(needle));
}

function isPrimaryHost(host: string): boolean {
  if (PRIMARY_EXACT.has(host)) return true;
  if (
    PRIMARY_SUFFIXES.some(
      (suffix) =>
        host.endsWith(suffix) ||
        (suffix.startsWith(".") && host === suffix.slice(1)),
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Classify a web source by citation or bare domain string.
 * Accepts full URLs, hostnames, or {@link SearchCitation} objects.
 */
export function classifySource(input: string | SearchCitation): SourceClass {
  const host =
    typeof input === "string"
      ? normalizeHost(input)
      : normalizeHost(input.domain || input.url);

  if (!host) return "unknown";

  if (ENCYCLOPEDIC_DOMAINS.some((d) => hostMatches(host, d))) {
    return "encyclopedic";
  }

  if (isPrimaryHost(host)) {
    return "primary";
  }

  if (PRESS_DOMAINS.some((d) => hostMatches(host, d))) {
    return "press";
  }

  if (
    COMMUNITY_DOMAINS.some((d) => hostMatches(host, d)) ||
    hostIncludesAny(host, COMMUNITY_KEYWORDS)
  ) {
    return "community";
  }

  if (hostIncludesAny(host, PROFESSIONAL_KEYWORDS)) {
    return "professional";
  }

  if (hostIncludesAny(host, COMMERCIAL_KEYWORDS)) {
    return "commercial";
  }

  return "unknown";
}

/** Uppercase chip label — the only uppercase strings in the product UI. */
export function sourceClassChipLabel(sourceClass: SourceClass): string {
  return sourceClass.toUpperCase();
}

/** Human-readable label for metadata strips (sentence case). */
export function sourceClassDisplayLabel(sourceClass: SourceClass): string {
  switch (sourceClass) {
    case "primary":
      return "primary source";
    case "encyclopedic":
      return "encyclopedic";
    case "press":
      return "press";
    case "professional":
      return "professional";
    case "commercial":
      return "commercial";
    case "community":
      return "community";
    default:
      return "unknown";
  }
}
