import { SearchResults } from "@renderer/components/search-results";
import {
  clearSearchQueryHistory,
  fetchSearchQueryHistory,
  runSearchQuery,
} from "@renderer/lib/search";
import {
  DIVERGENCE_CONTESTED_JACCARD_THRESHOLD,
  type DivergenceReport,
  type InputMode,
  type ProviderSearchResult,
  type SearchQueryHistoryEntry,
} from "@updated/search";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

const EMPTY_DIVERGENCE: DivergenceReport = {
  contested: false,
  threshold: DIVERGENCE_CONTESTED_JACCARD_THRESHOLD,
  minSimilarity: null,
  pairScores: [],
};

export interface SearchTabProps {
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  /** Voice-dictated query pushed from companion when input mode is search. */
  externalQuery?: string | null;
  onExternalQueryHandled?: () => void;
}

interface SearchState {
  query: string;
  contested: boolean;
  divergence: DivergenceReport;
  results: ProviderSearchResult[];
  error?: string;
}

function formatHistoryWhen(searchedAt: string): string {
  const parsed = Date.parse(searchedAt);
  if (Number.isNaN(parsed)) return searchedAt;
  return new Date(parsed).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SearchHistoryList({
  entries,
  loading,
  onSelect,
  onClear,
}: {
  entries: SearchQueryHistoryEntry[];
  loading: boolean;
  onSelect: (query: string) => void;
  onClear: () => void;
}): React.JSX.Element | null {
  if (entries.length === 0) return null;

  return (
    <section className="updated-search-history" aria-label="Recent searches">
      <div className="updated-search-history-head">
        <h3 className="updated-search-history-title">Recent</h3>
        <button
          type="button"
          className="updated-search-history-clear"
          onClick={onClear}
          disabled={loading}
        >
          Clear
        </button>
      </div>
      <ul className="updated-search-history-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="updated-search-history-item"
              disabled={loading}
              onClick={() => onSelect(entry.query)}
            >
              <span className="updated-search-history-query">
                {entry.query}
              </span>
              <span className="updated-search-history-meta">
                {entry.contested
                  ? "CONTESTED"
                  : entry.providerCount > 1
                    ? "agree"
                    : "unassessed"}{" "}
                · primary {entry.primaryRateText} ·{" "}
                {formatHistoryWhen(entry.searchedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SearchTab({
  inputMode,
  onInputModeChange,
  externalQuery,
  onExternalQueryHandled,
}: SearchTabProps): React.JSX.Element {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<SearchState | null>(null);
  const [history, setHistory] = useState<SearchQueryHistoryEntry[]>([]);

  const refreshHistory = useCallback((): void => {
    void fetchSearchQueryHistory()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const executeSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setDraft(trimmed);
      setLoading(true);
      setState({
        query: trimmed,
        contested: false,
        divergence: EMPTY_DIVERGENCE,
        results: [],
      });
      try {
        const result = await runSearchQuery(trimmed);
        if (!result.ok) {
          setState({
            query: trimmed,
            contested: false,
            divergence: EMPTY_DIVERGENCE,
            results: [],
            error: result.error,
          });
          return;
        }
        setState({
          query: trimmed,
          contested: result.contested,
          divergence: result.divergence,
          results: result.results,
        });
        refreshHistory();
      } catch (err) {
        setState({
          query: trimmed,
          contested: false,
          divergence: EMPTY_DIVERGENCE,
          results: [],
          error: err instanceof Error ? err.message : "Search failed",
        });
      } finally {
        setLoading(false);
      }
    },
    [refreshHistory],
  );

  useEffect(() => {
    if (!externalQuery?.trim()) return;
    void executeSearch(externalQuery).finally(() => {
      onExternalQueryHandled?.();
    });
  }, [externalQuery, executeSearch, onExternalQueryHandled]);

  const clearHistory = (): void => {
    void clearSearchQueryHistory().then(() => {
      setHistory([]);
    });
  };

  return (
    <div className="updated-search">
      <div className="updated-search-mode">
        <span>Input mode</span>
        <button
          type="button"
          className={`updated-search-mode-toggle${inputMode === "dictation" ? " is-active" : ""}`}
          onClick={() => onInputModeChange("dictation")}
        >
          Dictation
        </button>
        <button
          type="button"
          className={`updated-search-mode-toggle${inputMode === "search" ? " is-active" : ""}`}
          onClick={() => onInputModeChange("search")}
        >
          Search
        </button>
      </div>

      <form
        className="updated-search-query-form"
        onSubmit={(event) => {
          event.preventDefault();
          void executeSearch(draft);
        }}
      >
        <input
          className="updated-search-input"
          value={draft}
          placeholder="Type a query"
          onChange={(event) => setDraft(event.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="updated-search-submit"
          disabled={loading || !draft.trim()}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <SearchHistoryList
        entries={history}
        loading={loading}
        onSelect={(query) => void executeSearch(query)}
        onClear={clearHistory}
      />

      {loading ? <p className="updated-search-status">Searching…</p> : null}

      {state?.error ? (
        <p className="updated-search-status updated-search-error">
          {state.error}
        </p>
      ) : null}

      {state && state.results.length > 0 ? (
        <SearchResults
          query={state.query}
          contested={state.contested}
          divergence={state.divergence}
          results={state.results}
        />
      ) : !loading && !state?.error ? (
        <p className="updated-search-status">
          Hold the hotkey in search mode to dictate a query, or type above.
          Demo providers are available only in local development or explicit
          mock mode.
        </p>
      ) : null}
    </div>
  );
}
