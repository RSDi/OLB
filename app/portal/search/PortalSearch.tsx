"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icons } from "../../components/icons";
import { ENTITY_META } from "../../components/search/SearchPanel";
import { TYPE_GROUP, TYPE_LABEL, type RankedHit, type Source, type SourceType } from "../../../lib/portal-search/query";
import styles from "./search.module.css";

const SUGGESTIONS = [
  "When is our next game?",
  "What's the plan for game day?",
  "Who do I talk to about uniforms?",
  "What tasks are assigned to me?",
];

const TOPICS: Array<{ title: string; blurb: string; q: string; icon: SourceType }> = [
  { title: "This weekend", blurb: "Games, practices and club dates", q: "What's on the calendar this weekend?", icon: "event" },
  { title: "My child's team", blurb: "Practice times, coaches and teammates", q: "When and where does my child's team practice?", icon: "team" },
  { title: "Playbooks", blurb: "How the club does things, step by step", q: "Which playbooks cover game day?", icon: "playbook" },
  { title: "Tasks & projects", blurb: "What needs doing, and who's on it", q: "Which tasks are overdue?", icon: "maintenance" },
  { title: "Slack conversations", blurb: "What's been said in the club's channels", q: "What has been said in Slack about practice times lately?", icon: "slack" },
  { title: "Facilities", blurb: "The gym, equipment and upkeep", q: "Who do I contact about the gym?", icon: "asset" },
];

// Icons for every kind of source: the top-bar search's, plus the two only
// the assistant returns.
const ICON: Record<SourceType, (p: { width?: number; height?: number }) => React.ReactElement> = {
  ...Object.fromEntries(Object.entries(ENTITY_META).map(([k, v]) => [k, v.icon])),
  team: Icons.Users,
  schedule: Icons.Calendar,
} as Record<SourceType, (p: { width?: number; height?: number }) => React.ReactElement>;

type Turn = {
  q: string;
  status: "working" | "done";
  steps: string[];
  // Text the assistant wrote before deciding to look more up.
  notes: string[];
  answer: string;
  sources: Source[];
  clarify: { question: string; options: string[] } | null;
  failed: boolean;
  limited: boolean;
  error?: string;
};

type Thread = { turns: Turn[]; results: RankedHit[] | null };

type ServerMessage =
  | { type: "results"; results: RankedHit[] }
  | { type: "step"; label: string }
  | { type: "sources"; sources: Source[] }
  | { type: "text"; delta: string }
  | { type: "retract" }
  | { type: "clarify"; question: string; options: string[] }
  | { type: "failed" }
  | { type: "limited" }
  | { type: "done" };

function newTurn(q: string): Turn {
  return { q, status: "working", steps: [], notes: [], answer: "", sources: [], clarify: null, failed: false, limited: false };
}

function apply(turn: Turn, msg: ServerMessage): Turn {
  switch (msg.type) {
    case "step":
      return { ...turn, steps: [...turn.steps, msg.label] };
    case "sources":
      return { ...turn, sources: msg.sources };
    case "text":
      return { ...turn, answer: turn.answer + msg.delta };
    case "retract":
      return { ...turn, notes: turn.answer.trim() ? [...turn.notes, turn.answer.trim()] : turn.notes, answer: "" };
    case "clarify":
      return { ...turn, clarify: { question: msg.question, options: msg.options } };
    case "failed":
      return { ...turn, failed: true };
    case "limited":
      return { ...turn, limited: true };
    case "done":
      return { ...turn, status: "done" };
    default:
      return turn;
  }
}

// What goes back to the assistant for a follow-up: each earlier question and
// what it said (its answer, or its clarifying question).
function historyOf(turns: Turn[]): Array<{ role: "user" | "assistant"; text: string }> {
  return turns.flatMap((t) => {
    const reply = t.clarify?.question ?? t.answer;
    return reply.trim() ? [{ role: "user" as const, text: t.q }, { role: "assistant" as const, text: reply }] : [];
  });
}

export function PortalSearch({ initialQuery }: { initialQuery: string }) {
  const [input, setInput] = useState(initialQuery);
  const [followUp, setFollowUp] = useState("");
  const [thread, setThread] = useState<Thread | null>(() =>
    initialQuery ? { turns: [newTurn(initialQuery)], results: null } : null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const lastTurnRef = useRef<HTMLElement | null>(null);

  // Streams one turn into the thread. Only touches state once the response
  // arrives, and ignores anything from a request that has been replaced.
  const stream = useCallback(async (q: string, history: ReturnType<typeof historyOf>) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const update = (fn: (t: Thread) => Thread) =>
      setThread((cur) => (cur && abortRef.current === ctrl ? fn(cur) : cur));
    const updateTurn = (fn: (t: Turn) => Turn) =>
      update((t) => ({ ...t, turns: [...t.turns.slice(0, -1), fn(t.turns[t.turns.length - 1])] }));
    try {
      const res = await fetch("/api/portal-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q, history }),
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
          const msg = JSON.parse(line) as ServerMessage;
          if (msg.type === "results") update((t) => ({ ...t, results: msg.results }));
          else updateTurn((turn) => apply(turn, msg));
        }
      }
      updateTurn((turn) => ({ ...turn, status: "done" }));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error(err);
      update((t) => ({ ...t, results: t.results ?? [] }));
      updateTurn((turn) => ({ ...turn, status: "done", error: "Search isn’t working right now. Please try again in a moment." }));
    }
  }, []);

  const startThread = useCallback(
    (raw: string, push = true) => {
      const q = raw.trim();
      if (!q) {
        abortRef.current?.abort();
        setThread(null);
        return;
      }
      setInput(q);
      setFollowUp("");
      if (push) window.history.pushState(null, "", `/portal/search?q=${encodeURIComponent(q)}`);
      setThread({ turns: [newTurn(q)], results: null });
      stream(q, []);
    },
    [stream],
  );

  const askFollowUp = (raw: string) => {
    const q = raw.trim();
    if (!q || !thread) return;
    setFollowUp("");
    const history = historyOf(thread.turns);
    setThread({ turns: [...thread.turns, newTurn(q)], results: null });
    stream(q, history);
  };

  // Search on arrival when the link carries ?q= (the thread already starts
  // out with that question), and follow Back/Forward.
  useEffect(() => {
    if (initialQuery) stream(initialQuery, []);
    const onPop = () => {
      const q = new URLSearchParams(window.location.search).get("q") ?? "";
      setInput(q);
      startThread(q, false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      abortRef.current?.abort();
    };
  }, [initialQuery, stream, startThread]);

  // Bring a new follow-up into view.
  const turnCount = thread?.turns.length ?? 0;
  useEffect(() => {
    if (turnCount > 1) lastTurnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [turnCount]);

  const goHome = () => {
    abortRef.current?.abort();
    setInput("");
    setThread(null);
    window.history.pushState(null, "", "/portal/search");
  };

  if (!thread) {
    return (
      <div className={styles.page}>
        <Home input={input} setInput={setInput} submit={(q) => startThread(q)} />
      </div>
    );
  }

  const last = thread.turns[thread.turns.length - 1];
  return (
    <div className={styles.page}>
      <div className={styles.resultsBar}>
        <button type="button" className={styles.homeLink} onClick={goHome}>
          <Icons.ChevronLeft width={16} height={16} /> Search home
        </button>
        <SearchBox compact value={input} onChange={setInput} onSubmit={(q) => startThread(q)} placeholder="Start a new search" />
      </div>

      <div className={styles.results}>
        {thread.turns.map((turn, i) => (
          <TurnView
            key={i}
            turn={turn}
            first={i === 0}
            isLast={i === thread.turns.length - 1}
            ref={i === thread.turns.length - 1 ? lastTurnRef : undefined}
            onOption={askFollowUp}
          />
        ))}

        {last.status === "done" && !last.error && (
          <div className={styles.followUp}>
            <SearchBox compact value={followUp} onChange={setFollowUp} onSubmit={askFollowUp} placeholder="Ask a follow-up" />
          </div>
        )}

        <Records key={turnCount} q={last.q} results={thread.results} submit={(q) => startThread(q)} />
      </div>
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
        <SearchBox value={input} onChange={setInput} onSubmit={submit} autoFocus placeholder="Ask a question or search" />
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
            const Icon = ICON[t.icon];
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

function TurnView({
  turn,
  first,
  isLast,
  ref,
  onOption,
}: {
  turn: Turn;
  first: boolean;
  isLast: boolean;
  ref?: React.Ref<HTMLElement>;
  onOption: (q: string) => void;
}) {
  const { q, status, steps, notes, answer, sources, clarify, failed, limited, error } = turn;
  const working = status === "working";
  const cited = citedNumbers(answer);
  const sourceFor = (n: number) => sources.find((s) => s.n === n);
  // The sources the answer cites, in citation order; before it cites any,
  // the records it's reading from.
  const shown = (cited.length ? cited.map(sourceFor).filter((s): s is Source => !!s) : sources).slice(0, 6);
  const Heading = first ? "h1" : "h2";
  const lookups = steps.length + notes.length;

  return (
    <section ref={ref} className={first ? styles.turn : `${styles.turn} ${styles.turnFollowUp}`} aria-busy={working}>
      <Heading className={first ? styles.question : styles.followUpQuestion}>{q}</Heading>

      {error && <p className={styles.error}>{error}</p>}

      {limited ? (
        <p className={styles.answerEmpty}>
          You’ve asked a lot of questions in the last minute, so this time there’s no AI answer. The records below are
          the best matches.
        </p>
      ) : (
        !error && (
          <div className={styles.answerCard} aria-live="polite">
            <div className={styles.answerHead}>
              <span className={styles.answerBadge}>
                <Icons.Sparkles width={14} height={14} /> AI answer
              </span>
              <span className={styles.answerNote}>From records you can see in the portal</span>
            </div>

            {lookups > 0 &&
              (working ? (
                <ol className={styles.steps}>
                  {steps.map((s, i) => (
                    <li key={i} className={i === steps.length - 1 && !answer ? styles.stepActive : styles.step}>
                      {s}
                    </li>
                  ))}
                </ol>
              ) : (
                <details className={styles.stepsDone}>
                  <summary>
                    Looked in {steps.length} {steps.length === 1 ? "place" : "places"}
                  </summary>
                  <ol className={styles.steps}>
                    {steps.map((s, i) => (
                      <li key={i} className={styles.step}>
                        {s}
                      </li>
                    ))}
                    {notes.map((n, i) => (
                      <li key={`n${i}`} className={styles.stepNote}>
                        {n}
                      </li>
                    ))}
                  </ol>
                </details>
              ))}

            {clarify ? (
              <div className={styles.clarify}>
                <p>{clarify.question}</p>
                {isLast && (
                  <div className={styles.clarifyOptions}>
                    {clarify.options.map((o) => (
                      <button key={o} type="button" className={styles.chip} onClick={() => onOption(o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : answer ? (
              <div className={`${styles.answer} ${working ? styles.answerStreaming : ""}`}>
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
            ) : !working || failed ? (
              <p className={styles.answerEmpty}>
                We couldn’t write an answer this time. The records below are the best matches for your question.
              </p>
            ) : (
              lookups === 0 && (
                <div className={styles.skeleton} aria-label="Working on an answer">
                  <span />
                  <span />
                  <span />
                </div>
              )
            )}

            {shown.length > 0 && (answer || working) && !clarify && (
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
            {!working && answer && (
              <p className={styles.disclaimer}>AI can make mistakes. Open the source record before you act on it.</p>
            )}
          </div>
        )
      )}
    </section>
  );
}

function Records({ q, results, submit }: { q: string; results: RankedHit[] | null; submit: (q: string) => void }) {
  const [filter, setFilter] = useState<SourceType | "all">("all");
  const counts = new Map<SourceType, number>();
  for (const r of results ?? []) counts.set(r.entity_type, (counts.get(r.entity_type) ?? 0) + 1);
  const activeFilter = filter !== "all" && counts.has(filter) ? filter : "all";
  const listed = (results ?? []).filter((r) => activeFilter === "all" || r.entity_type === activeFilter);

  return (
    <section aria-labelledby="records-heading" className={styles.records}>
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
            const Icon = ICON[r.entity_type];
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
  );
}

function SearchBox({
  value,
  onChange,
  onSubmit,
  compact,
  autoFocus,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (q: string) => void;
  compact?: boolean;
  autoFocus?: boolean;
  placeholder: string;
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
        placeholder={placeholder}
        aria-label={placeholder}
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
  return text.replace(/\[(\d{1,3})\](?!\()/g, "[$1](#cite-$1)");
}

function citedNumbers(text: string): number[] {
  const seen: number[] = [];
  for (const m of text.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}
