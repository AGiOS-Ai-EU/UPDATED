import { describe, expect, it } from "vitest";
import { isExternallyReachableHost } from "../src/index.js";

describe("server bind security", () => {
  it("treats loopback hosts as local-only", () => {
    expect(isExternallyReachableHost("")).toBe(false);
    expect(isExternallyReachableHost("localhost")).toBe(false);
    expect(isExternallyReachableHost("127.0.0.1")).toBe(false);
    expect(isExternallyReachableHost("::1")).toBe(false);
  });

  it("treats wildcard and named interfaces as externally reachable", () => {
    expect(isExternallyReachableHost("0.0.0.0")).toBe(true);
    expect(isExternallyReachableHost("::")).toBe(true);
    expect(isExternallyReachableHost("192.168.1.8")).toBe(true);
  });
});
