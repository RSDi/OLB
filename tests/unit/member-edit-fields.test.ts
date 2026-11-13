// Unit tests for the admin member editor's save payload. The regression case is
// the one we hit: the Directory profile didn't load membership_status, the
// dropdown fell back to "regular", and Save wrote "regular" over the real value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memberEditSaveFields, type MemberEditValues } from "../../lib/members/edit-fields.ts";

const base: MemberEditValues = {
  fullName: "  Jeffrey Wayne Malone ",
  nickname: "",
  avatarUrl: " ",
  phone: "(402) 555-0100",
  birthday: "",
  email: " jeff@example.com ",
  membershipStatus: "moved",
};

test("trims text fields and blanks become null", () => {
  assert.deepEqual(memberEditSaveFields(base), {
    full_name: "Jeffrey Wayne Malone",
    nickname: null,
    avatar_url: null,
    phone: "(402) 555-0100",
    birthday: null,
    email: "jeff@example.com",
    membership_status: "moved",
  });
});

test("a known membership status is sent", () => {
  assert.equal(memberEditSaveFields({ ...base, membershipStatus: "visiting" }).membership_status, "visiting");
});

test("an unknown membership status is left out, not defaulted to regular", () => {
  const fields = memberEditSaveFields({ ...base, membershipStatus: null });
  assert.equal("membership_status" in fields, false);
});
