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

// ─── shared steps ────────────────────────────────────────────────
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

function reviewStep(rows: (f: RequestForm) => [string, string][]): WizardStep {
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
        <Textarea
          label="Anything else we should know?"
          rows={3}
          value={str(form.notes)}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Optional"
        />
      </>
    ),
  };
}

// ─── track-specific steps ────────────────────────────────────────
const spacePurposeStep: WizardStep = {
  key: "purpose",
  title: "What will you use it for?",
  hint: "A quick description helps us plan.",
  valid: (f) => !!str(f.purpose).trim(),
  body: ({ form, set }) => (
    <Input label="Purpose *" value={str(form.purpose)} onChange={(e) => set("purpose", e.target.value)} placeholder="e.g. moms' group play date, baking, a meeting" />
  ),
};

const EVENT_TYPES = [
  { key: "party", label: "Party or celebration", blurb: "Birthday, shower, anniversary", icon: <Icons.Sparkles width={20} height={20} /> },
  { key: "wedding", label: "Wedding or reception", blurb: "A ceremony and/or reception", icon: <Icons.Heart width={20} height={20} /> },
  { key: "speaker", label: "Guest speaker / program", blurb: "A talk, seminar, or presentation", icon: <Icons.Mic width={20} height={20} /> },
  { key: "gathering", label: "Other gathering", blurb: "Something else", icon: <Icons.Users width={20} height={20} /> },
];
const eventTypeStep: WizardStep = {
  key: "eventType",
  title: "What kind of event?",
  valid: (f) => !!f.eventType,
  body: ({ form, set }) => (
    <Column>
      {EVENT_TYPES.map((t) => (
        <OptionCard
          key={t.key}
          selected={form.eventType === t.key}
          onClick={() => {
            set("eventType", t.key);
            set("eventTypeLabel", t.label);
          }}
          icon={t.icon}
          label={t.label}
          blurb={t.blurb}
        />
      ))}
    </Column>
  ),
};
const speakerStep: WizardStep = {
  key: "speaker",
  title: "About the speaker",
  show: (f) => f.eventType === "speaker",
  body: ({ form, set }) => (
    <>
      <Input label="Speaker name" value={str(form.speakerName)} onChange={(e) => set("speakerName", e.target.value)} placeholder="Who's presenting?" />
      <Textarea label="Topic / purpose" rows={2} value={str(form.topic)} onChange={(e) => set("topic", e.target.value)} placeholder="What's the talk about?" />
    </>
  ),
};
const eventExtrasStep: WizardStep = {
  key: "eventExtras",
  title: "Anything special?",
  hint: "Helps us protect the space and plan.",
  body: ({ form, set }) => (
    <>
      <CheckRow checked={!!form.alcohol} onChange={(v) => set("alcohol", v)} label="Alcohol will be served" />
      <Input label="Decorations? (tape, candles, helium, confetti)" value={str(form.decorations)} onChange={(e) => set("decorations", e.target.value)} placeholder="Optional — what are you planning?" />
    </>
  ),
};

const classDetailsStep: WizardStep = {
  key: "classDetails",
  title: "Tell us about the class or program",
  valid: (f) => !!str(f.classTitle).trim(),
  body: ({ form, set }) => (
    <>
      <Input label="What is it? *" value={str(form.classTitle)} onChange={(e) => set("classTitle", e.target.value)} placeholder="e.g. Beginner sewing class, youth game night" />
      <Input label="Who is it open to?" value={str(form.audience)} onChange={(e) => set("audience", e.target.value)} placeholder="e.g. church families, anyone who signs up" />
    </>
  ),
};
const classLogisticsStep: WizardStep = {
  key: "classLogistics",
  title: "Cost & who's leading",
  body: ({ form, set }) => (
    <>
      <CheckRow checked={!!form.hasFee} onChange={(v) => set("hasFee", v)} label="There's a cost to attend / it's a paid activity" />
      <CheckRow checked={!!form.outsideInstructor} onChange={(v) => set("outsideInstructor", v)} label="Led by someone from outside the church" />
      <CheckRow checked={!!form.insuranceAck} onChange={(v) => set("insuranceAck", v)} label="Can provide insurance / sign a waiver if needed" />
    </>
  ),
};

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
  "use-a-space": {
    key: "use-a-space",
    title: "Use a space",
    initial: { requesterKind: "member", spaces: [], needs: [] },
    successBody: "The building committee will review your request and follow up.",
    steps: [
      spacePurposeStep,
      whoStep,
      spacesStep,
      whenStep,
      peopleStep,
      needsStep,
      accessStep,
      outsideExtrasStep,
      reviewStep((f) => [
        ["Purpose", str(f.purpose)],
        ["Requested by", reqBy(f)],
        ["Space(s)", arr(f.spaces)],
        ["When", whenStr(f)],
        ["People", peopleStr(f)],
        ["Needs", arr(f.needs)],
      ]),
    ],
  },
  event: {
    key: "event",
    title: "Host an event",
    initial: { requesterKind: "member", spaces: [], needs: [] },
    successBody: "The building committee will review your request and follow up.",
    steps: [
      eventTypeStep,
      whoStep,
      spacesStep,
      whenStep,
      peopleStep,
      speakerStep,
      needsStep,
      eventExtrasStep,
      accessStep,
      outsideExtrasStep,
      reviewStep((f) => [
        ["Event", str(f.eventTypeLabel)],
        ["Requested by", reqBy(f)],
        ["Space(s)", arr(f.spaces)],
        ["When", whenStr(f)],
        ["People", peopleStr(f)],
        ["Speaker", str(f.speakerName)],
        ["Needs", arr(f.needs)],
      ]),
    ],
  },
  class: {
    key: "class",
    title: "Run a class or program",
    initial: { requesterKind: "member", spaces: [], needs: [] },
    successBody: "The building committee will review your request and follow up.",
    steps: [
      classDetailsStep,
      whoStep,
      spacesStep,
      whenStep,
      peopleStep,
      needsStep,
      accessStep,
      classLogisticsStep,
      reviewStep((f) => [
        ["Class", str(f.classTitle)],
        ["Open to", str(f.audience)],
        ["Requested by", reqBy(f)],
        ["Space(s)", arr(f.spaces)],
        ["When", whenStr(f)],
        ["People", peopleStr(f)],
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

export const TRACK_KEYS = Object.keys(TRACKS);
