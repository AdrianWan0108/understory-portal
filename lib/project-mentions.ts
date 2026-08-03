import { supabase } from "@/lib/supabase";

function uniqueUsernames(...groups: Array<string[] | null | undefined>) {
  return Array.from(new Set(groups.flatMap((group) => group ?? [])));
}

export async function appendDivisionTaskMention(
  taskId: string,
  username: string,
) {
  const { data, error } = await supabase
    .from("division_tasks")
    .select("mentioned_usernames, watcher_usernames")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) return false;

  const { error: updateError } = await supabase
    .from("division_tasks")
    .update({
      mentioned_usernames: uniqueUsernames(data.mentioned_usernames, [username]),
      watcher_usernames: uniqueUsernames(data.watcher_usernames, [username]),
    })
    .eq("id", taskId);

  return !updateError;
}

export async function appendWebsiteTaskMention(
  taskId: string,
  username: string,
) {
  const { data, error } = await supabase
    .from("website_tasks")
    .select("mentioned_usernames")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) return false;

  const { error: updateError } = await supabase
    .from("website_tasks")
    .update({
      mentioned_usernames: uniqueUsernames(data.mentioned_usernames, [username]),
    })
    .eq("id", taskId);

  return !updateError;
}

export async function appendSocialTaskMention(
  taskId: string,
  username: string,
) {
  const { data, error } = await supabase
    .from("tasks")
    .select("mentioned_usernames, watcher_usernames")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) return false;

  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      mentioned_usernames: uniqueUsernames(data.mentioned_usernames, [username]),
      watcher_usernames: uniqueUsernames(data.watcher_usernames, [username]),
    })
    .eq("id", taskId);

  return !updateError;
}
