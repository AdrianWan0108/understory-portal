"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  AI_WORKSPACE_NEXT_STORAGE_KEY,
  AI_WORKSPACE_PATH,
  getSafeAiWorkspaceNext,
  resolveAiWorkspaceActor,
  UNLINKED_AI_PROFILE_MESSAGE,
} from "@/lib/ai-workspace/auth";
import { supabase } from "@/lib/supabase";

type CallbackState = "checking" | "oauth_error" | "expired" | "unauthorized" | "server_error";

function CallbackContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<CallbackState>("checking");

  useEffect(() => {
    let active = true;

    async function completeSignIn() {
      if (searchParams.get("error")) {
        setState("oauth_error");
        return;
      }

      const requestedNext = searchParams.get("next") ?? window.sessionStorage.getItem(AI_WORKSPACE_NEXT_STORAGE_KEY);
      window.sessionStorage.removeItem(AI_WORKSPACE_NEXT_STORAGE_KEY);
      const next = getSafeAiWorkspaceNext(requestedNext);
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;
      if (error || !data.session) {
        setState("expired");
        return;
      }

      const identity = await resolveAiWorkspaceActor(data.session.access_token, window.fetch.bind(window));
      if (!active) return;
      if (identity.status === "authorized") {
        window.location.replace(next);
        return;
      }
      setState(identity.status === "unauthorized" ? "unauthorized" : "server_error");
    }

    void completeSignIn();
    return () => { active = false; };
  }, [searchParams]);

  async function signOutAndReturn() {
    await supabase.auth.signOut();
    window.location.replace(AI_WORKSPACE_PATH);
  }

  const message = state === "unauthorized"
    ? UNLINKED_AI_PROFILE_MESSAGE
    : state === "oauth_error"
      ? "GitHub sign-in could not be completed. Please return to AI Workspace and try again."
      : state === "expired"
        ? "The sign-in session expired before it could be completed. Please try again."
        : state === "server_error"
          ? "Your account was authenticated, but AI Workspace access could not be checked. Please try again."
          : "Completing GitHub sign-in…";

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md items-center px-5 py-12">
      <section className="w-full rounded-2xl border border-[#DED2E5] bg-[#FFFDFB] p-6 shadow-[0_3px_14px_rgba(42,22,69,0.04)]">
        <h1 className="text-xl font-semibold text-[#321D4B]">AI Workspace sign in</h1>
        <p className={`mt-3 text-sm leading-6 ${state === "checking" ? "text-[#6F5D7D]" : "text-[#8B3E3E]"}`} role={state === "checking" ? "status" : "alert"}>
          {message}
        </p>
        {state === "unauthorized" ? (
          <button className="mt-5 rounded-lg bg-[#432560] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#32194C]" onClick={() => void signOutAndReturn()}>
            Sign out and try another account
          </button>
        ) : state !== "checking" ? (
          <Link className="mt-5 inline-block rounded-lg bg-[#432560] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#32194C]" href={AI_WORKSPACE_PATH}>
            Return to AI Workspace sign in
          </Link>
        ) : null}
      </section>
    </main>
  );
}

export default function AiWorkspaceAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="px-5 py-12 text-sm text-[#6F5D7D]" role="status">Completing GitHub sign-in…</div>}>
      <CallbackContent />
    </Suspense>
  );
}
