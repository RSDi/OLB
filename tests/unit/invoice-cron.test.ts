import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../../app/api/cron/invoice-reminders/route.ts";

test("invoice reminder cron is 401 without a bearer secret", async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "secret";
  try {
    const res = await GET(new Request("http://localhost/api/cron/invoice-reminders"));
    assert.equal(res.status, 401);
    const authedWrong = await GET(
      new Request("http://localhost/api/cron/invoice-reminders", { headers: { authorization: "Bearer nope" } })
    );
    assert.equal(authedWrong.status, 401);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("invoice reminder cron is 401 when CRON_SECRET is unset", async () => {
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const res = await GET(
      new Request("http://localhost/api/cron/invoice-reminders", { headers: { authorization: "Bearer anything" } })
    );
    assert.equal(res.status, 401);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});
