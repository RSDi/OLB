import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { programAccordionHash, programCopyFromList, programPresentation } from "../../lib/website/programs.ts";

test("program titles drop Waitlisted and get the mockup pills", () => {
  const elementary = programPresentation("8U-12U Competitive (Waitlisted)");
  assert.deepEqual(elementary, {
    title: "8U-12U Competitive",
    pill: { label: "Closed for 2026-27", tone: "closed" },
    muted: true,
  });
  const fourteen = programPresentation("14U Competitive (Waitlisted)");
  assert.deepEqual(fourteen, {
    title: "14U Competitive",
    pill: { label: "Assessments open · 2 spots", tone: "open" },
  });
  const hs = programPresentation("16U-18U Competitive");
  assert.deepEqual(hs, {
    title: "16U-18U Competitive",
    pill: { label: "Closed for 2026-27", tone: "closed" },
    muted: true,
  });
});

test("the 14U accordion write-up is the same copy the assessment pop-up uses", () => {
  const items = [
    { text: (f: string) => (f === "title" ? "8U-12U Competitive (Waitlisted)" : "elementary body") },
    { text: (f: string) => (f === "title" ? "14U Competitive (Waitlisted)" : "14U practice times and $400") },
    { text: (f: string) => (f === "title" ? "16U-18U Competitive" : "hs body") },
  ];
  assert.deepEqual(programCopyFromList(items), {
    title: "14U Competitive",
    body: "14U practice times and $400",
  });
});

test("the 14U row is the #14u accordion target", () => {
  assert.equal(programAccordionHash("14U Competitive"), "14u");
  assert.equal(programAccordionHash("14U Competitive (Waitlisted)"), "14u");
  assert.equal(programAccordionHash("8U-12U Competitive"), null);
  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/programs/page.tsx"), "utf8");
  assert.match(page, /programAccordionHash/);
  const accordion = readFileSync(join(import.meta.dirname, "../../app/(site)/_components/Accordion.tsx"), "utf8");
  assert.match(accordion, /location\.hash/);
  assert.match(accordion, /scrollIntoView/);
  const box = readFileSync(join(import.meta.dirname, "../../app/(site)/_components/HomepageMessageBox.tsx"), "utf8");
  assert.match(box, /programsHeroBoxHref/);
});

test("the Programs page shows the 14U button only and no waitlist notice", () => {
  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/programs/page.tsx"), "utf8");
  assert.match(page, /programPresentation/);
  assert.match(page, /ProgramDetails/);
  assert.match(page, /programs\.button\.assessments/);
  assert.match(page, /getVisibleProgramsHeroMessage/);
  assert.match(page, /padding: heroMessage \? "8vmax 0 4vmax" : "8vmax 0 0"/);
  assert.match(page, /rows=\{heroMessage \? \[16, 12\] : \[6, 6\]\}/);
  assert.doesNotMatch(page, /programs\.notice/);
  assert.doesNotMatch(page, /programs\.button\.waitlist/);
  assert.doesNotMatch(page, /programs\.button\.register/);
});
