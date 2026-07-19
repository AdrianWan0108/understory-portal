"use client";

/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTeamIdentity } from "../../_components/TeamIdentity";
import { TeamButton, teamInputClass } from "../../_components/TeamHubUi";

const BUCKET = "client-profile-photos";

type ClientRow = {
  id: string;
  name: string;
  slug: string;
};

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

const EMPTY_FIELDS: ClientProfileFields = {
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

type ClientProfileRow = ClientProfileFields & {
  id: string;
  client_id: string;
  updated_by: string | null;
  updated_at: string;
};

type IconName =
  | "back"
  | "edit"
  | "business"
  | "calendar"
  | "mapPin"
  | "link"
  | "overview"
  | "owner"
  | "mail"
  | "insights"
  | "target"
  | "spark"
  | "megaphone"
  | "flag"
  | "message"
  | "goal"
  | "challenge"
  | "note"
  | "camera"
  | "plus"
  | "trash";

function InfoIcon({
  name,
  className = "size-4",
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    back: <path d="M15 5 8 12l7 7" />,
    edit: (
      <>
        <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
        <path d="M13.5 7.5l3 3" />
      </>
    ),
    business: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M3 12h18" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
    mapPin: (
      <>
        <path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z" />
        <circle cx="12" cy="9.5" r="2.2" />
      </>
    ),
    link: (
      <>
        <path d="M10 6l1.4-1.4a4 4 0 0 1 5.7 5.7L15.6 11.7" />
        <path d="M14 18l-1.4 1.4a4 4 0 0 1-5.7-5.7L8.4 12.3" />
        <path d="M9 15 15 9" />
      </>
    ),
    overview: (
      <>
        <path d="M6 3h9l3 3v15H6Z" />
        <path d="M15 3v4h4M9 12h6M9 16h6" />
      </>
    ),
    owner: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    insights: (
      <>
        <path d="M4 19h16" />
        <path d="M7 19v-5M12 19V7M17 19v-9" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
      </>
    ),
    spark: <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4Z" />,
    megaphone: (
      <>
        <path d="M3 10v4a1 1 0 0 0 1 1h2l4 4V5L6 9H4a1 1 0 0 0-1 1Z" />
        <path d="M17 8a4 4 0 0 1 0 8" />
      </>
    ),
    flag: (
      <>
        <path d="M5 3v18" />
        <path d="M5 4h11l-2 4 2 4H5Z" />
      </>
    ),
    message: <path d="M4 5h16v11H8l-4 4Z" />,
    goal: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.5 2.5L16 9" />
      </>
    ),
    challenge: (
      <>
        <path d="M12 3 2 20h20Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
    note: (
      <>
        <path d="M5 4h14v12l-4 4H5Z" />
        <path d="M15 16v4l4-4Z" />
      </>
    ),
    camera: (
      <>
        <path d="M4 8h3l1.5-2h7L17 8h3v11H4Z" />
        <circle cx="12" cy="13.5" r="3.3" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

type FieldConfig = {
  key: keyof ClientProfileFields;
  label: string;
  placeholder?: string;
  type?: "input" | "textarea";
};

const FIELD_GROUPS: Array<{
  title: string;
  description?: string;
  icon: IconName;
  fields: FieldConfig[];
}> = [
  {
    title: "Business",
    icon: "business",
    fields: [
      { key: "industry", label: "Industry", placeholder: "e.g. Boutique pilates studio" },
      { key: "founded", label: "Founded", placeholder: "e.g. 2019" },
      { key: "location", label: "Location", placeholder: "City, region" },
      { key: "website", label: "Website", placeholder: "https://…" },
    ],
  },
  {
    title: "Who they are",
    description: "The deep-dive: history, positioning, what matters about this business.",
    icon: "overview",
    fields: [{ key: "overview", label: "Overview", type: "textarea" }],
  },
  {
    title: "Owner",
    description: "Who runs the business day-to-day.",
    icon: "owner",
    fields: [
      { key: "owner_name", label: "Owner name" },
      { key: "owner_role", label: "Owner role", placeholder: "e.g. Founder & lead esthetician" },
      { key: "owner_contact", label: "Owner contact", placeholder: "Email or phone" },
      { key: "owner_bio", label: "Owner background", type: "textarea" },
    ],
  },
  {
    title: "Marketing & business insights",
    description: "Context the whole team should know before doing the work.",
    icon: "insights",
    fields: [
      { key: "target_audience", label: "Target audience", type: "textarea" },
      { key: "unique_value_prop", label: "Unique value proposition", type: "textarea" },
      { key: "marketing_channels", label: "Marketing channels in use", type: "textarea" },
      { key: "competitors", label: "Competitors", type: "textarea" },
      { key: "brand_voice", label: "Brand voice & tone", type: "textarea" },
    ],
  },
  {
    title: "Goals & challenges",
    icon: "goal",
    fields: [
      { key: "goals", label: "Goals", type: "textarea" },
      { key: "challenges", label: "Challenges", type: "textarea" },
    ],
  },
  {
    title: "Notes",
    icon: "note",
    fields: [{ key: "notes", label: "Additional notes", type: "textarea" }],
  },
];

const INSIGHT_ICONS: Partial<Record<keyof ClientProfileFields, IconName>> = {
  target_audience: "target",
  unique_value_prop: "spark",
  marketing_channels: "megaphone",
  competitors: "flag",
  brand_voice: "message",
};

const INSIGHT_FIELDS = FIELD_GROUPS.find(
  (group) => group.title === "Marketing & business insights",
)!.fields;

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function contactHref(value: string) {
  if (value.includes("@")) return `mailto:${value}`;
  if (/^[+\d][\d\s().-]{4,}$/.test(value)) return `tel:${value.replace(/[\s().-]/g, "")}`;
  return null;
}

type ClientPhoto = {
  id: string;
  client_id: string;
  photo_url: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
};

function storagePath(url: string) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  try {
    const parsed = new URL(url);
    const index = parsed.pathname.indexOf(marker);
    return index < 0
      ? null
      : decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

function PhotoCaptionField({
  photo,
  onSave,
}: {
  photo: ClientPhoto;
  onSave: (caption: string) => void;
}) {
  const [value, setValue] = useState(photo.caption ?? "");

  return (
    <input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value.trim() !== (photo.caption ?? "")) onSave(value.trim());
      }}
      placeholder="Add a caption"
      className="w-full rounded-lg border border-[#E5DBEA] bg-[#FFFDF8] px-2.5 py-1.5 text-xs text-[#341F60] placeholder:text-[#B6A6BF] focus:border-[#7D4698] focus:outline-none"
    />
  );
}

export default function TeamHubClientInfoDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { username } = useTeamIdentity();

  const [client, setClient] = useState<ClientRow | null>(null);
  const [profile, setProfile] = useState<ClientProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ClientProfileFields>(EMPTY_FIELDS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [photos, setPhotos] = useState<ClientPhoto[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [deletePhotoId, setDeletePhotoId] = useState<string | null>(null);

  const loadClient = useCallback(async () => {
    setIsLoading(true);
    const { data: clientRow, error: clientError } = await supabase
      .from("clients")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();

    if (clientError || !clientRow) {
      setLoadError(clientError?.message ?? "Client not found.");
      setIsLoading(false);
      return;
    }
    setClient(clientRow);

    const { data: profileRow, error: profileError } = await supabase
      .from("client_profiles")
      .select(
        "id, client_id, industry, founded, location, website, overview, owner_name, owner_role, owner_contact, owner_bio, target_audience, unique_value_prop, marketing_channels, competitors, brand_voice, goals, challenges, notes, updated_by, updated_at",
      )
      .eq("client_id", clientRow.id)
      .maybeSingle();

    if (profileError) {
      setLoadError(`Could not load client info: ${profileError.message}`);
    } else {
      setProfile(profileRow as ClientProfileRow | null);
      setLoadError(null);
    }
    setIsLoading(false);
  }, [slug]);

  useEffect(() => {
    void loadClient();
  }, [loadClient]);

  const loadPhotos = useCallback(async () => {
    if (!client) return;
    setIsLoadingPhotos(true);
    const { data, error } = await supabase
      .from("client_profile_photos")
      .select("id, client_id, photo_url, caption, uploaded_by, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });
    if (error) {
      setPhotoError(`Could not load photos: ${error.message}`);
    } else {
      setPhotos((data ?? []) as ClientPhoto[]);
      setPhotoError(null);
    }
    setIsLoadingPhotos(false);
  }, [client]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  function startEditing() {
    setDraft(profile ? { ...EMPTY_FIELDS, ...profile } : EMPTY_FIELDS);
    setSaveError(null);
    setIsEditing(true);
  }

  async function saveProfile() {
    if (!client || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    const payload = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, value.trim() || null]),
    );
    const { data, error } = await supabase
      .from("client_profiles")
      .upsert(
        {
          client_id: client.id,
          ...payload,
          updated_by: username,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id" },
      )
      .select(
        "id, client_id, industry, founded, location, website, overview, owner_name, owner_role, owner_contact, owner_bio, target_audience, unique_value_prop, marketing_channels, competitors, brand_voice, goals, challenges, notes, updated_by, updated_at",
      )
      .single();
    setIsSaving(false);

    if (error || !data) {
      setSaveError(error?.message ?? "Could not save client info.");
      return;
    }
    setProfile(data as ClientProfileRow);
    setIsEditing(false);
  }

  async function uploadPhotos(files: FileList | null) {
    if (!client || !files || files.length === 0) return;
    setIsUploadingPhoto(true);
    setPhotoError(null);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          throw new Error("Only image files can be uploaded.");
        }
        const path = `${client.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const photoUrl = supabase.storage.from(BUCKET).getPublicUrl(path)
          .data.publicUrl;
        const { error: insertError } = await supabase
          .from("client_profile_photos")
          .insert({
            client_id: client.id,
            photo_url: photoUrl,
            uploaded_by: username,
          });
        if (insertError) throw insertError;
      }
      void loadPhotos();
    } catch (caught) {
      setPhotoError(
        caught instanceof Error ? caught.message : "Could not upload photo.",
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function saveCaption(photo: ClientPhoto, caption: string) {
    const { error } = await supabase
      .from("client_profile_photos")
      .update({ caption: caption || null })
      .eq("id", photo.id);
    if (error) {
      setPhotoError(error.message);
      return;
    }
    setPhotos((current) =>
      current.map((candidate) =>
        candidate.id === photo.id
          ? { ...candidate, caption: caption || null }
          : candidate,
      ),
    );
  }

  async function deletePhoto(photo: ClientPhoto) {
    if (deletePhotoId !== photo.id) {
      setDeletePhotoId(photo.id);
      return;
    }
    const { error } = await supabase
      .from("client_profile_photos")
      .delete()
      .eq("id", photo.id);
    if (error) {
      setPhotoError(error.message);
      return;
    }
    const path = storagePath(photo.photo_url);
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    setDeletePhotoId(null);
    void loadPhotos();
  }

  if (isLoading) {
    return (
      <main className="px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="h-56 animate-pulse rounded-[28px] bg-[#EEE3FA]" />
          <div className="h-64 animate-pulse rounded-[24px] bg-[#EEE3FA]" />
        </div>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl rounded-[24px] border border-[#E4B9B9] bg-[#FFF0F0] px-6 py-8 text-sm text-[#8B3E3E]">
          {loadError ?? "Client not found."}
        </div>
        <Link
          href="/team-hub/client-info"
          className="mt-5 inline-block text-xs font-semibold text-[#7D4698] hover:underline"
        >
          ← Back to Client info
        </Link>
      </main>
    );
  }

  const coverPhoto = photos.length ? photos[photos.length - 1] : null;
  const businessChips: Array<{ icon: IconName; value: string; href?: string }> = [
    profile?.industry ? { icon: "business", value: profile.industry } : null,
    profile?.location ? { icon: "mapPin", value: profile.location } : null,
    profile?.founded ? { icon: "calendar", value: `Since ${profile.founded}` } : null,
    profile?.website
      ? {
          icon: "link",
          value: profile.website.replace(/^https?:\/\//, ""),
          href: profile.website.startsWith("http")
            ? profile.website
            : `https://${profile.website}`,
        }
      : null,
  ].filter((chip): chip is { icon: IconName; value: string; href?: string } => Boolean(chip));

  const insightsWithContent = INSIGHT_FIELDS.filter((field) => profile?.[field.key]);
  const ownerHasContent = Boolean(
    profile?.owner_name || profile?.owner_role || profile?.owner_contact || profile?.owner_bio,
  );
  const ownerContactHref = profile?.owner_contact ? contactHref(profile.owner_contact) : null;

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/team-hub/client-info"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7D4698] hover:underline"
        >
          <InfoIcon name="back" className="size-3.5" />
          Client info
        </Link>

        {loadError && (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
          >
            {loadError}
          </div>
        )}

        {/* Hero */}
        <section className="relative mt-3 overflow-hidden rounded-[28px] border border-[#D7CBE0] bg-gradient-to-br from-[#341F60] to-[#7D4698]">
          {coverPhoto && (
            <img
              src={coverPhoto.photo_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-60"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#1B1033] via-[#1B1033]/50 to-transparent" />
          <div className="relative flex min-h-[220px] flex-col justify-end gap-5 p-6 sm:p-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F4CE45]">
                  Client info
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                  {client.name}
                </h1>
                {businessChips.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {businessChips.map((chip) =>
                      chip.href ? (
                        <a
                          key={chip.icon + chip.value}
                          href={chip.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur transition hover:bg-white/20"
                        >
                          <InfoIcon name={chip.icon} className="size-3.5" />
                          {chip.value}
                        </a>
                      ) : (
                        <span
                          key={chip.icon + chip.value}
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur"
                        >
                          <InfoIcon name={chip.icon} className="size-3.5" />
                          {chip.value}
                        </span>
                      ),
                    )}
                  </div>
                )}
                {profile?.updated_at && (
                  <p className="mt-3 text-[11px] text-white/60">
                    Last updated{" "}
                    {new Date(profile.updated_at).toLocaleDateString("en-CA")}
                    {profile.updated_by ? ` by ${profile.updated_by}` : ""}
                  </p>
                )}
              </div>
              {!isEditing && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-semibold text-[#341F60] shadow-lg transition hover:bg-[#F4CE45]"
                >
                  <InfoIcon name="edit" className="size-3.5" />
                  Edit info
                </button>
              )}
            </div>
          </div>
        </section>

        {isEditing ? (
          <section className="mt-6 rounded-[24px] border border-[#D7CBE0] bg-white p-5 shadow-[0_8px_28px_rgba(40,21,79,0.055)] sm:p-6">
            {saveError && (
              <p
                role="alert"
                className="mb-5 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
              >
                {saveError}
              </p>
            )}
            <div className="space-y-8">
              {FIELD_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="flex items-center gap-2 text-[#7D4698]">
                    <InfoIcon name={group.icon} className="size-4" />
                    <h3 className="text-sm font-semibold text-[#341F60]">
                      {group.title}
                    </h3>
                  </div>
                  {group.description && (
                    <p className="mt-1 text-xs text-[#8B7895]">
                      {group.description}
                    </p>
                  )}
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {group.fields.map((field) => (
                      <label
                        key={field.key}
                        className={`text-xs font-semibold text-[#341F60] ${
                          field.type === "textarea" ? "sm:col-span-2" : ""
                        }`}
                      >
                        {field.label}
                        {field.type === "textarea" ? (
                          <textarea
                            rows={3}
                            value={draft[field.key]}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                [field.key]: event.target.value,
                              })
                            }
                            placeholder={field.placeholder}
                            className={`mt-2 resize-y ${teamInputClass}`}
                          />
                        ) : (
                          <input
                            value={draft[field.key]}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                [field.key]: event.target.value,
                              })
                            }
                            placeholder={field.placeholder}
                            className={`mt-2 ${teamInputClass}`}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-col-reverse gap-2 border-t border-[#E7DDEA] pt-5 sm:flex-row sm:justify-end">
              <TeamButton
                type="button"
                tone="secondary"
                disabled={isSaving}
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </TeamButton>
              <TeamButton
                type="button"
                disabled={isSaving}
                onClick={() => void saveProfile()}
              >
                {isSaving ? "Saving…" : "Save client info"}
              </TeamButton>
            </div>
          </section>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Overview */}
            <section className="rounded-[24px] border border-[#D7CBE0] bg-white p-6 shadow-[0_8px_28px_rgba(40,21,79,0.055)] sm:p-8">
              <div className="flex items-center gap-2 text-[#7D4698]">
                <InfoIcon name="overview" className="size-4" />
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]">
                  Who they are
                </p>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-[#28154F] sm:text-lg">
                {profile?.overview || (
                  <span className="text-sm font-normal leading-6 text-[#8B7895]">
                    No research written yet. Click “Edit info” to add the
                    story behind this business.
                  </span>
                )}
              </p>
            </section>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Marketing & business insights */}
              <section className="rounded-[24px] border border-[#D7CBE0] bg-white p-6 shadow-[0_8px_28px_rgba(40,21,79,0.055)] lg:col-span-2">
                <div className="flex items-center gap-2 text-[#7D4698]">
                  <InfoIcon name="insights" className="size-4" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em]">
                    Marketing & business insights
                  </p>
                </div>
                {insightsWithContent.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {insightsWithContent.map((field) => (
                      <div
                        key={field.key}
                        className="rounded-2xl border border-[#EDE3F2] bg-[#FBF8FD] p-4"
                      >
                        <div className="flex items-center gap-1.5 text-[#5F3378]">
                          <InfoIcon
                            name={INSIGHT_ICONS[field.key] ?? "spark"}
                            className="size-3.5"
                          />
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em]">
                            {field.label}
                          </p>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#28154F]">
                          {profile?.[field.key]}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#8B7895]">
                    No marketing insights documented yet.
                  </p>
                )}
              </section>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Owner */}
                <section className="rounded-[24px] border border-[#D7CBE0] bg-white p-6 shadow-[0_8px_28px_rgba(40,21,79,0.055)]">
                  <div className="flex items-center gap-2 text-[#7D4698]">
                    <InfoIcon name="owner" className="size-4" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em]">
                      Owner
                    </p>
                  </div>
                  {ownerHasContent ? (
                    <>
                      <div className="mt-3 flex items-center gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#341F60] text-sm font-semibold text-white">
                          {initialsFor(profile?.owner_name || client.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#341F60]">
                            {profile?.owner_name || "Name not documented"}
                          </p>
                          <p className="truncate text-xs text-[#8B7895]">
                            {profile?.owner_role || "Role not documented"}
                          </p>
                        </div>
                      </div>
                      {profile?.owner_contact &&
                        (ownerContactHref ? (
                          <a
                            href={ownerContactHref}
                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#7D4698] hover:underline"
                          >
                            <InfoIcon name="mail" className="size-3.5" />
                            {profile.owner_contact}
                          </a>
                        ) : (
                          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#7D4698]">
                            <InfoIcon name="mail" className="size-3.5" />
                            {profile.owner_contact}
                          </p>
                        ))}
                      {profile?.owner_bio && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#75647F]">
                          {profile.owner_bio}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-[#8B7895]">
                      Owner details not documented yet.
                    </p>
                  )}
                </section>

                {/* Goals */}
                {profile?.goals && (
                  <section className="rounded-[24px] border border-[#BFD8C7] bg-[#EDF7EF] p-5">
                    <div className="flex items-center gap-2 text-[#356346]">
                      <InfoIcon name="goal" className="size-4" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em]">
                        Goals
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#2B4F3A]">
                      {profile.goals}
                    </p>
                  </section>
                )}

                {/* Challenges */}
                {profile?.challenges && (
                  <section className="rounded-[24px] border border-[#E5C760] bg-[#FFF4C7] p-5">
                    <div className="flex items-center gap-2 text-[#725A00]">
                      <InfoIcon name="challenge" className="size-4" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em]">
                        Challenges
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#5C4A00]">
                      {profile.challenges}
                    </p>
                  </section>
                )}

                {/* Notes */}
                {profile?.notes && (
                  <section className="rounded-[24px] border border-[#EAD9A8] bg-[#FFFCF3] p-5">
                    <div className="flex items-center gap-2 text-[#8B6F1F]">
                      <InfoIcon name="note" className="size-4" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em]">
                        Notes
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#5C4A1F]">
                      {profile.notes}
                    </p>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Photos */}
        <section className="mt-6 rounded-[24px] border border-[#D7CBE0] bg-white p-5 shadow-[0_8px_28px_rgba(40,21,79,0.055)] sm:p-6">
          <div className="flex items-center gap-2 text-[#7D4698]">
            <InfoIcon name="camera" className="size-4" />
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]">
              Photos of the business
            </p>
          </div>
          <p className="mt-1 text-xs text-[#8B7895]">
            Storefront, product, team — anything that helps the team picture
            the business.
          </p>

          {photoError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
            >
              {photoError}
            </p>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#CDBAD9] text-[#7D4698] transition hover:border-[#7D4698] hover:bg-[#F7F1FB]">
              {isUploadingPhoto ? (
                <span className="text-xs font-semibold">Uploading…</span>
              ) : (
                <>
                  <span className="flex size-9 items-center justify-center rounded-full bg-[#EEE3FA]">
                    <InfoIcon name="plus" className="size-4" />
                  </span>
                  <span className="text-xs font-semibold">Add photos</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={isUploadingPhoto}
                onChange={(event) => {
                  void uploadPhotos(event.target.files);
                  event.target.value = "";
                }}
                className="hidden"
              />
            </label>

            {isLoadingPhotos ? (
              <div className="aspect-[4/3] animate-pulse rounded-2xl bg-[#EEE3FA]" />
            ) : (
              photos.map((photo) => (
                <figure
                  key={photo.id}
                  className="group relative overflow-hidden rounded-2xl border border-[#D7CBE0] bg-[#FFFDF8]"
                >
                  <img
                    src={photo.photo_url}
                    alt={photo.caption || client.name}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => void deletePhoto(photo)}
                    className={`absolute right-2 top-2 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-semibold text-white shadow transition ${
                      deletePhotoId === photo.id
                        ? "bg-[#9A4040]"
                        : "bg-black/45 opacity-0 backdrop-blur hover:bg-[#9A4040] group-hover:opacity-100"
                    }`}
                  >
                    <InfoIcon name="trash" className="size-3" />
                    {deletePhotoId === photo.id ? "Confirm?" : ""}
                  </button>
                  <div className="p-2.5">
                    <PhotoCaptionField
                      photo={photo}
                      onSave={(caption) => void saveCaption(photo, caption)}
                    />
                    <p className="mt-1.5 text-[10px] text-[#8B7895]">
                      {photo.uploaded_by || "Team"}
                    </p>
                  </div>
                </figure>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
