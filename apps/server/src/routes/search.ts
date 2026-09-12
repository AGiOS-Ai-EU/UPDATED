import { zValidator } from "@hono/zod-validator";
import { createSearchProviders, runMultiProviderSearch } from "@updated/search";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { appendEgressLedgerEvent } from "../lib/egress-ledger.js";
import {
  appendDivergenceLog,
  buildDivergenceLogEvent,
} from "../lib/search/divergence-log.js";

const SEARCH_PROVIDER_MODE_KEY = "search_provider_mode";

const searchQuerySchema = z.object({
  query: z.string().trim().min(1).max(500),
});

function readSearchProviderMode(): "dual" | "single" {
  try {
    const row = getDb()
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(SEARCH_PROVIDER_MODE_KEY) as { value: string } | undefined;
    return row?.value === "single" ? "single" : "dual";
  } catch {
    return "dual";
  }
}

const search = new Hono().post(
  "/",
  zValidator("json", searchQuerySchema),
  async (c) => {
    const { query } = c.req.valid("json");
    const headerKey = c.req.header("x-search-api-key")?.trim();
    const headerMode = c.req.header("x-search-provider-mode")?.trim();
    const mode =
      headerMode === "single" || headerMode === "dual"
        ? headerMode
        : readSearchProviderMode();

    const providers = createSearchProviders({
      apiKey: headerKey || null,
      forceMock:
        process.env.UPDATED_SEARCH_MOCK === "1" ||
        process.env.UPDATED_SEARCH_MOCK === "true",
      single: mode === "single",
    });

    try {
      const outcome = await runMultiProviderSearch(
        providers,
        query,
        c.req.raw.signal,
      );

      const logEvent = buildDivergenceLogEvent({
        query,
        providers: outcome.results.map((result) => result.providerId),
        divergence: outcome.divergence,
      });
      appendDivergenceLog(logEvent);
      for (const result of outcome.results) {
        appendEgressLedgerEvent({
          category: "search",
          destination: result.providerId,
          method: "POST",
          status: 200,
          requestBytes: query.length,
          responseBytes: null,
          authorization: headerKey ? "user-api-key" : "public",
          surface: "web-search",
        });
      }

      return c.json({
        ok: true as const,
        query,
        contested: outcome.contested,
        divergence: outcome.divergence,
        results: outcome.results,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Search request failed";
      return c.json({ ok: false as const, error: message }, 502);
    }
  },
);

export default search;
