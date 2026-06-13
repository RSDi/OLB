import { Icons } from "../../../components/icons";
import { Input, Textarea } from "../../../components/ui";
import {
  type RequestForm,
  type TrackConfig,
  type WizardStep,
  OptionCard,
  Chip,
  CheckRow,
  SummaryRow,
  Column,
  Wrap,
} from "./wizard";

const SPACES = ["Gym", "Kitchen", "Dining area", "Main Meeting Room", "Room 201", "Nursery", "Office(s)", "Outdoors / grounds"];
const NEEDS = ["Tables & chairs", "Kitchen", "Microphone / sound", "Projector / screen", "Childcare space", "Lots of outlets"];

// ─── value helpers ───────────────────────────────────────────────
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(", ") : "");
const reqBy = (f: RequestForm) =>
  f.requesterKind === "outside" ? `Outside group${str(f.outsideOrg) ? ` — ${str(f.outsideOrg)}` : ""}` : "MCC";
const whenStr = (f: RequestForm) => {
  const time = [f.startTime, f.endTime].filter(Boolean).join("–");
  const base = [f.date, time].filter(Boolean).join(" ");
  return `${base}${f.recurring ? ` (recurring${str(f.recurrenceNote) ? `: ${str(f.recurrenceNote)}` : ""})` : ""}`;
};
const peopleStr = (f: RequestForm) =>
  str(f.headcount) ? `${str(f.headcount)}${str(f.children) ? `, incl. ${str(f.children)} children` : ""}` : "";

// ─── shared building-use steps ───────────────────────────────────
const BUILDING_SUBTYPES = [
  { key: "gathering", label: "Gathering or meeting", blurb: "Fellowship, a group meeting, a get-together", icon: <Icons.Users width={20} height={20} /> },
  { key: "party", label: "Party or celebration", blurb: "Birthday, shower, anniversary, reception", icon: <Icons.Sparkles width={20} height={20} /> },
  { key: "wedding", label: "Wedding", blurb: "A ceremony and/or reception", icon: <Icons.Heart width={20} height={20} /> },
  { key: "class", label: "Class or program", blurb: "A class, group, or recurring activity", icon: <Icons.BookOpen width={20} height={20} /> },
  { key: "sports", label: "Sports or gym time", blurb: "Volleyball, basketball, open gym, play dates", icon: <Icons.Play width={20} height={20} /> },
  { key: "other", label: "Just need a room", blurb: "Something else — tell us about it", icon: <Icons.Home width={20} height={20} /> },
];
const subTypeStep: WizardStep = {
  key: "subType",
  title: "What are you planning?",
  hint: "Pick the closest match — we'll tailor the questions.",
  valid: (f) => !!f.subType,
  body: ({ form, set }) => (
    <Column>
      {BUILDING_SUBTYPES.map((t) => (
        <OptionCard
          key={t.key}
          selected={form.subType === t.key}
          onClick={() => {
            set("subType", t.key);
            set("subTypeLabel", t.label);
          }}
          icon={t.icon}
          label={t.label}
          blurb={t.blurb}
        />
      ))}
    </Column>
  ),
};

const whoStep: WizardStep = {
  key: "who",
  title: "A little about you",
  valid: (f) => f.requesterKind === "member" || !!str(f.outsideOrg).trim(),
  body: ({ form, set }) => (
    <>
      <Column>
        <OptionCard
          selected={form.requesterKind === "member"}
          onClick={() => set("requesterKind", "member")}
          icon={<Icons.Home width={20} height={20} />}
          label="I'm part of MCC"
          blurb="A member, regular attender, or ministry of the church"
        />
        <OptionCard
          selected={form.requesterKind === "outside"}
          onClick={() => set("requesterKind", "outside")}
          icon={<Icons.Users width={20} height={20} />}
          label="An outside group or person"
          blurb="Requesting on behalf of someone outside the church"
        />
      </Column>
      {form.requesterKind === "outside" && (
        <Input
          label="Group or host name *"
          value={str(form.outsideOrg)}
          onChange={(e) => set("outsideOrg", e.target.value)}
          placeholder="e.g. The Nelson family, Omaha Quilters Guild"
        />
      )}
      <Input
        label="Best phone or email to reach you"
        value={str(form.contact)}
        onChange={(e) => set("contact", e.target.value)}
        placeholder="Optional — helps us follow up"
      />
    </>
  ),
};

const spacesStep: WizardStep = {
  key: "spaces",
  title: "Which space(s) do you need?",
  hint: "Tap all that apply.",
  valid: (f) => Array.isArray(f.spaces) && (f.spaces as string[]).length > 0,
  body: ({ form, toggle }) => (
    <Wrap>
      {SPACES.map((s) => (
        <Chip key={s} selected={(form.spaces as string[] | undefined)?.includes(s) ?? false} onClick={() => toggle("spaces", s)}>
          {s}
        </Chip>
      ))}
    </Wrap>
  ),
};

const whenStep: WizardStep = {
  key: "when",
  title: "When do you need it?",
  hint: "Include setup and cleanup time if you can.",
  valid: (f) => !!str(f.date),
  body: ({ form, set }) => (
    <>
      <Input label="Date *" type="date" value={str(form.date)} onChange={(e) => set("date", e.target.value)} />
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Input label="Start time" type="time" value={str(form.startTime)} onChange={(e) => set("startTime", e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <Input label="End time" type="time" value={str(form.endTime)} onChange={(e) => set("endTime", e.target.value)} />
        </div>
      </div>
      <CheckRow checked={!!form.recurring} onChange={(v) => set("recurring", v)} label="This happens on more than one day" />
      {!!form.recurring && (
        <Input
          label="Which days / how often?"
          value={str(form.recurrenceNote)}
          onChange={(e) => set("recurrenceNote", e.target.value)}
          placeholder="e.g. every Tuesday in March, or Jan 27 / Feb 12"
        />
      )}
    </>
  ),
};

const peopleStep: WizardStep = {
  key: "people",
  title: "About how many people?",
  hint: "A rough number is perfectly fine.",
  body: ({ form, set }) => (
    <>
      <Input label="Number of people" value={str(form.headcount)} onChange={(e) => set("headcount", e.target.value)} placeholder="e.g. 30, or 20–50" />
      <Input label="How many children? (if any)" value={str(form.children)} onChange={(e) => set("children", e.target.value)} placeholder="Optional" />
    </>
  ),
};

const needsStep: WizardStep = {
  key: "needs",
  title: "What will you need?",
  hint: "Tap anything we should set out or provide.",
  body: ({ form, toggle }) => (
    <Wrap>
      {NEEDS.map((n) => (
        <Chip key={n} selected={(form.needs as string[] | undefined)?.includes(n) ?? false} onClick={() => toggle("needs", n)}>
          {n}
        </Chip>
      ))}
    </Wrap>
  ),
};

const accessStep: WizardStep = {
  key: "access",
  title: "Getting in & cleanup",
  hint: "Help us plan the practical side.",
  body: ({ form, set }) => (
    <>
      <Input label="Who will open & lock up?" value={str(form.accessPerson)} onChange={(e) => set("accessPerson", e.target.value)} placeholder="A name — or leave blank if you need us to" />
      <CheckRow checked={!!form.hasKey} onChange={(v) => set("hasKey", v)} label="I (or my helper) already have a key or door code" />
      <CheckRow checked={!!form.selfCleanup} onChange={(v) => set("selfCleanup", v)} label="We'll set up and clean up ourselves" />
    </>
  ),
};

const outsideExtrasStep: WizardStep = {
  key: "outside",
  title: "A couple more things",
  hint: "Because this is for an outside group.",
  show: (f) => f.requesterKind === "outside",
  body: ({ form, set }) => (
    <>
      <CheckRow checked={!!form.paidActivity} onChange={(v) => set("paidActivity", v)} label="We'll charge attendees, or this is a paid activity" />
      <CheckRow checked={!!form.insuranceAck} onChange={(v) => set("insuranceAck", v)} label="We can provide proof of insurance / sign a building-use waiver if needed" />
    </>
  ),
};

function reviewStep(
  rows: (f: RequestForm) => [string, string][],
  opts?: { notes?: boolean },
): WizardStep {
  const showNotes = opts?.notes !== false;
  return {
    key: "review",
    title: "Review & send",
    hint: "Make sure this looks right, then send it to the committee.",
    body: ({ form, set }) => (
      <>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows(form).map(([l, v]) => (
            <SummaryRow key={l} label={l} value={v} />
          ))}
        </div>
        {showNotes && (
          <Textarea
            label="Anything else we should know?"
            rows={3}
            value={str(form.notes)}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Optional"
          />
        )}
      </>
    ),
  };
}

// ─── Gym-specific steps (lean: identity + space are already known) ───────
const GYM_USES = [
  { key: "basketball", label: "Basketball" },
  { key: "volleyball", label: "Volleyball" },
  { key: "open-gym", label: "Open gym / free play" },
  { key: "practice", label: "Practice or class" },
  { key: "party", label: "Party or celebration" },
  { key: "other", label: "Something else" },
];
const gymUseStep: WizardStep = {
  key: "gymUse",
  title: "What are you using the gym for?",
  hint: "A quick tap — it helps the committee plan.",
  valid: (f) => !!f.subType,
  body: ({ form, set }) => (
    <Column>
      {GYM_USES.map((g) => (
        <OptionCard
          key={g.key}
          selected={form.subType === g.key}
          onClick={() => {
            set("subType", g.key);
            set("subTypeLabel", g.label);
          }}
          label={g.label}
        />
      ))}
    </Column>
  ),
};

// ─── maintenance steps ───────────────────────────────────────────
const MAINT_TYPES = [
  { key: "repair", label: "Something's broken", blurb: "A repair or fix is needed", icon: <Icons.Wrench width={20} height={20} /> },
  { key: "purchase", label: "We should buy something", blurb: "Request equipment or supplies", icon: <Icons.Plus width={20} height={20} /> },
];
const maintTypeStep: WizardStep = {
  key: "maintType",
  title: "What do you need?",
  valid: (f) => !!f.maintType,
  body: ({ form, set }) => (
    <Column>
      {MAINT_TYPES.map((t) => (
        <OptionCard key={t.key} selected={form.maintType === t.key} onClick={() => set("maintType", t.key)} icon={t.icon} label={t.label} blurb={t.blurb} />
      ))}
    </Column>
  ),
};
const brokenStep: WizardStep = {
  key: "broken",
  title: "Tell us what's wrong",
  show: (f) => f.maintType === "repair",
  valid: (f) => !!str(f.problem).trim(),
  body: ({ form, set }) => (
    <>
      <Input label="What's not working? *" value={str(form.problem)} onChange={(e) => set("problem", e.target.value)} placeholder="e.g. the pulpit microphone, a light" />
      <Input label="Where in the building?" value={str(form.location)} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Main Meeting Room, Nursery" />
      <Textarea label="What happens?" rows={3} value={str(form.problemDetail)} onChange={(e) => set("problemDetail", e.target.value)} placeholder="Too quiet, no power, cuts out…" />
    </>
  ),
};
const urgencyStep: WizardStep = {
  key: "urgency",
  title: "How urgent is it?",
  show: (f) => f.maintType === "repair",
  body: ({ form, set }) => (
    <Column>
      {["Whenever you can get to it", "Soon — it's a real problem", "Urgent — affects a service or event"].map((u) => (
        <OptionCard key={u} selected={form.urgency === u} onClick={() => set("urgency", u)} label={u} />
      ))}
    </Column>
  ),
};
const purchaseStep: WizardStep = {
  key: "purchase",
  title: "What should we buy?",
  show: (f) => f.maintType === "purchase",
  valid: (f) => !!str(f.item).trim(),
  body: ({ form, set }) => (
    <>
      <Input label="What item? *" value={str(form.item)} onChange={(e) => set("item", e.target.value)} placeholder="e.g. two grey nursery chairs" />
      <Input label="About how much each?" value={str(form.cost)} onChange={(e) => set("cost", e.target.value)} placeholder="e.g. $135" />
      <Input label="Link or photo (optional)" value={str(form.link)} onChange={(e) => set("link", e.target.value)} placeholder="Paste a link" />
      <Textarea label="Why is it needed?" rows={2} value={str(form.reason)} onChange={(e) => set("reason", e.target.value)} placeholder="One sentence" />
    </>
  ),
};

// ─── question steps ──────────────────────────────────────────────
const QUESTION_TOPICS = [
  "How something works",
  "A policy — 'why do we do this?'",
  "A suggestion to change something",
  "Something else",
];
const questionTopicStep: WizardStep = {
  key: "qtopic",
  title: "What's it about?",
  valid: (f) => !!f.topic,
  body: ({ form, set }) => (
    <Column>
      {QUESTION_TOPICS.map((t) => (
        <OptionCard key={t} selected={form.topic === t} onClick={() => set("topic", t)} label={t} />
      ))}
    </Column>
  ),
};
const questionStep: WizardStep = {
  key: "question",
  title: "Tell us more",
  valid: (f) => !!str(f.question).trim(),
  body: ({ form, set }) => (
    <>
      <Textarea label="Your question or suggestion *" rows={4} value={str(form.question)} onChange={(e) => set("question", e.target.value)} placeholder="In your own words…" />
      <Input label="Best way to reach you" value={str(form.contact)} onChange={(e) => set("contact", e.target.value)} placeholder="Optional" />
    </>
  ),
};

// ─── tracks ──────────────────────────────────────────────────────
export const TRACKS: Record<string, TrackConfig> = {
  // Lean, space-implied flow. The member is logged in (identity + contact come
  // from their account) and chose the Gym, so neither is asked. Reuses the
  // building-use field keys (spaces/date/times/headcount/access) so the review
  // queue, committee vote, and calendar auto-booking all work unchanged.
  gym: {
    key: "gym",
    title: "Reserve the Gym",
    initial: { requesterKind: "member", spaces: ["Gym"], needs: [] },
    successBody: "The building committee will review your gym request and follow up.",
    steps: [
      gymUseStep,
      whenStep,
      peopleStep,
      accessStep,
      reviewStep(
        (f) => [
          ["Using it for", str(f.subTypeLabel)],
          ["Space", "Gym"],
          ["When", whenStr(f)],
          ["People", peopleStr(f)],
        ],
        { notes: false },
      ),
    ],
  },
  "building-use": {
    key: "building-use",
    title: "Building use",
    initial: { requesterKind: "member", spaces: [], needs: [] },
    successBody: "The building committee will review your request and follow up.",
    steps: [
      subTypeStep,
      whoStep,
      spacesStep,
      whenStep,
      peopleStep,
      needsStep,
      accessStep,
      outsideExtrasStep,
      reviewStep((f) => [
        ["Plan", str(f.subTypeLabel)],
        ["Requested by", reqBy(f)],
        ["Space(s)", arr(f.spaces)],
        ["When", whenStr(f)],
        ["People", peopleStr(f)],
        ["Needs", arr(f.needs)],
      ]),
    ],
  },
  maintenance: {
    key: "maintenance",
    title: "Report a problem",
    initial: {},
    successBody: "Thanks for flagging it — we'll take a look.",
    steps: [
      maintTypeStep,
      brokenStep,
      urgencyStep,
      purchaseStep,
      reviewStep((f) =>
        f.maintType === "purchase"
          ? [
              ["Buy", str(f.item)],
              ["Cost", str(f.cost)],
              ["Link", str(f.link)],
              ["Why", str(f.reason)],
            ]
          : [
              ["Problem", str(f.problem)],
              ["Where", str(f.location)],
              ["Details", str(f.problemDetail)],
              ["Urgency", str(f.urgency)],
            ],
      ),
    ],
  },
  question: {
    key: "question",
    title: "Ask the committee",
    initial: {},
    successBody: "The committee will read this and get back to you.",
    steps: [
      questionTopicStep,
      questionStep,
      reviewStep((f) => [
        ["About", str(f.topic)],
        ["Question", str(f.question)],
      ]),
    ],
  },
};
