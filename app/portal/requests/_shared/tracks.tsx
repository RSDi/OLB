import { Icons } from "../../../components/icons";
import { Input, Textarea } from "../../../components/ui";
import { resolveRequestDates, summarizeDates, formatDateLabel } from "../../../../lib/requests/recurrence";
import { BookingCalendar } from "./BookingCalendar";
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
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── value helpers ───────────────────────────────────────────────
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(", ") : "");
const numArr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6) : []);
const strArr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : []);
const weekdayOf = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay() : null;
};
const reqBy = (f: RequestForm) =>
  f.requesterKind === "outside" ? `Outside group${str(f.outsideOrg) ? ` — ${str(f.outsideOrg)}` : ""}` : "MCC";
const whenStr = (f: RequestForm) => {
  const time = [f.startTime, f.endTime].filter(Boolean).join("–");
  if (f.recurring) {
    const dates = resolveRequestDates(f);
    const datePart = dates.length > 1 ? summarizeDates(dates) : str(f.date);
    return [datePart, time].filter(Boolean).join(" ") + (dates.length > 1 ? " (recurring)" : "");
  }
  return [f.date, time].filter(Boolean).join(" ");
};
const peopleStr = (f: RequestForm) =>
  str(f.headcount) ? `${str(f.headcount)}${str(f.children) ? `, incl. ${str(f.children)} children` : ""}` : "";

// ─── shared building-use steps ───────────────────────────────────
const BUILDING_SUBTYPES = [
  { key: "sports", label: "Sports or gym time", blurb: "Volleyball, basketball, open gym, play dates", icon: <Icons.Play width={20} height={20} /> },
  { key: "gathering", label: "Gathering or meeting", blurb: "Fellowship, a group meeting, a get-together", icon: <Icons.Users width={20} height={20} /> },
  { key: "party", label: "Party or celebration", blurb: "Birthday, shower, anniversary, reception", icon: <Icons.Sparkles width={20} height={20} /> },
  { key: "wedding", label: "Wedding", blurb: "A ceremony and/or reception", icon: <Icons.Heart width={20} height={20} /> },
  { key: "class", label: "Class or program", blurb: "A class, group, or recurring activity", icon: <Icons.BookOpen width={20} height={20} /> },
  { key: "other", label: "Just need a room", blurb: "Something else — tell us about it", icon: <Icons.Home width={20} height={20} /> },
];
const subTypeStep: WizardStep = {
  key: "subType",
  title: "What are you planning?",
  hint: "Pick the closest match — we'll tailor the questions.",
  valid: (f) => !!f.subType,
  // "Sports or gym time" hands off to the dedicated gym template (space is the
  // Gym, identity is implied) instead of the general room-booking questions.
  nextHref: (f) => (f.subType === "sports" ? "/portal/requests/gym" : null),
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

// HH:MM strings are zero-padded, so a lexical compare is also chronological.
const timesReversed = (f: RequestForm) => {
  const st = str(f.startTime);
  const et = str(f.endTime);
  return !!st && !!et && et <= st;
};

// Structured recurrence capture: weekday toggles + an end date generate a
// concrete date list (resolveRequestDates), which the member can fine-tune by
// removing generated dates or adding one-offs. The resolved list is what the
// conflict checker and the approval calendar-booker act on. A plain function
// (no hooks) so it composes into the step body without a component boundary.
function recurringPlanner(form: RequestForm, set: (key: string, value: unknown) => void) {
  const weekdays = numArr(form.recurWeekdays);
  const dates = resolveRequestDates(form);
  const excludes = strArr(form.recurExcludes);
  const addDate = str(form.recurAddDate);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        border: "1px solid var(--gw-border)",
        background: "var(--gw-bg)",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--gw-fg-muted)" }}>Which days does it repeat?</div>
      <Wrap>
        {WEEKDAYS.map((d, i) => (
          <Chip
            key={d}
            selected={weekdays.includes(i)}
            onClick={() => set("recurWeekdays", weekdays.includes(i) ? weekdays.filter((x) => x !== i) : [...weekdays, i].sort())}
          >
            {d}
          </Chip>
        ))}
      </Wrap>
      <Input label="Repeat until" type="date" value={str(form.recurUntil)} onChange={(e) => set("recurUntil", e.target.value)} />
      {dates.length > 1 ? (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>
            {dates.length} dates <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}>· tap one to remove it</span>
          </div>
          <Wrap>
            {dates.map((dt) => {
              // The anchor date always stays (it's the request's primary date);
              // removing it could collapse the series to nothing.
              const isAnchor = dt === str(form.date);
              return (
                <Chip key={dt} selected onClick={isAnchor ? () => {} : () => set("recurExcludes", [...excludes, dt])}>
                  {formatDateLabel(dt)}{isAnchor ? "" : " ✕"}
                </Chip>
              );
            })}
          </Wrap>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
          Pick the weekdays and an end date and we&apos;ll list every date — or add them one at a time below.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <Input label="Add a specific date" type="date" value={addDate} onChange={(e) => set("recurAddDate", e.target.value)} />
        </div>
        <div style={{ paddingBottom: 2 }}>
          <Chip
            selected={false}
            onClick={() => {
              if (!addDate) return;
              set("recurExtras", [...strArr(form.recurExtras).filter((x) => x !== addDate), addDate]);
              set("recurExcludes", strArr(form.recurExcludes).filter((x) => x !== addDate));
              set("recurAddDate", "");
            }}
          >
            + Add
          </Chip>
        </div>
      </div>
    </div>
  );
}

const whenStep: WizardStep = {
  key: "when",
  title: "When do you need it?",
  hint: "Include setup and cleanup time if you can.",
  valid: (f) => !!str(f.date) && !timesReversed(f),
  body: ({ form, set }) => (
    <>
      <BookingCalendar
        form={form}
        set={set}
        spaces={Array.isArray(form.spaces) ? (form.spaces as string[]) : []}
      />
      <CheckRow
        checked={!!form.recurring}
        onChange={(v) => {
          set("recurring", v);
          // Seed the weekday toggle with the anchor date's own weekday so the
          // common "every Tuesday" case is one tap away.
          if (v && numArr(form.recurWeekdays).length === 0) {
            const wd = weekdayOf(str(form.date));
            if (wd !== null) set("recurWeekdays", [wd]);
          }
        }}
        label="This happens on more than one day"
      />
      {!!form.recurring && recurringPlanner(form, set)}
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

// ─── Gym template (lean: identity + space are already known) ─────────────
// A focused "just reserving the gym" flow for the three things it's used for.
// Parties, classes, etc. live in their own building-use templates. The activity
// drives which equipment readiness checks + setup playbooks we show.
const GYM_ACTIVITIES = [
  { key: "volleyball", label: "Volleyball" },
  { key: "basketball", label: "Basketball" },
  { key: "open-gym", label: "Open gym" },
];
const gymActivityStep: WizardStep = {
  key: "gymActivity",
  title: "Which activity?",
  hint: "So we can point you to the right setup steps.",
  valid: (f) => !!f.subType,
  body: ({ form, set }) => (
    <Column>
      {GYM_ACTIVITIES.map((g) => (
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

// Setup / shutdown guides (Playbooks at /portal/docs/<id>). Hard-coded ids —
// if a playbook is ever re-created, update the id here.
const PLAYBOOKS = {
  volleyball: "098d3f77-46ae-4b25-a1b3-3e79937cb270",
  basketball: "ce04e87f-6ca5-465e-b178-cd47627903cb",
  shutdown: "641b66de-9755-412b-9c1d-0a1397d23a56",
  hvac: "07b0f975-8f87-415c-b647-d9779d17be39",
};
function PlaybookLink({ id, label }: { id: string; label: string }) {
  return (
    <a
      href={`/portal/docs/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--rsd-accent)", textDecoration: "none", paddingLeft: 2 }}
    >
      <Icons.BookOpen width={13} height={13} /> {label}
    </a>
  );
}
function ReadinessRow(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  playbook: string;
  playbookLabel: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <CheckRow checked={props.checked} onChange={props.onChange} label={props.label} />
      <PlaybookLink id={props.playbook} label={`How-to: ${props.playbookLabel}`} />
    </div>
  );
}
const gymReadinessStep: WizardStep = {
  key: "gymReadiness",
  title: "Setup & closing up",
  hint: "A quick check so you're set — open a guide if you need it. It's fine to say no; we'll make sure someone shows you.",
  body: ({ form, set }) => (
    <Column>
      {form.subType === "volleyball" && (
        <ReadinessRow
          checked={!!form.netKnown}
          onChange={(v) => set("netKnown", v)}
          label="I know how to set up and take down the net"
          playbook={PLAYBOOKS.volleyball}
          playbookLabel="Volleyball net setup"
        />
      )}
      {form.subType === "basketball" && (
        <ReadinessRow
          checked={!!form.scoreboardKnown}
          onChange={(v) => set("scoreboardKnown", v)}
          label="I know how to set up and run the scoreboard"
          playbook={PLAYBOOKS.basketball}
          playbookLabel="Basketball scoreboard setup"
        />
      )}
      <ReadinessRow
        checked={!!form.shutdownKnown}
        onChange={(v) => set("shutdownKnown", v)}
        label="I've closed up the building before and know the shutdown steps"
        playbook={PLAYBOOKS.shutdown}
        playbookLabel="Building shutdown"
      />
      <PlaybookLink id={PLAYBOOKS.hvac} label="How-to: Gym heating & cooling (HVAC)" />
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
      gymActivityStep,
      whenStep,
      gymReadinessStep,
      reviewStep(
        (f) => [
          ["Activity", str(f.subTypeLabel)],
          ["Space", "Gym"],
          ["When", whenStr(f)],
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
