"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icons } from "../../components/icons";
import { ENTITY_META } from "../../components/search/SearchPanel";
import { TYPE_GROUP, TYPE_LABEL, type RankedHit, type Source } from "../../../lib/portal-search/query";
import type { EntityType } from "../../../lib/search/useGlobalSearch";
import styles from "./search.module.css";

const SUGGESTIONS = [
  "When is the next tournament?",
  "What's the plan for game day?",
  "Who do I talk to about uniforms?",
  "Where do the teams practice?",
];

const TOPICS: Array<{ title: string; blurb: string; q: string; icon: EntityType }> = [
  { title: "Events", blurb: "Games, tournaments and club dates", q: "upcoming events and tournaments", icon: "event" },
  { title: "Playbooks", blurb: "How the club does things, step by step", q: "playbook", icon: "playbook" },
  { title: "Families", blurb: "Players and parents in the directory", q: "parent contact", icon: "member" },
  { title: "Tasks & projects", blurb: "What needs doing, and who's on it", q: "open tasks and projects", icon: "maintenance" },
  { title: "Slack conversations", blurb: "What's been said in the club's channels", q: "practice schedule", icon: "slack" },
  { title: "Facilities", blurb: "The gym, equipment and upkeep", q: "gym equipment", icon: "asset" },
];

type State =
  | { phase: "idle" }
  | {
      phase: "searching" | "answering" | "done";
      q: string;
      results: RankedHit[] | null;
      sources: Source[];
      answer: string;
      answering: boolean;
      error?: string;
    };

function searching(q: string): State {
  return { phase: "searching", q, results: null, sources: [], answer: "", answering: true };
}

export function PortalSearch({ initialQuery }: { initialQuery: string }) {
  const [input, setInput] = useState(initialQuery);
  const [state, setState] = useState<State>(() => (initialQuery ? searching(initialQuery) : { phase: "idle" }));
  const abortRef = useRef<AbortController | null>(null);

  // Streams one search into state: the matching records first, then the AI
  // answer a piece at a time. Only touches state once the response arrives,
  // and ignores anything for a question that has since been replaced.
  const fetchSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/portal-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line) as
            | { type: "results"; results: RankedHit[]; sources: Source[]; answering: boolean }
            | { type: "text"; delta: string }
            | { type: "done" };
          setState((s) => {
            if (s.phase === "idle" || s.q !== q) return s;
            if (msg.type === "results") {
              return { ...s, phase: msg.answering ? "answering" : "done", results: msg.results, sources: msg.sources, answering: msg.answering };
            }
            if (msg.type === "text") return { ...s, answer: s.answer + msg.delta };
            return { ...s, phase: "done" };
          });
        }
      }
      setState((s) => (s.phase !== "idle" && s.q === q ? { ...s, phase: "done" } : s));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error(err);
      setState((s) =>
        s.phase !== "idle" && s.q === q
          ? { ...s, phase: "done", results: s.results ?? [], answering: false, error: "Search isn’t working right now. Please try again in a moment." }
          : s,
      );
    }
  }, []);

  const run = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) {
        abortRef.current?.abort();
        setState({ phase: "idle" });
        return;
      }
      setState(searching(q));
      fetchSearch(q);
    },
    [fetchSearch],
  );

  // Search on arrival when the link carries ?q= (state already starts out
  // "searching" for it), and follow Back/Forward.
  useEffect(() => {
    // fetchSearch only sets state after its fetch resolves, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialQuery) fetchSearch(initialQuery);
    const onPop = () => {
      const q = new URLSearchParams(window.location.search).get("q") ?? "";
      setInput(q);
      run(q);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      abortRef.current?.abort();
    };
  }, [initialQuery, fetchSearch, run]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setInput(trimmed);
    window.history.pushState(null, "", `/portal/search?q=${encodeURIComponent(trimmed)}`);
    run(trimmed);
  };

  const goHome = () => {
    abortRef.current?.abort();
    setInput("");
    setState({ phase: "idle" });
    window.history.pushState(null, "", "/portal/search");
  };

  return (
    <div className={styles.page}>
      {state.phase === "idle" ? (
        <Home input={input} setInput={setInput} submit={submit} />
      ) : (
        <>
          <div className={styles.resultsBar}>
            <button type="button" className={styles.homeLink} onClick={goHome}>
              <Icons.ChevronLeft width={16} height={16} /> Search home
            </button>
            <SearchBox compact value={input} onChange={setInput} onSubmit={submit} />
          </div>
          <Results key={state.q} state={state} submit={submit} />
        </>
      )}
    </div>
  );
}

function Home({ input, setInput, submit }: { input: string; setInput: (v: string) => void; submit: (q: string) => void }) {
  return (
    <>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Omaha Lightning member portal</p>
        <h1 className={styles.heroTitle}>How can we help you today?</h1>
        <p className={styles.heroLede}>
          Ask a question in your own words. Answers come only from what you can see in the portal, with links to each
          record they came from.
        </p>
        <SearchBox value={input} onChange={setInput} onSubmit={submit} autoFocus />
        <div className={styles.chips} aria-label="Suggested questions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className={styles.chip} onClick={() => submit(s)}>
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.topics} aria-labelledby="topics-heading">
        <h2 id="topics-heading" className={styles.sectionTitle}>
          Popular topics
        </h2>
        <div className={styles.topicGrid}>
          {TOPICS.map((t) => {
            const Icon = ENTITY_META[t.icon].icon;
            return (
              <button key={t.title} type="button" className={styles.topic} onClick={() => submit(t.q)}>
                <span className={styles.topicIcon}>
                  <Icon width={20} height={20} />
                </span>
                <span className={styles.topicText}>
                  <span className={styles.topicTitle}>{t.title}</span>
                  <span className={styles.topicBlurb}>{t.blurb}</span>
                </span>
                <Icons.ArrowRight width={18} height={18} />
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Results({ state, submit }: { state: Exclude<State, { phase: "idle" }>; submit: (q: string) => void }) {
  const { q, results, sources, answer, answering, phase, error } = state;
  const [filter, setFilter] = useState<EntityType | "all">("all");
  const streaming = phase === "searching" || phase === "answering";
  const cited = citedNumbers(answer);
  const sourceFor = (n: number) => sources.find((s) => s.n === n);
  // Show the sources the answer cites, in citation order; before it cites
  // any, the records it's reading from.
  const shown = (cited.length ? cited.map(sourceFor).filter((s): s is Source => !!s) : sources).slice(0, 6);

  const counts = new Map<EntityType, number>();
  for (const r of results ?? []) counts.set(r.entity_type, (counts.get(r.entity_type) ?? 0) + 1);
  const activeFilter = filter !== "all" && counts.has(filter) ? filter : "all";
  const listed = (results ?? []).filter((r) => activeFilter === "all" || r.entity_type === activeFilter);

  return (
    <div className={styles.results}>
      <h1 className={styles.question}>{q}</h1>

      {error && <p className={styles.error}>{error}</p>}

      {(answering || answer) && (
        <section className={styles.answerCard} aria-live="polite" aria-busy={streaming}>
          <div className={styles.answerHead}>
            <span className={styles.answerBadge}>
              <Icons.Sparkles width={14} height={14} /> AI answer
            </span>
            <span className={styles.answerNote}>From records you can see in the portal</span>
          </div>
          {answer ? (
            <div className={`${styles.answer} ${streaming ? styles.answerStreaming : ""}`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a({ href, children }) {
                    const n = href?.startsWith("#cite-") ? Number(href.slice(6)) : NaN;
                    const src = Number.isFinite(n) ? sourceFor(n) : undefined;
                    if (!src) return <>{children}</>;
                    return (
                      <Link href={src.href} className={styles.cite} title={src.title}>
                        {n}
                      </Link>
                    );
                  },
                }}
              >
                {linkCitations(answer)}
              </ReactMarkdown>
            </div>
          ) : phase === "done" ? (
            <p className={styles.answerEmpty}>
              We couldn’t write a summary this time. The records below are the best matches for your question.
            </p>
          ) : (
            <div className={styles.skeleton} aria-label="Writing an answer">
              <span />
              <span />
              <span />
            </div>
          )}
          {shown.length > 0 && (answer || streaming) && (
            <div className={styles.sources}>
              <p className={styles.sourcesLabel}>Sources</p>
              <ol className={styles.sourceList}>
                {shown.map((s) => (
                  <li key={s.n}>
                    <Link href={s.href} className={styles.source}>
                      <span className={styles.sourceNum}>{s.n}</span>
                      <span className={styles.sourceText}>
                        <span className={styles.sourceTitle}>{s.title}</span>
                        <span className={styles.sourceType}>{TYPE_LABEL[s.entity_type]}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {phase === "done" && answer && (
            <p className={styles.disclaimer}>AI can make mistakes. Open the source record before you act on it.</p>
          )}
        </section>
      )}

      <section aria-labelledby="records-heading">
        <h2 id="records-heading" className={styles.sectionTitle}>
          In the portal
        </h2>
        {results && counts.size > 1 && (
          <div className={styles.filters} role="group" aria-label="Show only">
            <button
              type="button"
              className={`${styles.filter} ${activeFilter === "all" ? styles.filterOn : ""}`}
              aria-pressed={activeFilter === "all"}
              onClick={() => setFilter("all")}
            >
              All <span>{results.length}</span>
            </button>
            {[...counts].map(([type, n]) => (
              <button
                key={type}
                type="button"
                className={`${styles.filter} ${activeFilter === type ? styles.filterOn : ""}`}
                aria-pressed={activeFilter === type}
                onClick={() => setFilter(type)}
              >
                {TYPE_GROUP[type]} <span>{n}</span>
              </button>
            ))}
          </div>
        )}
        {results === null ? (
          <div className={styles.skeleton}>
            <span />
            <span />
          </div>
        ) : results.length === 0 ? (
          <div className={styles.noResults}>
            <p>
              Nothing in the portal matched <strong>“{q}”</strong>. Try different words, or one of these:
            </p>
            <div className={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className={styles.chip} onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className={styles.resultList}>
            {listed.map((r) => {
              const Icon = ENTITY_META[r.entity_type].icon;
              return (
                <li key={`${r.entity_type}:${r.id}`}>
                  <Link href={r.href} className={styles.result}>
                    <span className={styles.resultIcon}>
                      <Icon width={18} height={18} />
                    </span>
                    <span className={styles.resultText}>
                      <span className={styles.resultType}>{TYPE_LABEL[r.entity_type]}</span>
                      <span className={styles.resultTitle}>{r.title}</span>
                      {r.subtitle && <span className={styles.resultSub}>{r.subtitle}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  onSubmit,
  compact,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (q: string) => void;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const handle = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };
  return (
    <form role="search" className={`${styles.searchBox} ${compact ? styles.searchBoxCompact : ""}`} onSubmit={handle}>
      <Icons.Search width={20} height={20} />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={compact ? "Ask another question" : "Ask a question or search"}
        aria-label="Search the portal"
        maxLength={200}
        autoComplete="off"
        enterKeyHint="search"
        autoFocus={autoFocus}
      />
      <button type="submit" className={styles.searchSubmit} aria-label="Search" disabled={!value.trim()}>
        <Icons.ArrowRight width={20} height={20} />
      </button>
    </form>
  );
}

// "[1]" / "[2][3]" citations in the answer become links the renderer turns
// into numbered chips.
function linkCitations(text: string): string {
  return text.replace(/\[(\d{1,2})\](?!\()/g, "[$1](#cite-$1)");
}

function citedNumbers(text: string): number[] {
  const seen: number[] = [];
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}
