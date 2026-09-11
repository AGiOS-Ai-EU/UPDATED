import type { SearchProvider } from "../types.js";
import { BraveSearchProvider } from "./brave.js";
import { MockSearchProvider } from "./mock.js";
import { MockAltSearchProvider } from "./mock-alt.js";

export interface SearchProviderOptions {
  apiKey?: string | null;
  forceMock?: boolean;
  /** When true, run one provider only (no divergence). */
  single?: boolean;
}

function isSingleProviderMode(options: SearchProviderOptions): boolean {
  if (options.single) return true;
  return (
    process.env.UPDATED_SEARCH_SINGLE === "1" ||
    process.env.UPDATED_SEARCH_SINGLE === "true"
  );
}

/**
 * Return the active provider set for divergence-aware search.
 * Mocks are allowed only in explicit mock mode or non-production dev mode.
 * Live providers are never paired with mocks, because mock citations must not
 * contribute to production corroboration or agreement states.
 */
export function createSearchProviders(
  options: SearchProviderOptions = {},
): SearchProvider[] {
  const forceMock =
    options.forceMock ||
    process.env.UPDATED_SEARCH_MOCK === "1" ||
    process.env.UPDATED_SEARCH_MOCK === "true";

  const apiKey =
    options.apiKey?.trim() ||
    process.env.BRAVE_SEARCH_API_KEY?.trim() ||
    process.env.UPDATED_BRAVE_SEARCH_API_KEY?.trim() ||
    "";

  const mocksAllowed =
    forceMock ||
    (process.env.NODE_ENV !== "production" &&
      process.env.FREESTYLE_ENV !== "production");

  if (isSingleProviderMode(options)) {
    if (!apiKey) return mocksAllowed ? [new MockSearchProvider()] : [];
    return [new BraveSearchProvider(apiKey)];
  }

  if (!apiKey) {
    return mocksAllowed
      ? [new MockSearchProvider(), new MockAltSearchProvider()]
      : [];
  }

  if (forceMock) {
    return [new MockSearchProvider(), new MockAltSearchProvider()];
  }

  return [new BraveSearchProvider(apiKey)];
}

/** Back-compat helper for callers that still expect one provider. */
export function createSearchProvider(
  options: SearchProviderOptions = {},
): SearchProvider {
  return createSearchProviders(options)[0];
}

export { BraveSearchProvider, MockAltSearchProvider, MockSearchProvider };
