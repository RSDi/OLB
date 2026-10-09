// A space the build drops: JSX text right after a tag or {value} that starts
// with a space, holds an HTML entity (&apos;, &amp;…) and runs on to a line
// break loses that space ("Press <strong>Add</strong> to add the season&apos;s
// …" renders "Addto"). It happens in the built pages too. Write {" "} for
// that space, or keep the text on one line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

test("no JSX text loses the space after a tag or {value}", () => {
  const found: string[] = [];
  for (const file of [...tsxFiles("app"), ...tsxFiles("packages")]) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("&")) continue;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if (ts.isJsxText(n)) {
        const raw = src.slice(n.pos, n.end);
        const kids = (n.parent as ts.JsxElement | ts.JsxFragment).children;
        const prev = kids[kids.indexOf(n) - 1];
        if (prev && !ts.isJsxText(prev) && /^[ \t]+\S/.test(raw) && /&[a-zA-Z0-9#]+;/.test(raw) && raw.includes("\n")) {
          found.push(`${file}:${sf.getLineAndCharacterOfPosition(n.pos).line + 1}: ${raw.trim().slice(0, 60)}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  assert.deepEqual(found, [], `Write {" "} for these spaces:\n${found.join("\n")}`);
});
