function escapeSlack(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/\s+/g, " ").trim();
}

export function aiSlackNotification(input: { client: string; title: string; agent: string; status: string; requester: string; date: string; summary: string; url: string }) {
  return [
    `*${escapeSlack(input.client)}* · ${escapeSlack(input.title)}`,
    `${escapeSlack(input.agent)} · ${escapeSlack(input.status)} · Requested by ${escapeSlack(input.requester)}`,
    `Date: ${escapeSlack(input.date)}`,
    escapeSlack(input.summary).slice(0, 400),
    `<${input.url}|Open exact portal task>`,
  ].join("\n");
}
