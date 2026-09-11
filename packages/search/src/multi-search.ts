import { computeDivergence, type DivergenceReport } from "./divergence.js";
import type { SearchAnswer, SearchProvider } from "./types.js";

export interface ProviderSearchResult {
  providerId: string;
  answer: SearchAnswer;
}

export interface MultiProviderSearchResult {
  results: ProviderSearchResult[];
  divergence: DivergenceReport;
  contested: boolean;
}

/** Run all providers independently — never merge or vote on citations. */
export async function runMultiProviderSearch(
  providers: SearchProvider[],
  query: string,
  signal?: AbortSignal,
): Promise<MultiProviderSearchResult> {
  if (providers.length === 0) {
    throw new Error("No live search provider configured");
  }

  const settled = await Promise.allSettled(
    providers.map(async (provider) => ({
      providerId: provider.id,
      answer: await provider.search(query, signal),
    })),
  );

  const results: ProviderSearchResult[] = [];
  const errors: string[] = [];

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      const message =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : "Provider search failed";
      errors.push(message);
    }
  }

  if (results.length === 0) {
    throw new Error(errors[0] ?? "All search providers failed");
  }

  const divergence = computeDivergence(
    results.map((result) => ({
      providerId: result.providerId,
      citations: result.answer.citations,
    })),
  );

  return {
    results,
    divergence,
    contested: divergence.contested,
  };
}
