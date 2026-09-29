// Unit tests for how an archived Slack message's text is read for display:
// Slack's own rules (bold, line breaks, bullet lines), not Markdown's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlackText, type SlackBlock, type SlackRun } from "../../lib/slack-archive/mrkdwn.ts";

// A compact picture of the parse: <b>, <i>, <s>, <code>, <a href>, <@> for
// broadcast mentions; "[•] " for a list item (two spaces per nesting
// level), "| " for a quoted line, <pre> for a code block.
function runMarkup(run: SlackRun): string {
  let out = run.code ? `<code>${run.text}</code>` : run.broadcast ? `<@>${run.text}</@>` : run.text;
  if (run.href) out = `<a ${run.href}>${out}</a>`;
  if (run.strike) out = `<s>${out}</s>`;
  if (run.italic) out = `<i>${out}</i>`;
  if (run.bold) out = `<b>${out}</b>`;
  return out;
}

function markup(blocks: SlackBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "code") return `<pre>${block.text}</pre>`;
      return block.lines
        .map((line) => {
          const body = line.runs.map(runMarkup).join("");
          const item = line.bullet ? `${"  ".repeat(line.indent)}[${line.bullet}] ${body}` : body;
          return block.quote ? `| ${item}` : item;
        })
        .join("\n");
    })
    .join("\n---\n");
}

const show = (text: string) => markup(parseSlackText(text));

test("*bold* is bold and _italic_ is italic, as in Slack", () => {
  assert.equal(show("*Parent Meeting* and _soon_ and ~cancelled~"), "<b>Parent Meeting</b> and <i>soon</i> and <s>cancelled</s>");
});

test("marks nest", () => {
  assert.equal(show("*_both_* done"), "<b><i>both</i></b> done");
});

test("every line break is kept, and blank lines stay blank", () => {
  assert.equal(show("GAME SCHEDULES\nThe schedule is up\n\nPRACTICE"), "GAME SCHEDULES\nThe schedule is up\n\nPRACTICE");
});

test("a bold run can continue onto the next line, but not past a blank line", () => {
  assert.equal(show("*GAME SCHEDULES\nThe* rest"), "<b>GAME SCHEDULES</b>\n<b>The</b> rest");
  assert.equal(show("*one\n\ntwo*"), "*one\n\ntwo*");
});

test("bullet lines become list items, nested by their indentation", () => {
  assert.equal(
    show("*High School (16U & 18U)*\n• Monday: [Creighton](https://example.com/c) | 4:00–6:00 PM\n    ◦ Bring a ball\n1. First\n    a. Sub"),
    "<b>High School (16U & 18U)</b>\n[•] Monday: <a https://example.com/c>Creighton</a> | 4:00–6:00 PM\n  [◦] Bring a ball\n[1.] First\n  [a.] Sub",
  );
});

test("marks inside words, and spaced-out asterisks, stay as typed", () => {
  assert.equal(show("snake_case_name costs 2*3*4 or 5 * 6 * 7"), "snake_case_name costs 2*3*4 or 5 * 6 * 7");
  assert.equal(show(":white_check_mark: done"), ":white_check_mark: done");
});

test("a mark with nothing inside, or never closed, stays as typed", () => {
  assert.equal(show("** and *open"), "** and *open");
});

test("the escapes sync adds to names and link labels are removed", () => {
  assert.equal(show("@Jeff\\_Malone see [the \\*new\\* plan](https://example.com/p)"), "@Jeff_Malone see <a https://example.com/p>the *new* plan</a>");
});

test("bold around a link", () => {
  assert.equal(show("*[Lightning Schedule](https://example.com/s)*"), "<b><a https://example.com/s>Lightning Schedule</a></b>");
});

test("bare links, minus the punctuation after them", () => {
  assert.equal(show("See https://example.com/a_b_c. Or (https://example.com/x)"), "See <a https://example.com/a_b_c>https://example.com/a_b_c</a>. Or (<a https://example.com/x>https://example.com/x</a>)");
  assert.equal(show("*https://example.com/b*"), "<b><a https://example.com/b>https://example.com/b</a></b>");
});

test("only web and mail links are links", () => {
  assert.equal(show("[x](javascript:alert(1))"), "[x](javascript:alert(1))");
});

test("inline code keeps its contents as typed", () => {
  assert.equal(show("run `npm *test*` now"), "run <code>npm *test*</code> now");
});

test("code blocks, with the line breaks around their fences", () => {
  assert.equal(show("Before\n```line *1*\nline 2```\nAfter"), "Before\n---\n<pre>line *1*\nline 2</pre>\n---\nAfter");
  assert.equal(show("``` alone"), "``` alone");
});

test("quotes, line by line or the rest of the message", () => {
  assert.equal(show("> quoted *bold*\n>more\nnot quoted"), "| quoted <b>bold</b>\n| more\n---\nnot quoted");
  assert.equal(show("Intro\n>>> all\nof this"), "Intro\n---\n| all\n| of this");
});

test("Markdown-only syntax stays as typed", () => {
  assert.equal(show("# 1 priority\n===\n    four spaces"), "# 1 priority\n===\n    four spaces");
});

test("@channel, @here and @everyone are marked", () => {
  assert.equal(show("Rosters are up! @channel"), "Rosters are up! <@>@channel</@>");
  assert.equal(show("*@here* but not me@here.com"), "<b><@>@here</@></b> but not me@here.com");
});

test("leading and trailing blank lines are dropped, and Windows line breaks read as one", () => {
  assert.equal(show("\n\nHi\r\nthere\n\n"), "Hi\nthere");
  assert.deepEqual(parseSlackText("   \n"), []);
});
