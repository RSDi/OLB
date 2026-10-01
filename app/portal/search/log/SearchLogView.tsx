// The Search log page's view (/portal/search/log): the period's totals and
// cost, the questions the assistant couldn't answer (the gaps worth a
// playbook), and each question with the lookups it made and the records it
// cited. Filters are links and a plain GET form, so it needs no client code.

import Link from "next/link";
import { Icons } from "../../../components/icons";
import { KpiCard } from "../../../components/ui";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import {
  citedHref,
  costOf,
  gaps,
  matchesFilter,
  OUTCOME_LABEL,
  outcomeOf,
  summarize,
  type LogFilter,
  type LogRow,
  type Outcome,
} from "../../../../lib/portal-search/log-stats";
import { stepLabel, TYPE_LABEL, type SourceType } from "../../../../lib/portal-search/query";
import styles from "./log.module.css";

export const PERIODS = [7, 30, 90] as const;
export const FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "no_answer", label: "Couldn't answer" },
  { id: "clarified", label: "Asked which one" },
  { id: "problems", label: "Errors & limits" },
];
const SHOWN = 200;

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ,
});
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: CHURCH_TZ });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function money(dollars: number): string {
  if (dollars === 0) return "$0";
  if (dollars < 0.995) return `${Math.max(1, Math.round(dollars * 100))}¢`;
  return `$${dollars.toFixed(2)}`;
}

const TONE: Record<Outcome, string> = {
  answered: styles.toneOk,
  no_answer: styles.toneWarn,
  clarified: styles.toneMute,
  limited: styles.toneMute,
  failed: styles.toneBad,
};

export function SearchLogView({
  rows,
  error,
  days,
  filter,
  text,
}: {
  rows: LogRow[];
  error: string | null;
  days: number;
  filter: LogFilter;
  text: string;
}) {
  const href = (over: { days?: number; show?: LogFilter; q?: string }) => {
    const u = new URLSearchParams();
    const d = over.days ?? days;
    const s = over.show ?? filter;
    const t = over.q ?? text;
    if (d !== 30) u.set("days", String(d));
    if (s !== "all") u.set("show", s);
    if (t) u.set("q", t);
    const qs = u.toString();
    return `/portal/search/log${qs ? `?${qs}` : ""}`;
  };

  const summary = summarize(rows);
  const missing = gaps(rows);
  const listed = rows.filter((r) => matchesFilter(r, filter, text));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Search log</h1>
          <p className={styles.lede}>
            Every question asked on the <Link href="/portal/search">Search page</Link> in the last {days} days, and
            what became of it. Only super-admins can see this.
          </p>
        </div>
        <nav className={styles.periods} aria-label="Period">
          {PERIODS.map((d) => (
            <Link key={d} href={href({ days: d })} className={d === days ? styles.periodOn : styles.period} aria-current={d === days ? "page" : undefined}>
              {d} days
            </Link>
          ))}
        </nav>
      </header>

      {error ? (
        <div className={styles.notice}>
          Couldn&rsquo;t read the log: {error}. If migration 0112 (search_log) hasn&rsquo;t been applied in
          Supabase yet, that&rsquo;s why; questions start being logged once it is.
        </div>
      ) : (
        <>
          <div className={styles.kpis}>
            <KpiCard
              label="Questions"
              value={summary.questions}
              sub={`${summary.people} ${summary.people === 1 ? "person" : "people"} · ${plural(summary.followUps, "follow-up")}`}
            />
            <KpiCard
              label="Answered with sources"
              value={summary.answeredRate == null ? "–" : `${Math.round(summary.answeredRate * 100)}%`}
              sub={`${summary.byOutcome.answered} of ${summary.questions - summary.byOutcome.limited}`}
              accent
            />
            <KpiCard
              label="Couldn't answer"
              value={summary.byOutcome.no_answer}
              sub={`${summary.byOutcome.clarified} asked which one · ${plural(summary.byOutcome.failed + summary.byOutcome.limited, "error")}`}
              href={href({ show: "no_answer" })}
            />
            <KpiCard
              label="AI cost (estimate)"
              value={money(summary.cost)}
              sub={summary.costedQuestions ? `about ${money(summary.cost / summary.costedQuestions)} a question` : "no answers yet"}
            />
            <KpiCard label="Average time" value={summary.avgSeconds == null ? "–" : `${summary.avgSeconds.toFixed(1)}s`} sub="question to finished answer" />
          </div>

          {missing.length > 0 && (
            <section className={`rsd-card ${styles.gaps}`} aria-labelledby="gaps-heading">
              <h2 id="gaps-heading" className={styles.sectionTitle}>
                Questions it couldn&rsquo;t answer
              </h2>
              <p className={styles.muted}>
                Nothing the asker could see answered these. Each is worth a playbook, an event, or an update to a
                record. Tap one to try it again.
              </p>
              <ol className={styles.gapList}>
                {missing.map((g) => (
                  <li key={g.question}>
                    <Link href={`/portal/search?q=${encodeURIComponent(g.question)}`}>{g.question}</Link>
                    <span className={styles.muted}>
                      {g.times > 1 ? `${g.times} times, last ` : ""}
                      {DAY.format(new Date(g.last))}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="questions-heading">
            <div className={styles.listHead}>
              <h2 id="questions-heading" className={styles.sectionTitle}>
                Questions
              </h2>
              <form className={styles.searchForm} action="/portal/search/log" method="get">
                {days !== 30 && <input type="hidden" name="days" value={days} />}
                {filter !== "all" && <input type="hidden" name="show" value={filter} />}
                <Icons.Search width={15} height={15} />
                <input name="q" defaultValue={text} placeholder="Find a question or a person" aria-label="Find a question or a person" />
              </form>
            </div>
            <nav className={styles.filters} aria-label="Show">
              {FILTERS.map((f) => (
                <Link key={f.id} href={href({ show: f.id })} className={f.id === filter ? styles.filterOn : styles.filter} aria-current={f.id === filter ? "page" : undefined}>
                  {f.label}
                </Link>
              ))}
              {text && (
                <Link href={href({ q: "" })} className={styles.clear}>
                  Clear “{text}”
                </Link>
              )}
            </nav>

            {listed.length === 0 ? (
              <p className={styles.empty}>{rows.length ? "No questions match." : `No questions in the last ${days} days.`}</p>
            ) : (
              <ol className={styles.rows}>
                {listed.slice(0, SHOWN).map((r) => (
                  <QuestionRow key={r.id} row={r} />
                ))}
              </ol>
            )}
            {listed.length > SHOWN && (
              <p className={styles.muted}>
                Showing the latest {SHOWN} of {listed.length}. Narrow the period or search to see older ones.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function QuestionRow({ row }: { row: LogRow }) {
  const outcome = outcomeOf(row);
  const cost = costOf(row);
  const steps = row.steps ?? [];
  const cited = row.cited ?? [];
  return (
    <li>
      <details className={styles.row}>
        <summary>
          <span className={styles.when}>{WHEN.format(new Date(row.created_at))}</span>
          <span className={styles.question}>
            {row.follow_up && <span className={styles.followUp}>Follow-up</span>}
            {row.question}
          </span>
          <span className={styles.who}>{row.member?.full_name ?? "Former member"}</span>
          <span className={`${styles.tone} ${TONE[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>
        </summary>
        <div className={styles.detail}>
          <div>
            <h3>Lookups</h3>
            {steps.length ? (
              <ol>
                {steps.map((s, i) => (
                  <li key={i}>{stepLabel(s.tool, s.input)}</li>
                ))}
              </ol>
            ) : (
              <p className={styles.muted}>None</p>
            )}
          </div>
          <div>
            <h3>Cited</h3>
            {cited.length ? (
              <ol>
                {cited.map((c, i) => {
                  const to = citedHref(c.type, c.id);
                  const label = TYPE_LABEL[c.type as SourceType] ?? c.type;
                  return (
                    <li key={i}>
                      <span className={styles.muted}>{label}:</span> {to ? <Link href={to}>{c.title}</Link> : c.title}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className={styles.muted}>Nothing ({row.sources} {row.sources === 1 ? "record" : "records"} looked at)</p>
            )}
          </div>
          <dl className={styles.facts}>
            <dt>Time</dt>
            <dd>{row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : "–"}</dd>
            <dt>Tokens</dt>
            <dd>
              {row.input_tokens != null ? `${row.input_tokens.toLocaleString()} in · ${(row.output_tokens ?? 0).toLocaleString()} out` : "–"}
            </dd>
            <dt>Cost</dt>
            <dd>{cost != null ? money(cost) : "–"}</dd>
            {row.model && (
              <>
                <dt>Model</dt>
                <dd>{row.model.replace(/^anthropic\//, "")}</dd>
              </>
            )}
            {row.error && (
              <>
                <dt>Problem</dt>
                <dd>{row.error}</dd>
              </>
            )}
          </dl>
          <Link href={`/portal/search?q=${encodeURIComponent(row.question)}`} className={styles.retry}>
            Ask it again <Icons.ArrowRight width={14} height={14} />
          </Link>
        </div>
      </details>
    </li>
  );
}
