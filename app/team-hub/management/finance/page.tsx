import { forbidden } from "next/navigation";
import { requireFinancePageAccess } from "@/lib/finance-auth";
import { FinanceDashboard } from "./_components/FinanceDashboard";

export default async function FinancePage() {
  const access = await requireFinancePageAccess();
  if (!access.ok) forbidden();

  return <FinanceDashboard viewerName={access.principal.name} />;
}
