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

  try {
    const media = await loadFrameIoAssetMedia(shareId, assetId);
    if (!media?.playbackUrl) {
      return errorResponse("Frame.io video file was not found", 404);
    }

    return new Response(null, {
      status: 307,
      headers: {
        Location: media.playbackUrl,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return errorResponse("Frame.io video is unavailable", 502);
  }
}
