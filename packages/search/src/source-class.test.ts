import { describe, expect, it } from "vitest";
import {
  classifySource,
  sourceClassChipLabel,
  sourceClassDisplayLabel,
} from "./source-class.js";

describe("classifySource", () => {
  it("classifies government and registry hosts as primary", () => {
    expect(classifySource("https://www.gov.uk/guidance")).toBe("primary");
    expect(classifySource("companieshouse.gov.uk")).toBe("primary");
    expect(classifySource("supremecourt.gov")).toBe("primary");
    expect(classifySource("fca.org.uk")).toBe("primary");
  });

  it("classifies EU official hosts as primary", () => {
    expect(classifySource("ec.europa.eu")).toBe("primary");
    expect(classifySource("eur-lex.europa.eu")).toBe("primary");
  });

  it("classifies wikipedia and equivalents as encyclopedic", () => {
    expect(classifySource("en.wikipedia.org")).toBe("encyclopedic");
    expect(classifySource("britannica.com")).toBe("encyclopedic");
    expect(classifySource("wikidata.org")).toBe("encyclopedic");
  });

  it("classifies news organisations as press", () => {
    expect(classifySource("www.nytimes.com")).toBe("press");
    expect(classifySource("bbc.co.uk")).toBe("press");
    expect(classifySource("reuters.com")).toBe("press");
    expect(classifySource("ft.com")).toBe("press");
  });

  it("classifies law firms and consultancies as professional", () => {
    expect(classifySource("www.pwc.com")).toBe("professional");
    expect(classifySource("cliffordchance.com")).toBe("professional");
    expect(classifySource("legal.example.attorney")).toBe("professional");
  });

  it("classifies vendors as commercial", () => {
    expect(classifySource("aws.amazon.com")).toBe("commercial");
    expect(classifySource("shop.example.com")).toBe("commercial");
    expect(classifySource("stripe.com/pricing")).toBe("commercial");
  });

  it("classifies forums and reddit as community", () => {
    expect(classifySource("reddit.com")).toBe("community");
    expect(classifySource("stackoverflow.com")).toBe("community");
    expect(classifySource("discourse.example.org")).toBe("community");
  });

  it("returns unknown for unclassified hosts", () => {
    expect(classifySource("example.com")).toBe("unknown");
    expect(classifySource("official-example.com")).toBe("unknown");
    expect(classifySource("registry.example.gazette")).toBe("unknown");
    expect(classifySource("")).toBe("unknown");
  });

  it("accepts SearchCitation objects", () => {
    expect(
      classifySource({
        url: "https://legislation.gov.uk/",
        title: "Legislation",
        domain: "legislation.gov.uk",
      }),
    ).toBe("primary");
  });
});

describe("sourceClassChipLabel", () => {
  it("returns uppercase chip labels", () => {
    expect(sourceClassChipLabel("primary")).toBe("PRIMARY");
    expect(sourceClassChipLabel("press")).toBe("PRESS");
  });
});

describe("sourceClassDisplayLabel", () => {
  it("returns sentence-case metadata labels", () => {
    expect(sourceClassDisplayLabel("primary")).toBe("primary source");
    expect(sourceClassDisplayLabel("unknown")).toBe("unknown");
  });
});
