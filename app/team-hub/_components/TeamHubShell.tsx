"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import understoryLogo from "@/public/under story logo-purple.png";
import {
  TEAM_IDENTITIES,
  TeamIdentityProvider,
  type TeamAccessLevel,
  type TeamIdentity,
  useTeamIdentity,
} from "./TeamIdentity";
import { TEAM_LOGIN_PATH } from "@/lib/team-auth";
import { shouldShowFinanceNavigation } from "@/lib/finance-policy";

type NavIcon =
  | "dashboard"
  | "management"
  | "finance"
  | "sales"
  | "projects"
  | "clients"
  | "payroll"
  | "documents"
  | "resources"
  | "profile";

const navigation: Array<{
  label: string;
  href: string;
  icon: NavIcon;
  ownerOnly?: boolean;
  financeOnly?: boolean;
}> = [
  {
    label: "Dashboard",
    href: "/team-hub/dashboard",
    icon: "dashboard",
  },
  {
    label: "Profile",
    href: "/team-hub/profile",
    icon: "profile",
  },
  {
    label: "Management",
    href: "/team-hub/management",
    icon: "management",
    ownerOnly: true,
  },
  {
    label: "Finance",
    href: "/team-hub/management/finance",
    icon: "finance",
    ownerOnly: true,
    financeOnly: true,
  },
  {
    label: "Sales",
    href: "/team-hub/sales",
    icon: "sales",
    ownerOnly: true,
  },
  {
    label: "Projects",
    href: "/team-hub/projects",
    icon: "projects",
  },
  {
    label: "Client info",
    href: "/team-hub/client-info",
    icon: "clients",
  },
  {
    label: "Payroll",
    href: "/team-hub/payroll",
    icon: "payroll",
  },
  {
    label: "Documents",
    href: "/team-hub/documents",
    icon: "documents",
  },
  {
    label: "Resources",
    href: "/team-hub/resources",
    icon: "resources",
  },
];

function TeamIcon({
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
    management: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2M18 5l1-1M6 5 5 4" />
      </>
    ),
    finance: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 9h10M7 13h4M15 13h2M7 16h10" />
      </>
    ),
    sales: (
      <>
        <path d="M3 3h7.5L21 13.5a2 2 0 0 1 0 2.83l-4.67 4.67a2 2 0 0 1-2.83 0L3 10.5V3Z" />
        <circle cx="8" cy="8" r="1.6" />
      </>
    ),
    projects: (
      <>
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v8A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z" />
        <path d="M4 10h16" />
      </>
    ),
    clients: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2M17 11a3 3 0 1 0 0-6M16 14a5 5 0 0 1 5 5v1" />
      </>
    ),
    payroll: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 9h5M7 13h3M16 10v4M14 12h4" />
      </>
    ),
    documents: (
      <>
        <path d="M6 3h9l3 3v15H6Z" />
        <path d="M15 3v4h4M9 12h6M9 16h6" />
      </>
    ),
    resources: (
      <>
        <path d="M6 3h9l3 3v15H6Z" />
        <path d="M15 3v4h4M9 12h6M9 16h6" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
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
      <Image
        src={understoryLogo}
        alt="Understory"
        className="size-10 rounded-xl"
        priority
      />
      <span>
        <span className="block text-sm font-semibold tracking-wide text-[#341F60]">
          Understory
        </span>
        <span className="block text-[9px] uppercase tracking-[0.22em] text-[#7D4698]">
          Team portal
        </span>
      </span>
    </div>
  );
}

function IdentityIndicator({
  identity,
  compact = false,
}: {
  identity: TeamIdentity;
  compact?: boolean;
}) {
  const { avatarUrl, displayName, openIdentityPicker } = useTeamIdentity();
  const profile = TEAM_IDENTITIES[identity];

  return (
    <div
      className={`flex items-center rounded-xl border border-[#D7CBE0] bg-white ${
        compact ? "gap-2 px-2.5 py-2" : "gap-2.5 px-3 py-2.5"
      }`}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={displayName || profile.name}
          width={28}
          height={28}
          className="size-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#341F60] text-[10px] font-semibold text-white">
          {profile.initials}
        </span>
      )}
      <span className="min-w-0">
        {!compact && (
          <span className="block text-[9px] uppercase tracking-[0.13em] text-[#8B7895]">
            Viewing as
          </span>
        )}
        <span className="block truncate text-[10px] font-semibold text-[#341F60] sm:text-xs">
          {displayName || profile.name} · {profile.title}
        </span>
      </span>
      <button
        type="button"
        onClick={openIdentityPicker}
        className="ml-1 text-[9px] font-semibold text-[#7D4698] hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
      >
        Switch
      </button>
    </div>
  );
}

function TeamNavigation({
  pathname,
  accessLevel,
  canViewFinance,
  onNavigate,
}: {
  pathname: string;
  accessLevel: TeamAccessLevel;
  canViewFinance: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Team Hub navigation" className="space-y-1.5">
      {navigation
        .filter(
          (item) =>
            (accessLevel === "owner" || !item.ownerOnly) &&
            (!item.financeOnly ||
              shouldShowFinanceNavigation(accessLevel, canViewFinance)),
        )
        .map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698] ${
                isActive
                  ? "bg-[#341F60] text-white shadow-[0_8px_24px_rgba(40,21,79,0.16)]"
                  : "text-[#5F3378] hover:bg-white hover:text-[#28154F]"
              }`}
            >
              <TeamIcon
                name={item.icon}
                className={`size-4.5 shrink-0 ${
                  isActive ? "text-[#F4CE45]" : "text-[#7D4698]"
                }`}
              />
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}

function TeamHubShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [canViewFinance, setCanViewFinance] = useState(false);
  const {
    identity,
    accessLevel,
    isReady,
    isPickerOpen,
  } = useTeamIdentity();

  useEffect(() => {
    if (isReady && (!identity || !accessLevel || isPickerOpen)) {
      const returnTo = `${pathname}${window.location.search}`;
      router.replace(
        `${TEAM_LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`,
      );
      return;
    }

    if (isReady && identity && pathname === "/team-hub") {
      router.replace("/team-hub/dashboard");
    }
  }, [accessLevel, identity, isPickerOpen, isReady, pathname, router]);

  useEffect(() => {
    if (!isReady || accessLevel !== "owner") return;

    let active = true;
    async function loadFinanceAccess() {
      const response = await fetch("/api/team-hub/finance/access", {
        cache: "no-store",
      }).catch(() => null);
      if (active) setCanViewFinance(Boolean(response?.ok));
    }
    void loadFinanceAccess();
    return () => {
      active = false;
    };
  }, [accessLevel, isReady, pathname]);

  if (!isReady) {
    return <div className="min-h-screen bg-[#E9E0EF]" />;
  }

  if (!identity || !accessLevel || isPickerOpen) {
    return <div className="min-h-screen bg-[#E9E0EF]" />;
  }

  return (
    <div className="min-h-screen bg-[#F4EEF8] text-[#28154F]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[230px] flex-col border-r border-[#D7CBE0] bg-[#EEE3FA] px-4 py-5 md:flex">
        <div className="px-1">
          <Brand />
        </div>
        <div className="mt-7 flex-1">
          <TeamNavigation
            pathname={pathname}
            accessLevel={accessLevel}
            canViewFinance={canViewFinance}
          />
        </div>
        <p className="border-t border-[#D7CBE0] px-2 pt-4 text-[10px] leading-4 text-[#8B7895]">
          Understory · Internal workspace
        </p>
      </aside>

      <header className="sticky top-0 z-50 border-b border-[#D7CBE0] bg-white/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Brand />
          <div className="flex items-center gap-2">
            <IdentityIndicator identity={identity} compact />
            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-team-navigation"
              onClick={() => setIsMobileMenuOpen((current) => !current)}
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#CDBAD9] bg-white text-[#5F3378] transition hover:bg-[#EEE3FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
            >
              <TeamIcon
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
            id="mobile-team-navigation"
            className="absolute inset-x-0 top-full border-b border-[#D7CBE0] bg-[#EEE3FA] px-4 py-4 shadow-[0_14px_35px_rgba(40,21,79,0.14)]"
          >
            <TeamNavigation
              pathname={pathname}
              accessLevel={accessLevel}
              canViewFinance={canViewFinance}
              onNavigate={() => setIsMobileMenuOpen(false)}
            />
          </div>
        )}
      </header>

      <div className="min-h-screen md:pl-[230px]">
        <div className="sticky top-0 z-30 hidden border-b border-[#D7CBE0] bg-white/90 px-8 py-3 backdrop-blur md:flex md:justify-end">
          <IdentityIndicator identity={identity} />
        </div>
        {children}
      </div>
    </div>
  );
}

export function TeamHubShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === TEAM_LOGIN_PATH) {
    return children;
  }

  return (
    <TeamIdentityProvider>
      <TeamHubShellContent>{children}</TeamHubShellContent>
    </TeamIdentityProvider>
  );
}
