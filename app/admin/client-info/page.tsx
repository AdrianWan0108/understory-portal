"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "../_components/AdminContext";
import {
  AdminButton,
  AdminMessage,
  AdminPageHeader,
  inputClass,
} from "../_components/AdminUi";

type ClientProfileFields = {
  industry: string;
  founded: string;
  location: string;
  website: string;
  overview: string;
  owner_name: string;
  owner_role: string;
  owner_contact: string;
  owner_bio: string;
  target_audience: string;
  unique_value_prop: string;
  marketing_channels: string;
  competitors: string;
  brand_voice: string;
  goals: string;
  challenges: string;
  notes: string;
};

const EMPTY_PROFILE: ClientProfileFields = {
  industry: "",
  founded: "",
  location: "",
  website: "",
  overview: "",
  owner_name: "",
  owner_role: "",
  owner_contact: "",
  owner_bio: "",
  target_audience: "",
  unique_value_prop: "",
  marketing_channels: "",
  competitors: "",
  brand_voice: "",
  goals: "",
  challenges: "",
  notes: "",
};

type FieldConfig = {
  key: keyof ClientProfileFields;
  label: string;
  placeholder?: string;
  multiline?: boolean;
};

const GROUPS: Array<{
  title: string;
  description: string;
  fields: FieldConfig[];
}> = [
  {
    title: "Business",
    description: "Core details shown in the client profile.",
    fields: [
      { key: "industry", label: "Industry", placeholder: "e.g. Boutique pilates studio" },
      { key: "founded", label: "Founded", placeholder: "e.g. 2019" },
      { key: "location", label: "Location", placeholder: "City, region" },
      { key: "website", label: "Website", placeholder: "https://…" },
      { key: "overview", label: "Business overview", multiline: true },
    ],
  },
  {
    title: "Owner",
    description: "Who runs the client business and how to reach them.",
    fields: [
      { key: "owner_name", label: "Owner name" },
      { key: "owner_role", label: "Owner role" },
      { key: "owner_contact", label: "Owner contact" },
      { key: "owner_bio", label: "Owner background", multiline: true },
    ],
  },
  {
    title: "Marketing & business insights",
    description: "Working context available to the team.",
    fields: [
      { key: "target_audience", label: "Target audience", multiline: true },
      { key: "unique_value_prop", label: "Unique value proposition", multiline: true },
      { key: "marketing_channels", label: "Marketing channels", multiline: true },
      { key: "competitors", label: "Competitors", multiline: true },
      { key: "brand_voice", label: "Brand voice & tone", multiline: true },
    ],
  },
  {
    title: "Planning notes",
    description: "Goals, blockers, and other useful context.",
    fields: [
      { key: "goals", label: "Goals", multiline: true },
      { key: "challenges", label: "Challenges", multiline: true },
      { key: "notes", label: "Additional notes", multiline: true },
    ],
  },
];

export default function AdminClientInfoPage() {
  const { clientId, clientName } = useAdmin();
  const [profile, setProfile] = useState<ClientProfileFields>(EMPTY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!clientId) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const { data, error: loadError } = await supabase
      .from("client_profiles")
      .select(Object.keys(EMPTY_PROFILE).join(", "))
      .eq("client_id", clientId)
      .maybeSingle();

    if (loadError) {
      setError(`Could not load client info: ${loadError.message}`);
    } else {
      const nextProfile = { ...EMPTY_PROFILE };
      const row = data as Partial<
        Record<keyof ClientProfileFields, string | null>
      > | null;
      if (row) {
        (Object.keys(EMPTY_PROFILE) as Array<keyof ClientProfileFields>).forEach(
          (key) => {
            nextProfile[key] =
              typeof row[key] === "string" ? row[key] : "";
          },
        );
      }
      setProfile(nextProfile);
    }
    setIsLoading(false);
  }, [clientId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientId || isSaving) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    const values = Object.fromEntries(
      Object.entries(profile).map(([key, value]) => [
        key,
        value.trim() || null,
      ]),
    );
    const { error: saveError } = await supabase.from("client_profiles").upsert(
      {
        client_id: clientId,
        ...values,
        updated_by: "Understory admin",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    );
    setIsSaving(false);

    if (saveError) {
      setError(`Could not save client info: ${saveError.message}`);
      return;
    }
    setSuccess("Client info saved.");
  }

  return (
    <main className="p-5 sm:p-7 lg:p-9">
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          title="Client info"
          description={`Edit the business profile, owner details, and working context for ${clientName ?? "this client"}.`}
        />

        <AdminMessage error={error} success={success} />

        {isLoading ? (
          <div className="mt-7 h-96 animate-pulse rounded-[24px] border border-[#D7CBE0] bg-white" />
        ) : (
          <form onSubmit={saveProfile} className="mt-7 space-y-6">
            {GROUPS.map((group) => (
              <section
                key={group.title}
                className="rounded-[24px] border border-[#D7CBE0] bg-white p-5 shadow-[0_8px_28px_rgba(40,21,79,0.055)] sm:p-6"
              >
                <h2 className="text-lg font-semibold text-[#341F60]">
                  {group.title}
                </h2>
                <p className="mt-1 text-sm text-[#8B7895]">
                  {group.description}
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {group.fields.map((field) => (
                    <label
                      key={field.key}
                      className={`text-xs font-semibold text-[#341F60] ${
                        field.multiline ? "sm:col-span-2" : ""
                      }`}
                    >
                      {field.label}
                      {field.multiline ? (
                        <textarea
                          rows={4}
                          value={profile[field.key]}
                          onChange={(event) =>
                            setProfile((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          placeholder={field.placeholder}
                          className={`mt-2 resize-y ${inputClass}`}
                        />
                      ) : (
                        <input
                          value={profile[field.key]}
                          onChange={(event) =>
                            setProfile((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          placeholder={field.placeholder}
                          className={`mt-2 ${inputClass}`}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}

            <div className="sticky bottom-4 flex justify-end rounded-2xl border border-[#D7CBE0] bg-white/95 p-3 shadow-[0_12px_35px_rgba(40,21,79,0.14)] backdrop-blur">
              <AdminButton type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save client info"}
              </AdminButton>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
