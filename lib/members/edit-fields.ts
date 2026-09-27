// Save payload for the admin member editor (app/portal/settings/MemberEditForm).
//
// Membership status is only written when the form actually knew it. A host
// that didn't load `membership_status` leaves it null here, and sending the
// dropdown's value anyway would quietly overwrite the real status. The column
// is NOT NULL, so null always means "not loaded", never a stored value.

export interface MemberEditValues {
  fullName: string;
  nickname: string;
  avatarUrl: string;
  phone: string;
  birthday: string;
  email: string;
  membershipStatus: string | null;
}

export interface MemberEditSaveFields {
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  phone: string | null;
  birthday: string | null;
  email: string | null;
  membership_status?: string;
}

export function memberEditSaveFields(v: MemberEditValues): MemberEditSaveFields {
  return {
    full_name: v.fullName.trim() || null,
    nickname: v.nickname.trim() || null,
    avatar_url: v.avatarUrl.trim() || null,
    phone: v.phone.trim() || null,
    birthday: v.birthday || null,
    email: v.email.trim() || null,
    ...(v.membershipStatus ? { membership_status: v.membershipStatus } : {}),
  };
}
