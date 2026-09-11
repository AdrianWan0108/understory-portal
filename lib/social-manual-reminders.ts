export type ManualReminderSlide = {
  slideNumber: number;
  onScreenText?: string | null;
  visualNote?: string | null;
  caption?: string | null;
  imageUrl?: string | null;
  references?: Array<{ platform?: string | null; url: string }>;
};

export type ManualPostReminder = {
  clientName: string;
  title: string;
  format?: string | null;
  platform?: string | null;
  platformSchedules?: Record<string, string>;
  platformCaptions?: Record<string, string>;
  scheduledAt: string;
  assigneeMentions?: string[];
  assigneeNames?: string[];
  purpose?: string | null;
  brief?: string | null;
  visualNote?: string | null;
  postCaption?: string | null;
  creativeDriveLink?: string | null;
  storyInteraction?: {
    type?: string | null;
    prompt?: string | null;
    options?: string[];
  } | null;
  reel?: {
    hook?: string | null;
    script?: string | null;
    shotList?: string | null;
    editingFlow?: string | null;
    onScreenText?: string | null;
    cta?: string | null;
    videoUrl?: string | null;
    coverUrl?: string | null;
    coverUrls?: Record<string, string>;
  } | null;
  slides?: ManualReminderSlide[];
  directLink: string;
};

function clean(value: string | null | undefined, maximum = 700) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized.length > maximum
    ? `${normalized.slice(0, maximum - 1)}…`
    : normalized;
}

function slackLink(url: string | null | undefined, label: string) {
  const cleaned = clean(url, 1_500);
  return cleaned ? `<${cleaned}|${label}>` : null;
}

export function isManualPostReminderDue(input: {
  schedulingMode: unknown;
  publishingStatus: unknown;
  scheduledAt: unknown;
  postedAt: unknown;
  reminderSentAt: unknown;
  now: Date;
}) {
  if (
    input.schedulingMode !== "manual" ||
    input.publishingStatus !== "scheduled" ||
    typeof input.scheduledAt !== "string" ||
    input.postedAt ||
    input.reminderSentAt
  ) {
    return false;
  }
  const scheduledTime = new Date(input.scheduledAt).getTime();
  return Number.isFinite(scheduledTime) && scheduledTime <= input.now.getTime();
}

export function buildManualPostReminderMessage(input: ManualPostReminder) {
  const postingTimeFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const planned = postingTimeFormatter.format(new Date(input.scheduledAt));
  const platformScheduleLines = Object.entries(input.platformSchedules ?? {})
    .filter(([, value]) => Number.isFinite(new Date(value).getTime()))
    .sort(
      ([, left], [, right]) =>
        new Date(left).getTime() - new Date(right).getTime(),
    )
    .map(
      ([channel, value]) =>
        `• ${clean(channel, 80)}: ${postingTimeFormatter.format(new Date(value))} ET`,
    );
  const platformCaptionLines = Object.entries(input.platformCaptions ?? {})
    .flatMap(([channel, caption]) => {
      const cleanedChannel = clean(channel, 80);
      const cleanedCaption = clean(caption, 1_500);
      return cleanedChannel && cleanedCaption
        ? [`*${cleanedChannel}*\n${cleanedCaption}`]
        : [];
    });
  const formatAndPlatform = [clean(input.format, 80), clean(input.platform, 80)]
    .filter(Boolean)
    .join(" · ");
  const assignees = input.assigneeMentions?.length
    ? input.assigneeMentions.join(" ")
    : input.assigneeNames?.length
      ? input.assigneeNames.join(", ")
      : "Unassigned";
  const isCarousel = clean(input.format, 80)?.toLowerCase() === "carousel";
  const lines = [
    "🔔 *Manual social post due now*",
    `*${clean(input.clientName, 120) ?? "Client"} · ${clean(input.title, 240) ?? "Untitled content"}*`,
    formatAndPlatform ? `Format: ${formatAndPlatform}` : null,
    `Planned: ${planned} ET`,
    platformScheduleLines.length ? "Channel posting times:" : null,
    ...platformScheduleLines,
    `Post owner: ${assignees}`,
    "",
    "*Creative to post*",
    clean(input.purpose) ? `Purpose: ${clean(input.purpose)}` : null,
    clean(input.brief) ? `Brief: ${clean(input.brief)}` : null,
    clean(input.visualNote)
      ? `Visual direction: ${clean(input.visualNote)}`
      : null,
    platformCaptionLines.length ? "*Channel captions*" : null,
    ...platformCaptionLines,
    !platformCaptionLines.length && !isCarousel && clean(input.postCaption, 1_500)
      ? `Caption:\n${clean(input.postCaption, 1_500)}`
      : null,
    slackLink(input.creativeDriveLink, "Open creative asset"),
  ];

  if (input.storyInteraction && input.storyInteraction.type !== "none") {
    const interactionDetails = [
      clean(input.storyInteraction.prompt, 500),
      ...(input.storyInteraction.options ?? [])
        .map((option) => clean(option, 120))
        .filter((option): option is string => Boolean(option)),
    ];
    lines.push(
      `Story interaction: ${clean(input.storyInteraction.type, 80)?.replaceAll("_", " ") ?? "other"}`,
      interactionDetails.length
        ? `Sticker copy / choices: ${interactionDetails.join(" · ")}`
        : null,
    );
  }

  if (input.reel) {
    const videoLink = slackLink(input.reel.videoUrl, "Open Reel asset");
    const coverLink = slackLink(input.reel.coverUrl, "Open Reel cover");
    const channelCoverLinks = Object.entries(input.reel.coverUrls ?? {}).flatMap(
      ([channel, url]) => {
        const cleanedChannel = clean(channel, 80);
        if (!cleanedChannel) return [];
        const link = slackLink(url, `Open ${cleanedChannel} Reel cover`);
        return link ? [`Reel cover (${cleanedChannel}): ${link}`] : [];
      },
    );
    lines.push(
      clean(input.reel.hook) ? `Reel hook: ${clean(input.reel.hook)}` : null,
      clean(input.reel.script, 1_200)
        ? `Reel script:\n${clean(input.reel.script, 1_200)}`
        : null,
      clean(input.reel.shotList, 1_000)
        ? `Shot list:\n${clean(input.reel.shotList, 1_000)}`
        : null,
      clean(input.reel.editingFlow, 1_000)
        ? `Editing flow:\n${clean(input.reel.editingFlow, 1_000)}`
        : null,
      clean(input.reel.onScreenText, 700)
        ? `On-screen text:\n${clean(input.reel.onScreenText, 700)}`
        : null,
      clean(input.reel.cta) ? `Reel CTA: ${clean(input.reel.cta)}` : null,
      videoLink ? `Reel: ${videoLink}` : null,
      ...channelCoverLinks,
      !channelCoverLinks.length && coverLink
        ? `Reel cover: ${coverLink}`
        : null,
    );
  }

  const visibleSlides = (input.slides ?? []).slice(0, 10);
  for (const slide of visibleSlides) {
    const details = [
      clean(slide.onScreenText, 350)
        ? `Text: ${clean(slide.onScreenText, 350)}`
        : null,
      clean(slide.caption, 500)
        ? `Caption: ${clean(slide.caption, 500)}`
        : null,
      clean(slide.visualNote, 350)
        ? `Visual: ${clean(slide.visualNote, 350)}`
        : null,
      slackLink(slide.imageUrl, "Open final asset"),
      ...(slide.references ?? []).slice(0, 3).map((reference, index) =>
        slackLink(
          reference.url,
          clean(reference.platform, 40) ?? `Reference ${index + 1}`,
        ),
      ),
    ].filter(Boolean);
    if (details.length) {
      lines.push("", `*Slide ${slide.slideNumber}*`, ...details);
    }
  }
  if ((input.slides?.length ?? 0) > visibleSlides.length) {
    lines.push(
      `…and ${(input.slides?.length ?? 0) - visibleSlides.length} more slides in the calendar.`,
    );
  }

  lines.push("", `<${input.directLink}|Open post in Social Content Calendar>`);
  return lines.filter((line): line is string => line !== null).join("\n");
}
