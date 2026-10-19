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

function isHostLeak(spec: string): boolean {
  if (spec.startsWith("@/") || spec.startsWith("lib/") || spec.startsWith("app/") || spec.startsWith("tests/")) return true;
  if (spec.includes("omaha-lightning") || spec.includes("lib/auth") || spec.includes("lib/hosted") || spec.includes("lib/invoicing")) return true;
  return false;
}

test("invoicing module core imports nothing from OLB app code", () => {
  const files = walk(srcRoot);
  assert.ok(files.length > 0, "expected source files");
  const leaks: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(pkgRoot, file);
    for (const m of [...text.matchAll(IMPORT), ...text.matchAll(REQUIRE)]) {
      const spec = m[1];
      if (isHostLeak(spec)) {
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
