import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { WorkspaceClientSlug } from "@/lib/workspace-clients";

export async function LegacySocialCalendarRedirect({
  clientSlug,
}: {
  clientSlug: WorkspaceClientSlug;
}) {
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("slug", clientSlug)
    .maybeSingle();

  if (client) {
    const { data: calendar } = await supabase
      .from("division_tasks")
      .select("id")
      .eq("client_id", client.id)
      .eq("division", "social-media")
      .eq("template_type", "content_calendar")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (calendar) {
      return redirect(
        `/team-hub/projects/${encodeURIComponent(calendar.id)}/calendar`,
      );
    }
  }

  return redirect("/team-hub/projects?division=social-media");
}
