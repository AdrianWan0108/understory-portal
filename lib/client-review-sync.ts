export type ClientReviewSyncInput = {
  clientSlug: "mvp" | "boardwalk";
  clientName: string;
  action: "approved" | "requested_changes";
  title: string;
  reviewerName: string;
  comment?: string;
  assigneeNames?: string[];
};

export type ClientReviewActivity = {
  actor: string;
  action: string;
  target: string;
  client_slug: "mvp" | "boardwalk";
};

export type ClientReviewSlackMessage = {
  target: "mvp" | "boardwalk" | "admin";
  text: string;
};

type ClientReviewSyncDependencies = {
  writeActivity: (activity: ClientReviewActivity) => Promise<void>;
  sendSlackMessage: (
    target: ClientReviewSlackMessage["target"],
    text: string,
  ) => Promise<void>;
};

export function clientReviewActivity(
  input: ClientReviewSyncInput,
): ClientReviewActivity {
  return {
    actor: input.reviewerName,
    action:
      input.action === "approved" ? "approved" : "requested changes on",
    target: input.title,
    client_slug: input.clientSlug,
  };
}

export function clientReviewSlackMessages(
  input: ClientReviewSyncInput,
): ClientReviewSlackMessage[] {
  const action =
    input.action === "approved" ? "approved" : "requested changes on";
  const messages: ClientReviewSlackMessage[] = [
    {
      target: input.clientSlug,
      text: `${input.clientName} ${action} '${input.title}' — reviewer: ${input.reviewerName}`,
    },
  ];

  if (input.action === "requested_changes") {
    const assignedTo = input.assigneeNames?.length
      ? input.assigneeNames.join(", ")
      : "the social media team";
    const commentSuffix = input.comment ? `: "${input.comment}"` : "";
    messages.push({
      target: "admin",
      text: `⚠️ ${input.clientName} requested changes on '${input.title}' — assigned to ${assignedTo}${commentSuffix}`,
    });
  }

  return messages;
}

export async function syncClientReview(
  input: ClientReviewSyncInput,
  dependencies: ClientReviewSyncDependencies,
) {
  const activity = clientReviewActivity(input);
  const messages = clientReviewSlackMessages(input);

  // Persist the portal event before notifying external systems so a Slack
  // notification is never sent without a corresponding Dashboard entry.
  await dependencies.writeActivity(activity);
  await Promise.all(
    messages.map(({ target, text }) =>
      dependencies.sendSlackMessage(target, text),
    ),
  );

  return { activity, messages };
}
