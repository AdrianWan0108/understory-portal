import type {
  ReelDetails,
  SocialFilmingDetails,
  SocialPostFormat,
  SocialSchedulingMode,
  StoryInteraction,
} from "./social-content";

const SOCIAL_POST_FORMATS: SocialPostFormat[] = [
  "reel",
  "carousel",
  "image",
  "story",
];
const STORY_INTERACTION_TYPES: StoryInteraction["type"][] = [
  "none",
  "poll",
  "question_box",
  "quiz",
  "emoji_slider",
  "link_sticker",
  "mention_sticker",
  "countdown",
  "other",
];
const EMPTY_STORY_INTERACTION: StoryInteraction = {
  type: "none",
  prompt: "",
  options: [],
};
const EMPTY_REEL_DETAILS: ReelDetails = {
  hook: "",
  script: "",
  shotList: "",
  editingFlow: "",
  onScreenText: "",
  cta: "",
  videoUrl: "",
  footageLinks: [],
  referenceLinks: [],
};
const EMPTY_SOCIAL_FILMING_DETAILS: SocialFilmingDetails = {
  filmingDate: "",
  participants: [],
  needsModels: false,
  preparation: "",
  script: "",
  shotList: "",
  rawFootageLinks: [],
  filmed: false,
};

export type SocialContentImportSlide = {
  onScreenText: string;
  visualDirection: string;
  caption: string;
  imageUrl: string;
};

export type SocialContentImportPost = {
  title: string;
  format: SocialPostFormat;
  platform: string;
  purpose: string;
  contentPillar: string;
  targetAudience: string;
  cta: string;
  dueDate: string;
  scheduledAt: string;
  brief: string;
  visualDirection: string;
  caption: string;
  schedulingMode: SocialSchedulingMode;
  storyInteraction: StoryInteraction;
  reelDetails: ReelDetails;
  requiresFilming: boolean;
  filmingDetails: SocialFilmingDetails;
  slides: SocialContentImportSlide[];
};

export type SocialContentImportResult = {
  posts: SocialContentImportPost[];
  warnings: string[];
};

const FORMAT_ALIASES: Record<string, SocialPostFormat> = {
  reel: "reel",
  video: "reel",
  carousel: "carousel",
  image: "image",
  "single image": "image",
  "static image": "image",
  static: "image",
  story: "story",
  stories: "story",
};

const INTERACTION_ALIASES: Record<string, StoryInteraction["type"]> = {
  "": "none",
  none: "none",
  poll: "poll",
  question: "question_box",
  "question box": "question_box",
  question_box: "question_box",
  quiz: "quiz",
  slider: "emoji_slider",
  "emoji slider": "emoji_slider",
  emoji_slider: "emoji_slider",
  link: "link_sticker",
  "link sticker": "link_sticker",
  link_sticker: "link_sticker",
  mention: "mention_sticker",
  "mention sticker": "mention_sticker",
  mention_sticker: "mention_sticker",
  countdown: "countdown",
  other: "other",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function field(
  record: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(text).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseJsonSource(source: string): unknown {
  const trimmed = source.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try {
    return JSON.parse(fenced?.[1] ?? trimmed);
  } catch {
    throw new Error(
      "The import is not valid JSON. Ask ChatGPT to return only the JSON template, then paste it here.",
    );
  }
}

function parseFormat(value: unknown, index: number): SocialPostFormat {
  const normalized = text(value).toLowerCase();
  const format = FORMAT_ALIASES[normalized];
  if (!format || !SOCIAL_POST_FORMATS.includes(format)) {
    throw new Error(
      `Post ${index + 1} has an invalid format. Use reel, carousel, image, or story.`,
    );
  }
  return format;
}

function parseDueDate(value: unknown, index: number): string {
  const date = text(value);
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`Post ${index + 1} has an invalid dueDate. Use YYYY-MM-DD.`);
  }
  return date;
}

function parseScheduledAt(value: unknown, index: number): string {
  const input = text(value);
  if (!input) return "";
  const normalized = input.replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/,
    "$1T$2",
  );
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Post ${index + 1} has an invalid scheduledAt. Use an ISO date and time, for example 2026-09-15T10:00:00-04:00.`,
    );
  }
  return date.toISOString();
}

function parseStoryInteraction(
  value: unknown,
  format: SocialPostFormat,
  index: number,
  warnings: string[],
): StoryInteraction {
  if (format !== "story") {
    if (value) warnings.push(`Post ${index + 1}: story interaction was ignored because the format is not Story.`);
    return { ...EMPTY_STORY_INTERACTION };
  }

  const record = asRecord(value);
  if (!record) {
    const simpleValue = text(value);
    const alias = INTERACTION_ALIASES[simpleValue.toLowerCase()];
    return simpleValue
      ? { type: alias ?? "other", prompt: alias ? "" : simpleValue, options: [] }
      : { ...EMPTY_STORY_INTERACTION };
  }

  const rawType = text(field(record, "type", "interactionType")).toLowerCase();
  const type = INTERACTION_ALIASES[rawType];
  if (!type || !STORY_INTERACTION_TYPES.includes(type)) {
    throw new Error(
      `Post ${index + 1} has an invalid storyInteraction type.`,
    );
  }
  return {
    type,
    prompt: text(field(record, "prompt", "question", "copy")),
    options: stringList(field(record, "options", "answers", "details")),
  };
}

function parseSlides(
  value: unknown,
  format: SocialPostFormat,
  index: number,
  warnings: string[],
): SocialContentImportSlide[] {
  if (format === "reel") return [];
  if (!Array.isArray(value) || value.length === 0) {
    warnings.push(`Post ${index + 1}: one blank creative slide will be created.`);
    return [
      { onScreenText: "", visualDirection: "", caption: "", imageUrl: "" },
    ];
  }
  return value.map((item, slideIndex) => {
    const record = asRecord(item);
    if (!record) {
      throw new Error(
        `Post ${index + 1}, slide ${slideIndex + 1} must be a JSON object.`,
      );
    }
    return {
      onScreenText: text(field(record, "onScreenText", "on_screen_text", "text")),
      visualDirection: text(
        field(record, "visualDirection", "visual_direction", "visualNote"),
      ),
      caption: text(field(record, "caption", "slideCaption", "slide_caption")),
      imageUrl: text(field(record, "imageUrl", "image_url")),
    };
  });
}

export function parseSocialContentImport(
  source: string,
): SocialContentImportResult {
  const parsed = parseJsonSource(source);
  const root = asRecord(parsed);
  const rawPosts = Array.isArray(parsed)
    ? parsed
    : root && Array.isArray(root.posts)
      ? root.posts
      : null;
  if (!rawPosts || rawPosts.length === 0) {
    throw new Error('The JSON needs a non-empty "posts" array.');
  }
  if (rawPosts.length > 50) {
    throw new Error("Import up to 50 posts at a time.");
  }

  const warnings: string[] = [];
  const posts = rawPosts.map((item, index): SocialContentImportPost => {
    const record = asRecord(item);
    if (!record) throw new Error(`Post ${index + 1} must be a JSON object.`);
    const title = text(field(record, "title", "contentTitle", "content_title"));
    if (!title) throw new Error(`Post ${index + 1} is missing a title.`);
    const format = parseFormat(field(record, "format", "type"), index);
    const reel = asRecord(field(record, "reel", "reelDetails", "reel_details")) ?? {};
    const filming =
      asRecord(field(record, "filming", "filmingDetails", "filming_details")) ?? {};
    const requiresFilming =
      field(record, "requiresFilming", "requires_filming") === true ||
      Boolean(Object.keys(filming).length);

    return {
      title,
      format,
      platform: text(record.platform) || "Instagram",
      purpose: text(field(record, "purpose", "goal")),
      contentPillar: text(field(record, "contentPillar", "content_pillar", "campaign")),
      targetAudience: text(field(record, "targetAudience", "target_audience", "audience")),
      cta: text(field(record, "cta", "callToAction")),
      dueDate: parseDueDate(field(record, "dueDate", "due_date", "productionDeadline"), index),
      scheduledAt: parseScheduledAt(
        field(record, "scheduledAt", "scheduled_at", "publishAt", "publishingDate"),
        index,
      ),
      brief: text(field(record, "brief", "contentBrief")),
      visualDirection: text(
        field(record, "visualDirection", "visual_direction", "visualNote"),
      ),
      caption: text(field(record, "caption", "postCaption", "post_caption")),
      schedulingMode:
        text(field(record, "schedulingMode", "scheduling_mode")) === "manual" ||
        format === "story"
          ? "manual"
          : "automatic",
      storyInteraction: parseStoryInteraction(
        field(record, "storyInteraction", "story_interaction", "interaction"),
        format,
        index,
        warnings,
      ),
      reelDetails: {
        ...EMPTY_REEL_DETAILS,
        hook: text(reel.hook),
        script: text(field(reel, "script", "filmingScript")),
        shotList: text(field(reel, "shotList", "shot_list")),
        editingFlow: text(field(reel, "editingFlow", "editing_flow")),
        onScreenText: text(field(reel, "onScreenText", "on_screen_text")),
        cta: text(reel.cta),
        videoUrl: text(field(reel, "videoUrl", "video_url")),
        footageLinks: stringList(field(reel, "footageLinks", "footage_links")),
        referenceLinks: stringList(field(reel, "referenceLinks", "reference_links")),
      },
      requiresFilming,
      filmingDetails: {
        ...EMPTY_SOCIAL_FILMING_DETAILS,
        filmingDate: text(field(filming, "filmingDate", "filming_date", "date")),
        participants: stringList(filming.participants),
        needsModels: field(filming, "needsModels", "needs_models") === true,
        preparation: text(field(filming, "preparation", "props")),
        script: text(field(filming, "script", "filmingScript")),
        shotList: text(field(filming, "shotList", "shot_list")),
        rawFootageLinks: stringList(
          field(filming, "rawFootageLinks", "raw_footage_links"),
        ),
        filmed: filming.filmed === true,
      },
      slides: parseSlides(record.slides, format, index, warnings),
    };
  });

  return { posts, warnings };
}

export const SOCIAL_CONTENT_IMPORT_EXAMPLE = JSON.stringify(
  {
    posts: [
      {
        title: "September community check-in",
        format: "story",
        platform: "Instagram",
        purpose: "Learn what followers want to see next month.",
        contentPillar: "Community",
        targetAudience: "Existing followers",
        cta: "Vote in the poll",
        dueDate: "2026-09-12",
        scheduledAt: "2026-09-15T10:00:00-04:00",
        brief: "A warm, simple two-frame Story.",
        visualDirection: "Brand background with large, high-contrast type.",
        caption: "",
        schedulingMode: "manual",
        storyInteraction: {
          type: "poll",
          prompt: "What should we share more of?",
          options: ["Tips", "Behind the scenes"],
        },
        slides: [
          {
            onScreenText: "Help shape next month’s content",
            visualDirection: "Friendly team photo with a soft overlay",
            caption: "",
          },
          {
            onScreenText: "Vote below",
            visualDirection: "Clean brand-colour background",
            caption: "",
          },
        ],
      },
      {
        title: "A quick behind-the-scenes Reel",
        format: "reel",
        platform: "Instagram",
        purpose: "Show the process and build trust.",
        contentPillar: "Behind the scenes",
        targetAudience: "Prospective clients",
        cta: "Follow for the finished result",
        dueDate: "2026-09-18",
        scheduledAt: "2026-09-22T12:00:00-04:00",
        brief: "Use existing footage; no reshoot required.",
        visualDirection: "Fast, warm, documentary-style edit.",
        caption: "A look at how it comes together.",
        reel: {
          hook: "What really happens before launch day?",
          script: "Opening line and voiceover script…",
          shotList: "1. Wide setup\n2. Detail shot\n3. Team reaction",
          editingFlow: "Cold open → process montage → final reveal → CTA",
          onScreenText: "Before launch / The process / Final reveal",
          cta: "Follow for the finished result",
          videoUrl: "",
          footageLinks: [],
          referenceLinks: [],
        },
      },
      {
        title: "Three things to know carousel",
        format: "carousel",
        platform: "Instagram",
        purpose: "Educate new customers.",
        contentPillar: "Education",
        targetAudience: "New customers",
        cta: "Save this post",
        dueDate: "2026-09-24",
        scheduledAt: "2026-09-29T10:00:00-04:00",
        brief: "A concise, saveable three-slide guide.",
        visualDirection: "Editorial type with one idea per slide.",
        slides: [
          {
            onScreenText: "Three things to know",
            visualDirection: "Bold cover slide",
            caption: "Start here.",
          },
          {
            onScreenText: "The first key point",
            visualDirection: "Supporting photo with short copy",
            caption: "The detail behind point one.",
          },
          {
            onScreenText: "Save this for later",
            visualDirection: "Simple CTA slide",
            caption: "Come back when you need it.",
          },
        ],
      },
    ],
  },
  null,
  2,
);
