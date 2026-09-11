import { afterEach, describe, expect, it } from "vitest";
import {
  createSearchProvider,
  createSearchProviders,
} from "./factory.js";

const ENV_KEYS = [
  "NODE_ENV",
  "FREESTYLE_ENV",
  "UPDATED_SEARCH_MOCK",
  "UPDATED_SEARCH_SINGLE",
  "BRAVE_SEARCH_API_KEY",
  "UPDATED_BRAVE_SEARCH_API_KEY",
] as const;

const previousEnv = new Map<string, string | undefined>();

function rememberEnv(): void {
  for (const key of ENV_KEYS) previousEnv.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = previousEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  previousEnv.clear();
}

describe("createSearchProviders", () => {
  afterEach(restoreEnv);

  it("uses two mocks in development when no live key is configured", () => {
    rememberEnv();
    delete process.env.NODE_ENV;
    delete process.env.FREESTYLE_ENV;

    expect(createSearchProviders().map((provider) => provider.id)).toEqual([
      "mock",
      "mock-alt",
    ]);
  });

  it("does not mix live Brave results with mock providers", () => {
    rememberEnv();

    expect(
      createSearchProviders({ apiKey: "brave-key" }).map(
        (provider) => provider.id,
      ),
    ).toEqual(["brave"]);
  });

  it("returns no providers in production without a live key", () => {
    rememberEnv();
    process.env.NODE_ENV = "production";
    process.env.FREESTYLE_ENV = "production";

    expect(createSearchProviders().map((provider) => provider.id)).toEqual([]);
  });

  it("keeps explicit mock mode available for local demos", () => {
    rememberEnv();
    process.env.NODE_ENV = "production";
    process.env.FREESTYLE_ENV = "production";

    expect(
      createSearchProviders({ forceMock: true }).map((provider) => provider.id),
    ).toEqual(["mock", "mock-alt"]);
  });

  it("keeps the back-compat single-provider helper live-only when keyed", () => {
    rememberEnv();

    expect(createSearchProvider({ apiKey: "brave-key" }).id).toBe("brave");
  });
});
