import "server-only";

import { timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/finance-crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  maskPhoneNumber,
  privateProfileAccessCode,
} from "@/lib/staff-private-profile-core";

export type StaffPrivateDetails = {
  legalName: string;
  phoneNumber?: string | null;
  payeeAddress: {
    line1: string;
    line2?: string | null;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
  bankName: string;
  swiftCode: string;
  accountNumber: string;
  institutionNumber: string;
  branchAddress?: string | null;
};

type PrivateProfileRow = {
  staff_profile_id: string;
  encrypted_details: string;
  profiles: { full_name: string; team_username: string } | null;
};

export class StaffPrivateProfileError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 500, code = "PRIVATE_PROFILE_ERROR") {
    super(message);
    this.name = "StaffPrivateProfileError";
    this.status = status;
    this.code = code;
  }
}

function adminClient() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new StaffPrivateProfileError(
      "Private profile storage is not configured.",
      503,
      "NOT_CONFIGURED",
    );
  }
  return admin;
}

function parseDetails(encrypted: string) {
  try {
    return JSON.parse(decryptSecret(encrypted)) as StaffPrivateDetails;
  } catch {
    throw new StaffPrivateProfileError(
      "The private profile could not be decrypted.",
      500,
      "DECRYPTION_FAILED",
    );
  }
}

export async function getStaffPrivateProfile(teamUsername: string) {
  const { data, error } = await adminClient()
    .from("staff_private_profiles")
    .select(
      "staff_profile_id, encrypted_details, profiles!inner(full_name, team_username)",
    )
    .eq("profiles.team_username", teamUsername)
    .maybeSingle();

  if (error) {
    throw new StaffPrivateProfileError(
      "Private profiles have not been set up yet.",
      503,
      "MIGRATION_REQUIRED",
    );
  }
  if (!data) return null;

  const row = data as unknown as PrivateProfileRow;
  if (!row.profiles) return null;
  return {
    profileId: row.staff_profile_id,
    fullName: row.profiles.full_name,
    teamUsername: row.profiles.team_username,
    details: parseDetails(row.encrypted_details),
  };
}

export async function getStaffPrivateProfileMeta(teamUsername: string) {
  const profile = await getStaffPrivateProfile(teamUsername);
  if (!profile) return { configured: false as const };
  return {
    configured: true as const,
    phoneMasked: maskPhoneNumber(profile.details.phoneNumber),
    accessCodeReady: Boolean(
      privateProfileAccessCode(
        profile.fullName,
        profile.details.phoneNumber ?? "",
      ),
    ),
  };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export async function revealStaffPrivateProfile(
  teamUsername: string,
  suppliedAccessCode: unknown,
) {
  const profile = await getStaffPrivateProfile(teamUsername);
  if (!profile) {
    throw new StaffPrivateProfileError(
      "Private payment details have not been set up yet.",
      404,
      "NOT_FOUND",
    );
  }

  const expected = privateProfileAccessCode(
    profile.fullName,
    profile.details.phoneNumber ?? "",
  );
  if (!expected) {
    throw new StaffPrivateProfileError(
      "A phone number must be added by Finance before private details can be revealed.",
      409,
      "ACCESS_CODE_NOT_READY",
    );
  }

  const supplied = String(suppliedAccessCode ?? "")
    .toLocaleLowerCase()
    .replace(/\s/g, "");
  if (!safeEqual(supplied, expected)) {
    throw new StaffPrivateProfileError(
      "The private-details password is incorrect.",
      403,
      "INVALID_ACCESS_CODE",
    );
  }

  return profile.details;
}

export async function saveStaffPrivateProfile(
  profileId: string,
  details: StaffPrivateDetails,
) {
  const { error } = await adminClient().from("staff_private_profiles").upsert(
    {
      staff_profile_id: profileId,
      encrypted_details: encryptSecret(JSON.stringify(details)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "staff_profile_id" },
  );
  if (error) {
    throw new StaffPrivateProfileError(
      "Could not save the private profile.",
      503,
      "STORAGE_ERROR",
    );
  }
}

export async function getFinanceStaffPrivateProfiles() {
  const { data, error } = await adminClient()
    .from("profiles")
    .select("id, team_username, full_name, title")
    .eq("role", "staff")
    .not("team_username", "is", null)
    .order("full_name", { ascending: true });
  if (error) {
    throw new StaffPrivateProfileError(
      "Could not load staff profiles.",
      503,
      "STORAGE_ERROR",
    );
  }

  return Promise.all(
    (data ?? []).map(async (profile) => {
      const privateProfile = await getStaffPrivateProfile(profile.team_username);
      return {
        profileId: profile.id,
        teamUsername: profile.team_username,
        name: profile.full_name,
        title: profile.title,
        details: privateProfile?.details ?? null,
      };
    }),
  );
}

function requiredText(value: unknown, label: string, maximum = 160) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  if (!cleaned || cleaned.length > maximum) {
    throw new StaffPrivateProfileError(
      `${label} is required and must be ${maximum} characters or fewer.`,
      422,
      "INVALID_INPUT",
    );
  }
  return cleaned;
}

export function validateStaffPrivateDetails(
  input: Record<string, unknown>,
): StaffPrivateDetails {
  const address =
    input.payeeAddress && typeof input.payeeAddress === "object"
      ? (input.payeeAddress as Record<string, unknown>)
      : {};
  const phoneNumber = requiredText(input.phoneNumber, "Phone number", 40);
  if (phoneNumber.replace(/\D/g, "").length < 7) {
    throw new StaffPrivateProfileError(
      "Enter a valid phone number.",
      422,
      "INVALID_INPUT",
    );
  }
  return {
    legalName: requiredText(input.legalName, "Legal name"),
    phoneNumber,
    payeeAddress: {
      line1: requiredText(address.line1, "Address"),
      line2:
        typeof address.line2 === "string" && address.line2.trim()
          ? address.line2.trim().slice(0, 160)
          : null,
      city: requiredText(address.city, "City", 100),
      province: requiredText(address.province, "Province", 80),
      postalCode: requiredText(address.postalCode, "Postal code", 24),
      country: requiredText(address.country, "Country", 80),
    },
    bankName: requiredText(input.bankName, "Bank name"),
    swiftCode: requiredText(input.swiftCode, "SWIFT code", 24),
    accountNumber: requiredText(input.accountNumber, "Account number", 48),
    institutionNumber: requiredText(
      input.institutionNumber,
      "Institution number",
      24,
    ),
    branchAddress:
      typeof input.branchAddress === "string" && input.branchAddress.trim()
        ? input.branchAddress.trim().slice(0, 240)
        : null,
  };
}

export function staffPrivateProfileRouteError(caught: unknown) {
  if (caught instanceof StaffPrivateProfileError) {
    return Response.json(
      { error: caught.message, code: caught.code },
      { status: caught.status },
    );
  }
  return Response.json(
    { error: "The private profile service could not complete the request." },
    { status: 500 },
  );
}
