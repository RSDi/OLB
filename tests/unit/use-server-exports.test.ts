// "use server" files become the Settings (and other) server-action bundles.
// Re-exporting a value or a type from one of them — `export { x }`,
// `export type { X }`, `export const`, `export *` — makes Next evaluate a
// name that isn't in the generated chunk (PublicAgentKey from #208/#211).
// The whole /portal/settings action bundle then 500s and Film/Teams hang on
// Loading. Keep types next to the data (`export type X =`, `export interface`)
// and export only `async function` actions. A same-line `// use-server-export-ok`
// allowlists one statement if a re-export is truly required.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dirname, "../..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function isUseServerFile(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression)) return false;
  return first.expression.text === "use server";
}

function allowlisted(sf: ts.SourceFile, node: ts.Node): boolean {
  const comments = ts.getTrailingCommentRanges(sf.text, node.end) ?? [];
  return comments.some((c) => sf.text.slice(c.pos, c.end).includes("use-server-export-ok"));
}

function exported(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
}

function kindLabel(stmt: ts.Statement): string | null {
  if (ts.isExportDeclaration(stmt)) {
    if (!stmt.exportClause || ts.isNamespaceExport(stmt.exportClause)) return "export *";
    if (ts.isNamedExports(stmt.exportClause)) {
      return stmt.isTypeOnly ? "export type { ... }" : "export { ... }";
    }
  }
  if (ts.isVariableStatement(stmt) && exported(stmt)) {
    const flags = ts.getCombinedNodeFlags(stmt.declarationList);
    if (flags & ts.NodeFlags.Const) return "export const";
    if (flags & ts.NodeFlags.Let) return "export let";
    return "export var";
  }
  if (ts.isClassDeclaration(stmt) && exported(stmt)) return "export class";
  return null;
}

test('"use server" files only export async functions, interfaces, and inline types', () => {
  const found: string[] = [];
  for (const file of [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "lib"))]) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("use server")) continue;
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
    if (!isUseServerFile(sf)) continue;
    for (const stmt of sf.statements) {
      const label = kindLabel(stmt);
      if (!label || allowlisted(sf, stmt)) continue;
      const line = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1;
      found.push(`${relative(ROOT, file)}:${line}: ${label}`);
    }
  }
  assert.deepEqual(found, [], `Move these out of "use server" files:\n${found.join("\n")}`);
});
