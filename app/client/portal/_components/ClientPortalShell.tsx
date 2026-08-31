"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import understoryLogo from "@/public/under story logo-purple.png";
import {
  CLIENT_IDENTITIES,
  VALID_CLIENT_USERNAMES,
  ClientIdentityProvider,
  type ClientAccessLevel,
  type ClientIdentity,
  useClientIdentity,
} from "./ClientIdentity";

type NavIcon =
  | "dashboard"
  | "projects"
  | "analytics"
  | "approvals"
  | "gallery"
  | "invoices"
  | "documents"
  | "assets";

const navigation: Array<{
  href: string;
  label: string;
  icon: NavIcon;
  ownerOnly?: boolean;
}> = [
  {
    href: "/client-portal/dashboard",
    label: "Dashboard",
    icon: "dashboard",
  },
  {
    href: "/client-portal/projects",
    label: "Projects",
    icon: "projects",
  },
  {
    href: "/client-portal/analytics",
    label: "Analytics",
    icon: "analytics",
  },
  {
    href: "/client-portal/approvals",
    label: "Approvals",
    icon: "approvals",
  },
  {
    href: "/client-portal/gallery",
    label: "Gallery",
    icon: "gallery",
  },
  {
    href: "/client-portal/invoices",
    label: "Invoices",
    icon: "invoices",
    ownerOnly: true,
  },
  {
    href: "/client-portal/documents",
    label: "Documents",
    icon: "documents",
    ownerOnly: true,
  },
  {
    href: "/client-portal/assets",
    label: "Asset upload",
    icon: "assets",
  },
];

function PortalIcon({
  name,
  className = "size-5",
}: {
  name: NavIcon | "menu" | "close";
  className?: string;
}) {
  const paths = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    projects: (
      <>
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v8A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z" />
        <path d="M4 10h16" />
      </>
    ),
    analytics: (
      <>
        <path d="M4 19V10M10 19V5M16 19v-7M22 19V8" />
        <path d="M2 19h22" />
      </>
    ),
    approvals: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16M8 15l2 2 5-5" />
      </>
    ),
    gallery: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m4 17 5-5 3.5 3.5 2-2L20 19" />
      </>
    ),
    invoices: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    documents: (
      <>
        <path d="M7 3h7l4 4v14H7Z" />
        <path d="M14 3v5h5M10 13h5M10 17h5" />
      </>
    ),
    assets: (
      <>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
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

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="relative shrink-0">
        <Image
          src={understoryLogo}
          alt="Understory"
          className="size-10 rounded-xl"
          priority
        />
        <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-white bg-accent" />
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-wide text-foreground">
          Understory
        </span>
        <span className="block text-[9px] uppercase tracking-[0.22em] text-primary">
          Client portal
        </span>
      </span>
    </div>
  );
}

function PortalNavigation({
  pathname,
  accessLevel,
  onNavigate,
}: {
  pathname: string;
  accessLevel: ClientAccessLevel;
  onNavigate?: () => void;
}) {
  const visibleNavigation = navigation.filter(
    (item) => accessLevel === "owner" || !item.ownerOnly,
  );

  return (
    <nav aria-label="Client portal navigation" className="space-y-1.5">
      {visibleNavigation.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              isActive
                ? "bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(52,31,96,0.16)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <PortalIcon
              name={item.icon}
              className={`size-4.5 shrink-0 ${
                isActive ? "text-accent" : "text-primary"
              }`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function IdentityPicker({
  onChoose,
}: {
  onChoose: (identity: ClientIdentity) => void;
}) {
  const [username, setUsername] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function submitUsername(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUsername = username.trim().toLocaleLowerCase();
    const matchedUsername = VALID_CLIENT_USERNAMES.find(
      (validUsername) =>
        validUsername.toLocaleLowerCase() === normalizedUsername,
    );
    const matchedIdentity = (
      Object.keys(CLIENT_IDENTITIES) as ClientIdentity[]
    ).find(
      (identity) =>
        CLIENT_IDENTITIES[identity].username === matchedUsername,
    );

    if (!matchedIdentity) {
      setErrorMessage(
        "That username isn't recognized. Check with your Understory contact.",
      );
      return;
    }

    setErrorMessage(null);
    onChoose(matchedIdentity);
  }

  return (
    <div className="client-portal-theme fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-muted px-5 py-8 text-foreground">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#DCC7EE]/70 blur-3xl" />
        <div className="absolute -bottom-36 -left-24 h-[30rem] w-[30rem] rounded-full bg-[#FFF1B7]/75 blur-3xl" />
      </div>

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-identity-title"
        aria-describedby="portal-identity-description"
        className="relative w-full max-w-xl rounded-[28px] border border-white/80 bg-card p-6 shadow-[0_28px_90px_rgba(52,31,96,0.16)] sm:p-10"
      >
        <div className="mx-auto mb-7 flex size-12 items-center justify-center rounded-2xl bg-muted text-primary">
          <svg
            aria-hidden="true"
            className="size-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 20v-2.2c0-2.65 2.24-4.8 5-4.8s5 2.15 5 4.8V20m1-6.5c.8-.55 1.84-.86 3-.86 2.76 0 5 1.8 5 4.02V20" />
          </svg>
        </div>

        <div className="text-center">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Understory client portal
          </p>
          <h1
            id="portal-identity-title"
            className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl"
          >
            Who is reviewing today?
          </h1>
          <p
            id="portal-identity-description"
            className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base"
          >
            Enter the username provided by Understory. Your selection stays
            active while this browser tab is open.
          </p>
        </div>

        <form onSubmit={submitUsername} className="mt-8">
          <label
            htmlFor="portal-username"
            className="block text-xs font-semibold text-foreground"
          >
            Username
          </label>
          <input
            id="portal-username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="Enter your username"
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={errorMessage ? "portal-username-error" : undefined}
            className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
            autoFocus
          />
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            Usernames are not case-sensitive. Valid access is provided by your
            Understory contact.
          </p>

          {errorMessage && (
            <p
              id="portal-username-error"
              role="alert"
              className="mt-3 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
            >
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={!username.trim()}
            className="mt-5 w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_rgba(52,31,96,0.15)] transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Continue
          </button>
        </form>

        <div className="mt-7 flex items-start gap-2.5 rounded-xl bg-accent/30 px-4 py-3 text-xs leading-5 text-accent-foreground">
          <span className="mt-0.5 size-2 shrink-0 rounded-full bg-accent" />
          <p>
            Your username determines the client workspace and which sections
            are available to you.
          </p>
        </div>
      </section>
    </div>
  );
}

function IdentityIndicator({
  identity,
  compact = false,
}: {
  identity: ClientIdentity;
  compact?: boolean;
}) {
  const { openIdentityPicker } = useClientIdentity();
  const person = CLIENT_IDENTITIES[identity];

  return (
    <button
      type="button"
      onClick={openIdentityPicker}
      aria-label={`Viewing as ${person.name} for ${person.clientName}. Switch identity.`}
      className={`group flex items-center rounded-xl border border-border bg-card text-left transition hover:border-input hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        compact ? "gap-2 px-2.5 py-2" : "w-full gap-2.5 px-3 py-2.5"
      }`}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
        {person.initials}
      </span>
      {compact ? (
        <span className="text-[10px] font-semibold text-foreground">
          {person.name} · {person.clientName}
        </span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
            Viewing as
          </span>
          <span className="block truncate text-xs font-semibold text-foreground">
            {person.name} · {person.clientName}
          </span>
        </span>
      )}
      {!compact && (
        <span className="text-[9px] font-semibold text-primary group-hover:underline">
          Switch
        </span>
      )}
    </button>
  );
}

function UnavailableSection() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-[24px] border border-border bg-card p-8 text-center shadow-[0_8px_28px_rgba(52,31,96,0.055)] sm:p-12">
          <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-muted text-primary">
            <svg
              aria-hidden="true"
              className="size-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            This section isn&apos;t available
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            This portal view is not included for the currently selected role.
          </p>
        </section>
      </div>
    </main>
  );
}

function ClientPortalShellContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const {
    identity,
    clientSlug,
    accessLevel,
    isPickerOpen,
    isReady,
    selectIdentity,
  } = useClientIdentity();

  if (!isReady) {
    return <div className="client-portal-theme min-h-screen bg-muted" />;
  }

  if (!identity || !clientSlug || !accessLevel || isPickerOpen) {
    return <IdentityPicker onChoose={selectIdentity} />;
  }

  const isRestrictedRoute =
    accessLevel !== "owner" &&
    (pathname === "/client-portal/invoices" ||
      pathname.startsWith("/client-portal/invoices/") ||
      pathname === "/client-portal/documents" ||
      pathname.startsWith("/client-portal/documents/"));

  return (
    <div
      data-theme={clientSlug}
      className="min-h-screen bg-background text-foreground"
    >
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col border-r border-border bg-card px-4 py-5 md:flex">
        <div className="px-1">
          <Brand />
        </div>
        <div className="mt-5">
          <IdentityIndicator identity={identity} />
        </div>
        <div className="mt-6 flex-1">
          <PortalNavigation pathname={pathname} accessLevel={accessLevel} />
        </div>
        <p className="border-t border-border px-2 pt-4 text-[10px] leading-4 text-muted-foreground">
          Understory · Client workspace
        </p>
      </aside>

      <header className="sticky top-0 z-50 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-4">
          <Brand />
          <div className="flex items-center gap-2">
            <IdentityIndicator identity={identity} compact />
            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-client-navigation"
              onClick={() => setIsMobileMenuOpen((current) => !current)}
              className="flex size-10 items-center justify-center rounded-full border border-input bg-card text-secondary-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <PortalIcon
                name={isMobileMenuOpen ? "close" : "menu"}
                className="size-5"
              />
              <span className="sr-only">
                {isMobileMenuOpen ? "Close navigation" : "Open navigation"}
              </span>
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div
            id="mobile-client-navigation"
            className="absolute inset-x-0 top-full border-b border-border bg-card px-4 py-4 shadow-[0_14px_35px_rgba(52,31,96,0.12)]"
          >
            <PortalNavigation
              pathname={pathname}
              accessLevel={accessLevel}
              onNavigate={() => setIsMobileMenuOpen(false)}
            />
          </div>
        )}
      </header>

      <div className="min-h-screen md:pl-[220px]">
        {isRestrictedRoute ? <UnavailableSection /> : children}
      </div>
    </div>
  );
}

export function ClientPortalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientIdentityProvider>
      <ClientPortalShellContent>{children}</ClientPortalShellContent>
    </ClientIdentityProvider>
  );
}
