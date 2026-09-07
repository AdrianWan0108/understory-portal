import "server-only";

export type AssistantAgent = "content" | "research" | "project_manager";

export type AssistantSource = {
  title: string;
  url: string;
};

export type ProviderReply = {
  reply: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: "openai" | "perplexity";
  sources: AssistantSource[];
  estimatedCostUsd: number;
};

export const OPENAI_CONTENT_MODEL =
  process.env.OPENAI_CONTENT_MODEL?.trim() || "gpt-5.6-terra";
export const PERPLEXITY_RESEARCH_MODEL =
  process.env.PERPLEXITY_RESEARCH_MODEL?.trim() || "sonar-pro";

const OPENAI_PRICING = { input: 2, output: 12 };
const PERPLEXITY_PRICING = { input: 3, output: 15, request: 0.01 };

export const PROVIDER_LABELS: Record<AssistantAgent, string> = {
  content: "ChatGPT",
  research: "Perplexity",
  project_manager: "Claude",
};

export function isAssistantAgent(value: unknown): value is AssistantAgent {
  return value === "content" || value === "research" || value === "project_manager";
}

export function getProviderAvailability() {
  return {
    content: Boolean(process.env.OPENAI_API_KEY?.trim()),
    research: Boolean(process.env.PERPLEXITY_API_KEY?.trim()),
    project_manager: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  } satisfies Record<AssistantAgent, boolean>;
}

function estimateTokenCost(
  inputTokens: number,
  outputTokens: number,
  pricing: { input: number; output: number },
) {
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

async function providerError(response: Response, provider: string) {
  const body = await response.text();
  let message = body;
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    message =
      typeof parsed.error === "string"
        ? parsed.error
        : parsed.error?.message || parsed.message || body;
  } catch {
    // Keep the plain response body when the provider did not return JSON.
  }
  throw new Error(`${provider} returned ${response.status}: ${message || response.statusText}`);
}

function extractOpenAIText(body: {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}) {
  if (body.output_text?.trim()) return body.output_text.trim();
  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

export async function runContentSpecialist(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxOutputTokens: number,
): Promise<ProviderReply> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("ChatGPT is not configured yet (missing OPENAI_API_KEY).");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_CONTENT_MODEL,
      instructions: systemPrompt,
      input: messages,
      max_output_tokens: maxOutputTokens,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) await providerError(response, "OpenAI");

  const body = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const reply = extractOpenAIText(body);
  if (!reply) throw new Error("OpenAI returned an empty response.");

  const inputTokens = body.usage?.input_tokens ?? 0;
  const outputTokens = body.usage?.output_tokens ?? 0;
  return {
    reply,
    inputTokens,
    outputTokens,
    model: OPENAI_CONTENT_MODEL,
    provider: "openai",
    sources: [],
    estimatedCostUsd: estimateTokenCost(
      inputTokens,
      outputTokens,
      OPENAI_PRICING,
    ),
  };
}

function sourceTitle(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

export async function runResearcher(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxOutputTokens: number,
): Promise<ProviderReply> {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Perplexity is not configured yet (missing PERPLEXITY_API_KEY).");
  }

  const response = await fetch("https://api.perplexity.ai/v1/sonar", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PERPLEXITY_RESEARCH_MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: maxOutputTokens,
      web_search_options: { search_context_size: "medium" },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) await providerError(response, "Perplexity");

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
    search_results?: Array<{ title?: string; url?: string }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: { total_cost?: number };
    };
  };
  const reply = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) throw new Error("Perplexity returned an empty response.");

  const searchResults = (body.search_results ?? [])
    .filter((item): item is { title?: string; url: string } => Boolean(item.url))
    .map((item) => ({ title: item.title?.trim() || sourceTitle(item.url), url: item.url }));
  const citationResults = (body.citations ?? []).map((url) => ({
    title: sourceTitle(url),
    url,
  }));
  const sources = Array.from(
    new Map([...searchResults, ...citationResults].map((source) => [source.url, source])).values(),
  ).slice(0, 8);
  const inputTokens = body.usage?.prompt_tokens ?? 0;
  const outputTokens = body.usage?.completion_tokens ?? 0;

  return {
    reply,
    inputTokens,
    outputTokens,
    model: PERPLEXITY_RESEARCH_MODEL,
    provider: "perplexity",
    sources,
    estimatedCostUsd:
      body.usage?.cost?.total_cost ??
      estimateTokenCost(inputTokens, outputTokens, PERPLEXITY_PRICING) +
        PERPLEXITY_PRICING.request,
  };
}
