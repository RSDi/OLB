import { Fragment, type ReactNode } from "react";
import { emojify } from "../../../../lib/slack-archive/emoji";
import { parseSlackText, type SlackLine, type SlackRun } from "../../../../lib/slack-archive/mrkdwn";

// An archived message's text, laid out the way Slack shows it: bold, line
// breaks, bullet lists, quotes and code (lib/slack-archive/mrkdwn.ts has the
// rules). `text` is message_text after decodeSlackEntities. Styles are the
// .rsd-slack-text rules in globals.css.
export function SlackText({ text }: { text: string }) {
  return (
    <div className="rsd-slack-text">
      {parseSlackText(text).map((block, i) =>
        block.type === "code" ? (
          <pre key={i} className="rsd-slack-pre">{block.text}</pre>
        ) : block.quote ? (
          <blockquote key={i} className="rsd-slack-quote">{block.lines.map(renderLine)}</blockquote>
        ) : (
          <Fragment key={i}>{block.lines.map(renderLine)}</Fragment>
        ),
      )}
    </div>
  );
}

function renderLine(line: SlackLine, i: number): ReactNode {
  if (line.runs.length === 0) return <div key={i} className="rsd-slack-line"><br /></div>;
  const content = line.runs.map(renderRun);
  if (!line.bullet) return <div key={i} className="rsd-slack-line">{content}</div>;
  return (
    <div key={i} className="rsd-slack-item" style={line.indent > 0 ? { paddingLeft: `${line.indent * 1.5}em` } : undefined}>
      <span className="rsd-slack-bullet">{line.bullet}</span>
      <span>{content}</span>
    </div>
  );
}

function renderRun(run: SlackRun, i: number): ReactNode {
  // Emoji shortcodes turn into emoji everywhere but code, as in Slack, and
  // in a bare link's text, which is the URL itself.
  let node: ReactNode = run.code ? (
    <code className="rsd-slack-code">{run.text}</code>
  ) : run.broadcast ? (
    <span className="rsd-slack-broadcast">{run.text}</span>
  ) : run.href && run.text === run.href ? (
    run.text
  ) : (
    emojify(run.text)
  );
  if (run.href) node = <a href={run.href} target="_blank" rel="noopener noreferrer">{node}</a>;
  if (run.strike) node = <s>{node}</s>;
  if (run.italic) node = <em>{node}</em>;
  if (run.bold) node = <strong>{node}</strong>;
  return <Fragment key={i}>{node}</Fragment>;
}
