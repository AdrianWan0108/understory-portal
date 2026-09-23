"use client";

import { useEffect } from "react";
import {
  AI_WORKSPACE_NEXT_STORAGE_KEY,
  getAiWorkspaceOAuthRecoveryPath,
} from "@/lib/ai-workspace/auth";

export default function HomePage() {
  useEffect(() => {
    const recoveryPath = getAiWorkspaceOAuthRecoveryPath({
      hasPendingAiOAuth: Boolean(window.sessionStorage.getItem(AI_WORKSPACE_NEXT_STORAGE_KEY)),
      search: window.location.search,
      hash: window.location.hash,
    });

    window.location.replace(recoveryPath ?? "/client-portal/approvals");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3ECF8] px-5 text-sm text-[#6F5D7D]" role="status">
      Redirecting securely…
    </main>
  );
}
