// In-memory Supabase-shaped client for invoicing service tests.

type Row = Record<string, unknown>;

function uuid(): string {
  return "00000000-0000-4000-8000-" + String(Object.keys(Math).length + Math.random()).replace(/\D/g, "").padEnd(12, "0").slice(0, 12);
}

export class MemoryDb {
  invoices: Row[] = [];
  lines: Row[] = [];
  payments: Row[] = [];
  reminders: Row = { id: 1, freq: "3d", start_days: 7, until_paid: true, cc_emails: [], bcc_emails: [], updated_by: null, updated_at: new Date().toISOString() };
  sends: Row[] = [];
  sequences = new Map<number, number>();

  table(name: string): Row[] {
    if (name === "inv_invoices") return this.invoices;
    if (name === "inv_line_items") return this.lines;
    if (name === "inv_payments") return this.payments;
    if (name === "inv_reminder_settings") return [this.reminders];
    if (name === "inv_reminder_sends") return this.sends;
    if (name === "inv_sequences") return [...this.sequences.entries()].map(([year, last_n]) => ({ year, last_n }));
    return [];
  }

  client() {
    const db = this;
    return {
      from(name: string) {
        return new Query(db, name);
      },
      async rpc(fn: string, args: { p_year: number }) {
        if (fn !== "inv_next_number") return { data: null, error: { message: "unknown rpc" } };
        const n = (db.sequences.get(args.p_year) ?? 0) + 1;
        db.sequences.set(args.p_year, n);
        return { data: `INV-${args.p_year}-${String(n).padStart(4, "0")}`, error: null };
      },
    };
  }
}

class Query {
  private filters: { col: string; op: string; val: unknown }[] = [];
  private orderCol: string | null = null;
  private insertRows: Row[] | null = null;
  private patch: Row | null = null;
  private deleting = false;
  private upserting = false;
  private wantSingle = false;
  private wantMaybe = false;
  private cols = "*";

  constructor(
    private db: MemoryDb,
    private name: string
  ) {}

  select(cols = "*") {
    this.cols = cols;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }
  like(col: string, val: string) {
    this.filters.push({ col, op: "like", val });
    return this;
  }
  order(col: string) {
    this.orderCol = col;
    return this;
  }
  insert(row: Row | Row[]) {
    this.insertRows = Array.isArray(row) ? row : [row];
    return this;
  }
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  upsert(row: Row) {
    this.upserting = true;
    this.insertRows = [row];
    return this;
  }
  delete() {
    this.deleting = true;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }
  maybeSingle() {
    this.wantMaybe = true;
    return this;
  }

  private match(row: Row): boolean {
    return this.filters.every((f) => {
      if (f.op === "eq") return row[f.col] === f.val;
      if (f.op === "in") return (f.val as unknown[]).includes(row[f.col]);
      if (f.op === "like") {
        const re = new RegExp("^" + String(f.val).replace(/%/g, ".*") + "$");
        return re.test(String(row[f.col] ?? ""));
      }
      return true;
    });
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onFulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }

  private run(): { data: unknown; error: { message: string } | null } {
    const table = this.db.table(this.name);
    if (this.insertRows) {
      if (this.upserting && this.name === "inv_reminder_settings") {
        this.db.reminders = { ...this.db.reminders, ...this.insertRows[0] };
        return { data: this.db.reminders, error: null };
      }
      const created: Row[] = [];
      for (const row of this.insertRows) {
        if (this.name === "inv_reminder_sends") {
          const dup = this.db.sends.find((s) => s.invoice_id === row.invoice_id && s.sent_on === row.sent_on);
          if (dup) return { data: null, error: { message: "duplicate" } };
        }
        const full = {
          id: (row.id as string) || crypto.randomUUID?.() || uuid(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          public_token: row.public_token ?? crypto.randomUUID?.() ?? uuid(),
          voided_at: null,
          sent_at: null,
          viewed_at: null,
          issued_on: null,
          cc_emails: row.cc_emails ?? null,
          bcc_emails: row.bcc_emails ?? null,
          reminder_freq: null,
          reminder_start_days: null,
          reminder_until_paid: null,
          deposit_cents: 0,
          ...row,
        };
        table.push(full);
        created.push(full);
      }
      if (this.wantSingle) return { data: created[0], error: null };
      return { data: created, error: null };
    }
    if (this.patch) {
      for (const row of table) {
        if (this.match(row)) Object.assign(row, this.patch, { updated_at: new Date().toISOString() });
      }
      return { data: null, error: null };
    }
    if (this.deleting) {
      const keep = table.filter((r) => !this.match(r));
      table.length = 0;
      table.push(...keep);
      return { data: null, error: null };
    }
    let rows = table.filter((r) => this.match(r));
    if (this.orderCol) rows = [...rows].sort((a, b) => String(b[this.orderCol!]).localeCompare(String(a[this.orderCol!])));
    if (this.cols !== "*") {
      const keys = this.cols.split(",").map((s) => s.trim());
      rows = rows.map((r) => {
        const o: Row = {};
        for (const k of keys) o[k] = r[k];
        return o;
      });
    }
    if (this.wantMaybe) return { data: rows[0] ?? null, error: null };
    if (this.wantSingle) return { data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } };
    return { data: rows, error: null };
  }
}
