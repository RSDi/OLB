// Migrations must never ship with unresolved git conflict markers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "../../supabase/migrations");

test("no migration file contains git conflict markers", () => {
  const names = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.length > 0, "expected migration sql files");
  for (const name of names) {
    const lines = readFileSync(join(dir, name), "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const loc = `${name}:${i + 1}`;
      assert.ok(!line.includes("<<<<<<<"), `${loc} contains <<<<<<<`);
      assert.notEqual(line, "=======", `${loc} is a ======= conflict marker`);
      assert.ok(!line.includes(">>>>>>>"), `${loc} contains >>>>>>>`);
    }
  }
});
