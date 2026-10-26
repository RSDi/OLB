import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(pkgRoot, "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORT = /(?:from|import)\s+["']([^"']+)["']/g;
const REQUIRE = /require\(\s*["']([^"']+)["']\s*\)/g;

function isAllowed(spec: string): boolean {
  if (spec === "react" || spec === "react-dom" || spec === "heic-to") return true;
  if (spec.startsWith(".")) return true;
  return false;
}

test("document-scanner imports nothing from OLB app code", () => {
  const files = walk(srcRoot);
  assert.ok(files.length > 0, "expected source files");
  const leaks: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(pkgRoot, file);
    for (const m of [...text.matchAll(IMPORT), ...text.matchAll(REQUIRE)]) {
      const spec = m[1];
      if (!isAllowed(spec)) {
        leaks.push(`${rel} imports ${spec}`);
        continue;
      }
      if (spec.startsWith(".")) {
        const resolved = resolve(dirname(file), spec.replace(/\.tsx?$/, ""));
        if (!resolved.startsWith(pkgRoot)) leaks.push(`${rel} escapes package via ${spec}`);
      }
    }
  }
  assert.deepEqual(leaks, []);
});
