"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import {
  TeamButton,
  TeamModal,
  teamInputClass,
} from "@/app/team-hub/_components/TeamHubUi";

type Details = {
  legalName: string;
  phoneNumber: string;
  payeeAddress: {
    line1: string;
    line2: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
  bankName: string;
  swiftCode: string;
  accountNumber: string;
  institutionNumber: string;
  branchAddress: string;
};

type StaffProfile = {
  profileId: string;
  teamUsername: string;
  name: string;
  title: string | null;
  details: Details | null;
};

function editorDetails(profile: StaffProfile): Details {
  return {
    legalName: profile.details?.legalName ?? profile.name,
    phoneNumber: profile.details?.phoneNumber ?? "",
    payeeAddress: {
      line1: profile.details?.payeeAddress.line1 ?? "",
      line2: profile.details?.payeeAddress.line2 ?? "",
      city: profile.details?.payeeAddress.city ?? "",
      province: profile.details?.payeeAddress.province ?? "",
      postalCode: profile.details?.payeeAddress.postalCode ?? "",
      country: profile.details?.payeeAddress.country ?? "Canada",
    },
    bankName: profile.details?.bankName ?? "",
    swiftCode: profile.details?.swiftCode ?? "",
    accountNumber: profile.details?.accountNumber ?? "",
    institutionNumber: profile.details?.institutionNumber ?? "",
    branchAddress: profile.details?.branchAddress ?? "",
  };
}

export function PaymentProfilesPanel() {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [editor, setEditor] = useState<{
    profile: StaffProfile;
    details: Details;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/team-hub/finance/private-profiles", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        profiles?: StaffProfile[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Could not load payment profiles.");
      }
      setProfiles(body.profiles ?? []);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load payment profiles.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!editor || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/team-hub/finance/private-profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: editor.profile.profileId,
          ...editor.details,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Could not save the payment profile.");
      }
      setEditor(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save the payment profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function update(field: keyof Omit<Details, "payeeAddress">, value: string) {
    setEditor((current) =>
      current
        ? { ...current, details: { ...current.details, [field]: value } }
        : current,
    );
  }

  function updateAddress(
    field: keyof Details["payeeAddress"],
    value: string,
  ) {
    setEditor((current) =>
      current
        ? {
            ...current,
            details: {
              ...current.details,
              payeeAddress: {
                ...current.details.payeeAddress,
                [field]: value,
              },
            },
          }
        : current,
    );
  }

  return (
    <>
      <section className="mt-8 overflow-hidden rounded-[26px] border border-[#D7CBE0] bg-white shadow-[0_10px_34px_rgba(40,21,79,0.065)]">
        <header className="border-b border-[#E7DDEB] bg-[#FFFDF8] px-5 py-5 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7D4698]">
            Restricted payment data
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[#341F60]">
            Staff payment profiles
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#75647F]">
            Encrypted at rest. Staff can reveal their own record but cannot edit it.
          </p>
        </header>

        {error && (
          <p
            role="alert"
            className="m-5 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E] sm:m-6"
          >
            {error}
          </p>
        )}

        {isLoading ? (
          <div className="m-5 h-32 animate-pulse rounded-2xl bg-[#EEE3FA] sm:m-6" />
        ) : (
          <ul className="divide-y divide-[#E7DDEA]">
            {profiles.map((profile) => (
              <li
                key={profile.profileId}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6"
              >
                <div>
                  <p className="text-sm font-semibold text-[#341F60]">
                    {profile.name}
                  </p>
                  <p className="mt-1 text-xs text-[#8B7895]">
                    {profile.title || "Staff"} ·{" "}
                    {profile.details ? "Payment profile ready" : "Setup required"}
                  </p>
                </div>
                <TeamButton
                  type="button"
                  tone="secondary"
                  onClick={() =>
                    setEditor({ profile, details: editorDetails(profile) })
                  }
                >
                  {profile.details ? "Review / edit" : "Set up"}
                </TeamButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TeamModal
        open={Boolean(editor)}
        title={editor ? `${editor.profile.name} payment profile` : "Payment profile"}
        description="Only the fields Finance needs for invoicing and payment are stored."
        submitLabel="Save encrypted profile"
        isSaving={isSaving}
        onClose={() => setEditor(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {editor && (
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["legalName", "Legal name"],
              ["phoneNumber", "Phone number"],
              ["bankName", "Bank name"],
              ["institutionNumber", "Institution number"],
              ["swiftCode", "SWIFT code"],
              ["accountNumber", "Account number"],
            ] as const).map(([field, label]) => (
              <label key={field} className="text-xs font-semibold text-[#341F60]">
                {label}
                <input
                  value={editor.details[field]}
                  onChange={(event) => update(field, event.target.value)}
                  className={`mt-2 ${teamInputClass}`}
                  required
                />
              </label>
            ))}
            {([
              ["line1", "Address line 1"],
              ["line2", "Address line 2 (optional)"],
              ["city", "City"],
              ["province", "Province / state"],
              ["postalCode", "Postal code"],
              ["country", "Country"],
            ] as const).map(([field, label]) => (
              <label key={field} className="text-xs font-semibold text-[#341F60]">
                {label}
                <input
                  value={editor.details.payeeAddress[field]}
                  onChange={(event) => updateAddress(field, event.target.value)}
                  className={`mt-2 ${teamInputClass}`}
                  required={field !== "line2"}
                />
              </label>
            ))}
            <label className="text-xs font-semibold text-[#341F60] sm:col-span-2">
              Branch address (optional)
              <input
                value={editor.details.branchAddress}
                onChange={(event) => update("branchAddress", event.target.value)}
                className={`mt-2 ${teamInputClass}`}
              />
            </label>
          </div>
        )}
      </TeamModal>
    </>
  );
}
