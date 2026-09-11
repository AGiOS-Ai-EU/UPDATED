import { describe, expect, it } from "vitest";
import { runMultiProviderSearch } from "./multi-search.js";

describe("runMultiProviderSearch", () => {
  it("reports an explicit unavailable state when no provider is configured", async () => {
    await expect(runMultiProviderSearch([], "cyprus filing")).rejects.toThrow(
      "No live search provider configured",
    );
  });
});
