"use client";

import { useEffect, useState } from "react";
import { TeamButton, teamInputClass } from "./TeamHubUi";

type PrivateDetails = {
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

type Meta = {
  configured: boolean;
  phoneMasked?: string | null;
  accessCodeReady?: boolean;
  error?: string;
};

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-2xl bg-[#F7F1FA] p-4">
      <dt className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-semibold leading-6 text-[#341F60]">
        {value || "Not on file"}
      </dd>
    </div>
  );
}

export function PrivateProfileCard() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [details, setDetails] = useState<PrivateDetails | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevealing, setIsRevealing] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/team-hub/private-profile", {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as Meta;
        if (!active) return;
        if (!response.ok) throw new Error(body.error || "Could not check private details.");
        setMeta(body);
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not check private details.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function reveal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessCode || isRevealing) return;
    setIsRevealing(true);
    setError(null);
    try {
      const response = await fetch("/api/team-hub/private-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        details?: PrivateDetails;
        error?: string;
      };
      if (!response.ok || !body.details) {
        throw new Error(body.error || "Could not reveal private details.");
      }
      setDetails(body.details);
      setAccessCode("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reveal private details.",
      );
    } finally {
      setIsRevealing(false);
    }
  }

  return (
    <section className="mt-8 rounded-[24px] border border-[#D7CBE0] bg-white p-5 shadow-[0_8px_28px_rgba(40,21,79,0.055)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7D4698]">
            Private &amp; read-only
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[#341F60]">
            Contact &amp; payment details
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#75647F]">
            Hidden by default. Staff can reveal their own information, but only Finance can change it.
          </p>
        </div>
        {details && (
          <TeamButton
            type="button"
            tone="secondary"
            onClick={() => setDetails(null)}
          >
            Hide details
          </TeamButton>
        )}
      </div>

      {isLoading ? (
        <div className="mt-5 h-28 animate-pulse rounded-2xl bg-[#EEE3FA]" />
      ) : error && !details ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
        >
          {error}
        </p>
      ) : !meta?.configured ? (
        <p className="mt-5 rounded-xl border border-[#E2D6E8] bg-[#FAF7FC] px-4 py-3 text-sm text-[#75647F]">
          Finance has not added private payment details for this profile yet.
        </p>
      ) : details ? (
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-[#341F60]">Personal details</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Detail label="Legal name" value={details.legalName} />
              <Detail label="Phone number" value={details.phoneNumber} />
              <div className="sm:col-span-2">
                <Detail
                  label="Address"
                  value={[
                    details.payeeAddress.line1,
                    details.payeeAddress.line2,
                    `${details.payeeAddress.city}, ${details.payeeAddress.province} ${details.payeeAddress.postalCode}`,
                    details.payeeAddress.country,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                />
              </div>
            </dl>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#341F60]">Bank details</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Detail label="Bank" value={details.bankName} />
              <Detail label="Institution number" value={details.institutionNumber} />
              <Detail label="SWIFT code" value={details.swiftCode} />
              <Detail label="Account number" value={details.accountNumber} />
            </dl>
          </div>
        </div>
      ) : meta.accessCodeReady ? (
        <form onSubmit={reveal} className="mt-5 rounded-2xl border border-[#E2D6E8] bg-[#FAF7FC] p-4">
          <label className="block text-xs font-semibold text-[#341F60]">
            Private-details password
            <input
              type="password"
              autoComplete="current-password"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder="Your name + phone last 4 digits"
              className={`mt-2 ${teamInputClass}`}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[#8B7895]">
              Phone on file: {meta.phoneMasked}
            </p>
            <TeamButton type="submit" disabled={!accessCode || isRevealing}>
              {isRevealing ? "Checking…" : "Show my details"}
            </TeamButton>
          </div>
        </form>
      ) : (
        <p className="mt-5 rounded-xl border border-[#E5C760] bg-[#FFF9DF] px-4 py-3 text-sm text-[#725A00]">
          Finance must add a phone number before your default private-details password can be activated.
        </p>
      )}
    </section>
  );
}
