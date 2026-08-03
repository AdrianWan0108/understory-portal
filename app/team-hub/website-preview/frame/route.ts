import { isIP } from "node:net";
import { resolve } from "node:dns/promises";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 5 * 1024 * 1024;

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  ) {
    return true;
  }

  if (isIP(normalized) !== 4) return false;
  const parts = normalized.split(".").map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

async function assertPublicHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP websites can be previewed.");
  }
  if (url.username || url.password) {
    throw new Error("Preview URLs cannot contain credentials.");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new Error("Private websites cannot be previewed.");
  }

  const addresses = await resolve(url.hostname);
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new Error("Private websites cannot be previewed.");
  }
  return url;
}

async function fetchHtml(initialUrl: string) {
  let currentUrl = await assertPublicHttpUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      cache: "no-store",
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Understory website review preview",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error("The preview URL redirected too many times.");
      }
      currentUrl = await assertPublicHttpUrl(
        new URL(location, currentUrl).toString(),
      );
      continue;
    }

    if (!response.ok) {
      throw new Error(`The website returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error("The preview URL did not return an HTML page.");
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
      throw new Error("The website page is too large to preview.");
    }

    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) {
      throw new Error("The website page is too large to preview.");
    }
    return { html, finalUrl: currentUrl.toString() };
  }

  throw new Error("The website could not be loaded.");
}

function injectPreviewBridge(html: string, baseUrl: string, taskId: string) {
  const baseTag = `<base href="${baseUrl.replaceAll('"', "&quot;")}">`;
  const bridge = `<script>
(() => {
  const taskId = ${JSON.stringify(taskId)};
  let frame = 0;
  const report = () => {
    frame = 0;
    const root = document.documentElement;
    const body = document.body;
    window.parent.postMessage({
      type: "understory-preview-metrics",
      taskId,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollWidth: Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0, window.innerWidth),
      scrollHeight: Math.max(root?.scrollHeight || 0, body?.scrollHeight || 0, window.innerHeight),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    }, "*");
  };
  const scheduleReport = () => {
    if (!frame) frame = requestAnimationFrame(report);
  };
  addEventListener("scroll", scheduleReport, { passive: true });
  addEventListener("resize", scheduleReport, { passive: true });
  addEventListener("load", report);
  document.addEventListener("DOMContentLoaded", report);
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("a")) event.preventDefault();
  }, true);
  document.addEventListener("submit", (event) => event.preventDefault(), true);
  addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.taskId !== taskId) return;
    if (data.type === "understory-preview-scroll-by") {
      window.scrollBy({ top: Number(data.top) || 0, left: 0, behavior: "instant" });
    } else if (data.type === "understory-preview-scroll-to") {
      window.scrollTo({ top: Number(data.top) || 0, left: 0, behavior: "instant" });
    }
  });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(scheduleReport);
    observer.observe(document.documentElement);
    if (document.body) observer.observe(document.body);
  }
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(scheduleReport).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }
  setTimeout(report, 100);
  setTimeout(report, 600);
  setTimeout(report, 1800);
})();
</script>`;

  let nextHtml = html
    // This is a visual review surface, not a second interactive browser. Site
    // hydration can fail in an opaque sandbox and replace otherwise-correct
    // server HTML with an error boundary, so keep the rendered HTML/CSS and
    // inject only the small scroll bridge below.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(
      /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi,
      "",
    );
  nextHtml = /<head\b[^>]*>/i.test(nextHtml)
    ? nextHtml.replace(/<head\b[^>]*>/i, (head) => `${head}${baseTag}`)
    : `${baseTag}${nextHtml}`;
  return /<\/body>/i.test(nextHtml)
    ? nextHtml.replace(/<\/body>/i, `${bridge}</body>`)
    : `${nextHtml}${bridge}`;
}

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get("taskId")?.trim();
  if (!taskId) {
    return new Response("Missing website task.", { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return new Response("Website preview is unavailable.", { status: 503 });
  }

  const { data: task, error } = await supabase
    .from("website_tasks")
    .select("live_url")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !task?.live_url) {
    return new Response("Website task not found.", { status: 404 });
  }

  try {
    const { html, finalUrl } = await fetchHtml(task.live_url);
    return new Response(injectPreviewBridge(html, finalUrl, taskId), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; style-src * 'unsafe-inline'; font-src * data:; connect-src * data: blob:; media-src * data: blob:; frame-src *;",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The website could not be loaded.";
    return new Response(message, { status: 502 });
  }
}
