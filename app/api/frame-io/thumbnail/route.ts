import type { NextRequest } from "next/server";
import {
  isValidFrameIoSharePart,
  loadFrameIoAssetMedia,
} from "@/lib/frame-io-server";

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get("shareId") ?? "";
  const assetId = request.nextUrl.searchParams.get("assetId") ?? "";

  if (
    !isValidFrameIoSharePart(shareId) ||
    !isValidFrameIoSharePart(assetId)
  ) {
    return errorResponse("Invalid Frame.io share asset", 400);
  }

  let thumbnailUrl: string | null = null;
  try {
    thumbnailUrl =
      (await loadFrameIoAssetMedia(shareId, assetId))?.thumbnailUrl ?? null;
  } catch {
    return errorResponse("Frame.io thumbnail is unavailable", 502);
  }

  if (!thumbnailUrl) {
    return errorResponse("Frame.io thumbnail was not found", 404);
  }

  return new Response(null, {
    status: 307,
    headers: {
      Location: thumbnailUrl,
      "Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
    },
  });
}
