import "../search-results.css";

import type {
  DivergenceReport,
  ProviderSearchResult,
  SearchCitation,
} from "@updated/search";
import {
  citationAgeLabel,
  classifySource,
  computePrimaryRate,
  formatAgeStrip,
  sourceClassChipLabel,
  sourceClassDisplayLabel,
} from "@updated/search";
import type React from "react";

export interface SearchResultsProps {
  query: string;
  contested: boolean;
  divergence: DivergenceReport;
  results: ProviderSearchResult[];
}

function claimTextForCitation(citation: SearchCitation): string {
  return citation.snippet?.trim() || citation.title.trim() || citation.url;
}

function SearchClaimCard({
  citation,
}: {
  citation: SearchCitation;
}): React.JSX.Element {
  const sourceClass = classifySource(citation);
  const age = citationAgeLabel(citation);

  return (
    <article
      className={`updated-search-card${sourceClass === "primary" ? " is-primary" : ""}`}
    >
      <div
        className={`updated-search-card-chip${sourceClass === "primary" ? " is-primary" : ""}`}
      >
        {sourceClassChipLabel(sourceClass)}
      </div>
      <p className="updated-search-card-claim">
        {claimTextForCitation(citation)}
      </p>
      <div className="updated-search-card-strip">
        <span>1 source</span>
        <span aria-hidden="true">·</span>
        <span>{age}</span>
        <span aria-hidden="true">·</span>
        <span>{sourceClassDisplayLabel(sourceClass)}</span>
      </div>
      <div className="updated-search-card-sources">
        <button
          type="button"
          className="updated-search-source-link"
          onClick={() => void window.api.openExternal(citation.url)}
        >
          {citation.domain}
        </button>
      </div>
    </article>
  );
}

function DivergenceBanner({
  contested,
  divergence,
}: {
  contested: boolean;
  divergence: DivergenceReport;
}): React.JSX.Element {
  return (
    <section className="updated-search-divergence" aria-live="polite">
      {contested ? (
        <p className="updated-search-contested">CONTESTED</p>
      ) : divergence.pairScores.length === 0 ? (
        <p className="updated-search-agreement">
          Corroboration unassessed
        </p>
      ) : (
        <p className="updated-search-agreement">Providers agree</p>
      )}
      <p className="updated-search-divergence-summary">
        Minimum pairwise similarity:{" "}
        {divergence.minSimilarity === null
          ? "n/a"
          : divergence.minSimilarity.toFixed(2)}{" "}
        (threshold {divergence.threshold.toFixed(2)})
      </p>
      {divergence.pairScores.length > 0 ? (
        <ul className="updated-search-pair-scores">
          {divergence.pairScores.map((pair) => (
            <li key={`${pair.providerA}-${pair.providerB}`}>
              {pair.providerA} ↔ {pair.providerB}: {pair.jaccard.toFixed(2)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ProviderResultsSection({
  query,
  result,
}: {
  query: string;
  result: ProviderSearchResult;
}): React.JSX.Element {
  const { answer, providerId } = result;
  const primaryRate = computePrimaryRate(answer.citations);
  const ageStrip = formatAgeStrip(answer.citations);

  return (
    <section className="updated-search-provider">
      <header className="updated-search-header">
        <p className="updated-search-provider-label">Provider {providerId}</p>
        <p className="updated-search-primary-rate">
          Primary-source rate: {primaryRate.rateText}
        </p>
        {!primaryRate.hasPrimary ? (
          <p className="updated-search-no-primary">No primary sources found.</p>
        ) : null}
        <div className="updated-search-age-strip">
          <span className="updated-search-age-item">
            <span>Oldest</span>
            <span>{ageStrip.oldest}</span>
          </span>
          <span className="updated-search-age-item">
            <span>Newest</span>
            <span>{ageStrip.newest}</span>
          </span>
        </div>
        {answer.latencyMs !== undefined ? (
          <p className="updated-search-meta">{answer.latencyMs} ms</p>
        ) : null}
      </header>

      {answer.answer.trim() ? (
        <article className="updated-search-card is-summary">
          <div className="updated-search-card-chip">SUMMARY</div>
          <p className="updated-search-card-claim">{answer.answer.trim()}</p>
          <div className="updated-search-card-strip">
            <span>
              {answer.citations.length}{" "}
              {answer.citations.length === 1 ? "source" : "sources"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{ageStrip.oldest}</span>
            <span aria-hidden="true">·</span>
            <span>query: {query.trim()}</span>
          </div>
        </article>
      ) : null}

      <div className="updated-search-cards">
        {answer.citations.map((citation) => (
          <SearchClaimCard
            key={`${providerId}-${citation.url}`}
            citation={citation}
          />
        ))}
      </div>
    </section>
  );
}

export function SearchResults({
  query,
  contested,
  divergence,
  results,
}: SearchResultsProps): React.JSX.Element {
  return (
    <div className="updated-search">
      <DivergenceBanner contested={contested} divergence={divergence} />
      {results.map((result) => (
        <ProviderResultsSection
          key={result.providerId}
          query={query}
          result={result}
        />
      ))}
    </div>
  );
}
