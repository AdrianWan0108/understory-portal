import type { Metadata } from "next";
import { ClientPortalShell } from "./_components/ClientPortalShell";

export const metadata: Metadata = {
  title: "Client Portal | Understory",
  description: "Review projects, analytics, approvals, assets, and invoices.",
};

export default function ClientPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ClientPortalShell>{children}</ClientPortalShell>;
}
