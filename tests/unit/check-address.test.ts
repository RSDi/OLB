import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCheckAddress,
  normalizeCheckPayee,
  parseEnvCheckAddress,
  resolveCheckMailing,
} from "../../lib/mail/check-address.ts";
import { CHECK_PAYEE } from "../../lib/teams/registration-receipt.ts";

test("empty stored address falls back to MAIL_CHECK_ADDRESS then stays empty", () => {
  const fromEnv = resolveCheckMailing({ payee: null, address: null }, { MAIL_CHECK_ADDRESS: "Treasurer|1 Main St|Omaha, NE" });
  assert.equal(fromEnv.payee, CHECK_PAYEE);
  assert.deepEqual(fromEnv.addressLines, ["Treasurer", "1 Main St", "Omaha, NE"]);

  const none = resolveCheckMailing({ payee: null, address: null }, { MAIL_CHECK_ADDRESS: "" });
  assert.equal(none.payee, CHECK_PAYEE);
  assert.deepEqual(none.addressLines, []);
});

test("stored address wins over the env var; stored payee wins over CHECK_PAYEE", () => {
  const got = resolveCheckMailing(
    { payee: "OLB Treasurer", address: "Attn Jeff\nPO Box 1\nOmaha, NE 68102" },
    { MAIL_CHECK_ADDRESS: "Env Person|Env St" }
  );
  assert.equal(got.payee, "OLB Treasurer");
  assert.deepEqual(got.addressLines, ["Attn Jeff", "PO Box 1", "Omaha, NE 68102"]);
});

test("normalize drops blank payee and address so we never seed a value", () => {
  assert.equal(normalizeCheckPayee("  "), null);
  assert.equal(normalizeCheckAddress("\n  \n"), null);
  assert.equal(normalizeCheckAddress("Treasurer\n123 Main St"), "Treasurer\n123 Main St");
  assert.equal(parseEnvCheckAddress({ MAIL_CHECK_ADDRESS: " A | | B " }).join(","), "A,B");
});
