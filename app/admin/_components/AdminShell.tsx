"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import understoryLogo from "@/public/under story logo-purple.png";
import { ClientSelect } from "@/app/_components/ClientSelect";
import {
  ADMIN_CLIENTS,
  AdminProvider,
  type AdminClientSlug,
  useAdmin,
} from "./AdminContext";
import { inputClass } from "./AdminUi";

const navigation = [
  ["Dashboard", "/admin/dashboard"],
  ["Projects", "/admin/projects"],
  ["Analytics", "/admin/analytics"],
  ["Approvals", "/admin/approvals"],
  ["Gallery", "/admin/gallery"],
  ["Documents", "/admin/documents"],
  ["Invoices", "/admin/invoices"],
  ["Asset upload", "/admin/assets"],
] as const;

function LoginScreen() {
  const { login } = useAdmin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#E9E0EF] px-5 py-10">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!login(username, password)) {
            setError("The admin username or password is incorrect.");
          }
        }}
        className="w-full max-w-md rounded-[28px] border border-white bg-white p-8 shadow-[0_24px_80px_rgba(40,21,79,0.18)]"
      >
        <Image
          src={understoryLogo}
          alt="Understory"
          className="size-12 rounded-xl"
          priority
        />
        <span className="mt-5 inline-flex rounded-full bg-[#341F60] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4CE45]">
          Admin
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#28154F]">
          Internal console
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#75647F]">
          Sign in to manage client portal content.
        </p>

        <label className="mt-7 block text-xs font-semibold text-[#341F60]">
          Username
          <input
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setError(null);
            }}
            autoComplete="username"
            className={`mt-2 ${inputClass}`}
            placeholder="Enter your username"
          />
        </label>
        <label className="mt-4 block text-xs font-semibold text-[#341F60]">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            autoComplete="current-password"
            className={`mt-2 ${inputClass}`}
          />
        </label>
        {error && (
          <p className="mt-4 rounded-xl bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-[#341F60] px-5 py-3 text-sm font-semibold text-white hover:bg-[#28154F]"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}

function ClientChooser() {
  const { selectClient, logout } = useAdmin();
  const router = useRouter();
  const [selectedClient, setSelectedClient] =
    useState<AdminClientSlug>("mvp");
  const clientOptions = (Object.keys(ADMIN_CLIENTS) as AdminClientSlug[]).map(
    (slug) => ({
      value: slug,
      label: ADMIN_CLIENTS[slug].name,
    }),
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#E9E0EF] px-5 py-10">
      <section className="w-full max-w-2xl rounded-[28px] border border-white bg-white p-8 shadow-[0_24px_80px_rgba(40,21,79,0.16)]">
        <span className="inline-flex rounded-full bg-[#341F60] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4CE45]">
          Admin
        </span>
        <h1 className="mt-4 text-3xl font-semibold text-[#28154F]">
          Choose a client workspace
        </h1>
        <p className="mt-2 text-sm text-[#75647F]">
          All admin pages will be scoped to this client until you switch.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <ClientSelect
            value={selectedClient}
            onChange={(value) =>
              setSelectedClient(value as AdminClientSlug)
            }
            options={clientOptions}
            ariaLabel="Choose admin client workspace"
            className="w-full flex-1"
          />
          <button
            type="button"
            onClick={() => {
              selectClient(selectedClient);
              router.push("/admin/dashboard");
            }}
            className="rounded-xl bg-[#341F60] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#28154F]"
          >
            Continue
          </button>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-7 text-xs font-semibold text-[#7D4698] hover:underline"
        >
          Log out
        </button>
      </section>
    </main>
  );
}

function AdminShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isReady,
    isAuthenticated,
    clientSlug,
    clientName,
    clientId,
    clientError,
    selectClient,
    logout,
  } = useAdmin();

  if (!isReady) return <div className="min-h-screen bg-[#E9E0EF]" />;
  if (!isAuthenticated) return <LoginScreen />;
  if (!clientSlug) return <ClientChooser />;
  const clientOptions = (Object.keys(ADMIN_CLIENTS) as AdminClientSlug[]).map(
    (slug) => ({
      value: slug,
      label: ADMIN_CLIENTS[slug].name,
    }),
  );

  return (
    <div className="min-h-screen bg-[#F4EEF8] text-[#28154F]">
      <header className="sticky top-0 z-50 border-b border-[#CDBAD9] bg-[#28154F] px-4 py-3 text-white shadow-lg sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <Image
              src={understoryLogo}
              alt="Understory"
              className="size-9 rounded-lg bg-white"
              priority
            />
            <span className="font-semibold">Understory</span>
            <span className="rounded-full bg-[#F4CE45] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#28154F]">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ClientSelect
              value={clientSlug}
              onChange={(value) => {
                selectClient(value as AdminClientSlug);
                router.refresh();
              }}
              options={clientOptions}
              ariaLabel="Switch admin client"
              tone="dark"
            />
            <button
              type="button"
              onClick={() => {
                logout();
                router.push("/admin");
              }}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] md:grid-cols-[210px_1fr]">
        <aside className="border-r border-[#D7CBE0] bg-[#EEE3FA] p-4 md:min-h-[calc(100vh-64px)]">
          <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7D4698]">
            {clientName}
          </p>
          <nav className="grid grid-cols-2 gap-1 md:grid-cols-1">
            {navigation.map(([label, href]) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#341F60] text-white"
                      : "text-[#5F3378] hover:bg-white"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div>
          {clientError ? (
            <div className="m-6 rounded-xl bg-[#FFF0F0] p-4 text-sm text-[#8B3E3E]">
              {clientError}
            </div>
          ) : !clientId ? (
            <div className="m-6 h-52 animate-pulse rounded-[22px] border border-[#D7CBE0] bg-white" />
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <AdminShellContent>{children}</AdminShellContent>
    </AdminProvider>
  );
}
