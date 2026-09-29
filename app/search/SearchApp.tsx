"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Poppins } from "next/font/google";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import wordmark from "../(site)/_images/logo-wordmark.png";
import type { SearchResult, Source } from "@/lib/site-search/text";
import styles from "./search.module.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const SUGGESTIONS = [
  "When and where are practices?",
  "How much does the season cost?",
  "What are the summer clinics?",
  "How do I register my son?",
];

const TOPICS: Array<{ title: string; blurb: string; q: string; icon: ReactNode }> = [
  { title: "2026-27 Season", blurb: "Teams, ages and what each program includes", q: "What programs are offered in the 2026-27 season?", icon: <TrophyIcon /> },
  { title: "Summer clinics", blurb: "Dates, ages and cost for summer", q: "When are the summer clinics and what do they cost?", icon: <SunIcon /> },
  { title: "Practice times", blurb: "When and where teams meet", q: "When and where are practices?", icon: <ClockIcon /> },
  { title: "Registration", blurb: "Signing up, waitlists and assessments", q: "How do I register a player?", icon: <ClipboardIcon /> },
  { title: "Coaches", blurb: "Meet the people who lead our teams", q: "Who are the coaches?", icon: <WhistleIcon /> },
  { title: "Our philosophy", blurb: "Why the Lightning plays the way it does", q: "What is Omaha Lightning's philosophy?", icon: <HeartIcon /> },
];

type State =
  | { phase: "idle" }
  | {
      phase: "searching" | "answering" | "done";
      q: string;
      results: SearchResult[] | null;
      sources: Source[];
      answer: string;
      answering: boolean;
      error?: string;
    };

function searching(q: string): State {
  return { phase: "searching", q, results: null, sources: [], answer: "", answering: true };
}

export function SearchApp({ initialQuery }: { initialQuery: string }) {
  const [input, setInput] = useState(initialQuery);
  const [state, setState] = useState<State>(() => (initialQuery ? searching(initialQuery) : { phase: "idle" }));
  const abortRef = useRef<AbortController | null>(null);

  // Streams one search into state: the matching pages first, then the AI
  // answer a piece at a time. Only touches state once the response arrives,
  // and ignores anything for a question that has since been replaced.
  const fetchSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/site-search", {
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
            | { type: "results"; results: SearchResult[]; sources: Source[]; answering: boolean }
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
          ? { ...s, phase: "done", results: s.results ?? [], error: "Search isn’t working right now. Please try again in a moment." }
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
    window.history.pushState(null, "", `/search?q=${encodeURIComponent(trimmed)}`);
    window.scrollTo({ top: 0 });
    run(trimmed);
  };

  const goHome = () => {
    abortRef.current?.abort();
    setInput("");
    setState({ phase: "idle" });
    window.history.pushState(null, "", "/search");
  };

  return (
    <div className={`${poppins.className} ${styles.page}`}>
      <div className={styles.banner}>
        <BoltIcon />
        <span>
          The official website of Omaha Lightning Basketball. <strong>Search preview</strong>
        </span>
      </div>

      <header className={styles.header}>
        <button type="button" className={styles.brand} onClick={goHome} aria-label="Search home">
          <Image src={wordmark} alt="Omaha Lightning" height={44} priority />
        </button>
        {state.phase !== "idle" && (
          <SearchBox compact value={input} onChange={setInput} onSubmit={submit} />
        )}
        <Link href="/" className={styles.backLink}>
          <span>Back to site</span> <ArrowIcon />
        </Link>
      </header>

      <main className={styles.main}>
        {state.phase === "idle" ? (
          <Home input={input} setInput={setInput} submit={submit} />
        ) : (
          <Results state={state} submit={submit} />
        )}
      </main>

      <footer className={styles.footer}>
        <BoltIcon size={20} />
        <p>
          Answers come from pages on omahalightningbasketball.com and are summarized by AI. Always check the
          linked page, or <Link href="/contact">contact us</Link> with questions.
        </p>
      </footer>
    </div>
  );
}

function Home({ input, setInput, submit }: { input: string; setInput: (v: string) => void; submit: (q: string) => void }) {
  return (
    <>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Omaha Lightning Basketball</p>
        <h1 className={styles.heroTitle}>How can we help you today?</h1>
        <p className={styles.heroLede}>
          Ask a question in your own words. Every answer comes from the Lightning website, with links to the pages it
          came from.
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
          {TOPICS.map((t) => (
            <button key={t.title} type="button" className={styles.topic} onClick={() => submit(t.q)}>
              <span className={styles.topicIcon}>{t.icon}</span>
              <span className={styles.topicText}>
                <span className={styles.topicTitle}>{t.title}</span>
                <span className={styles.topicBlurb}>{t.blurb}</span>
              </span>
              <ArrowIcon />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function Results({ state, submit }: { state: Exclude<State, { phase: "idle" }>; submit: (q: string) => void }) {
  const { q, results, sources, answer, answering, phase, error } = state;
  const streaming = phase === "searching" || phase === "answering";
  const cited = citedNumbers(answer);
  const sourceFor = (n: number) => sources.find((s) => s.n === n);
  // Show the sources the answer cites, in citation order; before it cites
  // any, the pages it's reading from.
  const shown = (cited.length ? cited.map(sourceFor).filter((s): s is Source => !!s) : sources).slice(0, 6);

  return (
    <div className={styles.results}>
      <h1 className={styles.question}>{q}</h1>

      {error && <p className={styles.error}>{error}</p>}

      {(answering || answer) && (
        <section className={styles.answerCard} aria-live="polite" aria-busy={streaming}>
          <div className={styles.answerHead}>
            <span className={styles.answerBadge}>
              <SparkIcon /> AI answer
            </span>
            <span className={styles.answerNote}>From pages on this website</span>
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
                      <Link href={src.path} className={styles.cite} title={src.title}>
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
              We couldn’t write a summary this time. The pages below are the best matches for your question.
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
                    <Link href={s.path} className={styles.source}>
                      <span className={styles.sourceNum}>{s.n}</span>
                      <span className={styles.sourceText}>
                        <span className={styles.sourceTitle}>{s.title}</span>
                        <span className={styles.sourcePath}>omahalightningbasketball.com{s.path === "/" ? "" : s.path}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {phase === "done" && answer && (
            <p className={styles.disclaimer}>
              AI can make mistakes. Check the source page before you make plans, and{" "}
              <Link href="/contact">contact us</Link> if something doesn’t look right.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="pages-heading">
        <h2 id="pages-heading" className={styles.sectionTitle}>
          Pages on this site
        </h2>
        {results === null ? (
          <div className={styles.skeleton}>
            <span />
            <span />
          </div>
        ) : results.length === 0 ? (
          <div className={styles.noResults}>
            <p>
              No pages matched <strong>“{q}”</strong>. Try different words, or one of these:
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
            {results.map((r) => (
              <li key={r.path} className={styles.result}>
                <span className={styles.resultPath}>
                  omahalightningbasketball.com{r.path === "/" ? "" : ` › ${r.path.slice(1).replace(/-/g, " ")}`}
                </span>
                <a href={r.href} className={styles.resultTitle}>
                  {r.title}
                  {r.heading && <span className={styles.resultHeading}> — {r.heading}</span>}
                </a>
                <p className={styles.resultSnippet}>
                  {r.snippet.map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
                </p>
              </li>
            ))}
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
      <SearchIcon />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={compact ? "Ask another question" : "Ask a question or search"}
        aria-label="Search the Omaha Lightning website"
        maxLength={200}
        autoComplete="off"
        enterKeyHint="search"
        autoFocus={autoFocus}
      />
      <button type="submit" className={styles.searchSubmit} aria-label="Search" disabled={!value.trim()}>
        <ArrowIcon />
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

// ── Icons ──────────────────────────────────────────────────────────────────

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
function SearchIcon() {
  return <Svg size={22}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
}
function ArrowIcon() {
  return <Svg><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
}
function BoltIcon({ size = 16 }: { size?: number }) {
  return <svg width={(size * 3) / 4} height={size} viewBox="0 0 12 16" aria-hidden="true"><path d="M7 0 0 9h5l-1 7 8-10H7l1-6z" fill="currentColor" /></svg>;
}
function SparkIcon() {
  return <Svg size={16}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></Svg>;
}
function TrophyIcon() {
  return <Svg><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></Svg>;
}
function SunIcon() {
  return <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
}
function ClockIcon() {
  return <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
}
function ClipboardIcon() {
  return <Svg><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></Svg>;
}
function WhistleIcon() {
  return <Svg><circle cx="9" cy="14" r="5" /><path d="M12 10.5 21 7v4l-6 2M9 14h.01" /></Svg>;
}
function HeartIcon() {
  return <Svg><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></Svg>;
}
