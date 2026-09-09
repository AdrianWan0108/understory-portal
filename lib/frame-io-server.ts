import "server-only";

const FRAME_IO_SHARE_PART_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const FRAME_IO_MEDIA_HOSTS = new Set([
  "assets.frame.io",
  "picture.frame.io",
  "picture2.frame.io",
  "stream-download.frame.io",
]);

type FrameIoTranscode = {
  downloadUrl?: string | null;
  encodeStatus?: string | null;
  key?: string | null;
  streamUrl?: string | null;
};

type FrameIoAsset = {
  thumbnailImageUrl?: { url?: string | null } | null;
  media?: {
    imageTranscodes?: FrameIoTranscode[] | null;
    original?: {
      downloadUrl?: string | null;
      inlineUrl?: string | null;
    } | null;
    videoTranscodes?: FrameIoTranscode[] | null;
  } | null;
};

type FrameIoAssetsResponse = {
  data?: { assets?: FrameIoAsset[] | null } | null;
};

export type FrameIoAssetMedia = {
  thumbnailUrl: string | null;
  playbackUrl: string | null;
};

const FRAME_IO_ASSET_QUERY = `
  query GetAssetsForViewer($assetIds: [ID!]!) @stewardship(stewards: [VIEWER]) {
    assets(assetIds: $assetIds) {
      id
      ... on VideoAsset {
        thumbnailImageUrl {
          url
        }
        media {
          imageTranscodes {
            encodeStatus
            key
            streamUrl
          }
          original {
            downloadUrl
            inlineUrl
          }
          videoTranscodes {
            downloadUrl
            encodeStatus
            key
          }
        }
      }
    }
  }
`;

export function isValidFrameIoSharePart(value: string) {
  return FRAME_IO_SHARE_PART_PATTERN.test(value);
}

function isAllowedFrameMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && FRAME_IO_MEDIA_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function usableTranscode(
  transcodes: FrameIoTranscode[],
  preferredKeys: string[],
  urlKey: "downloadUrl" | "streamUrl" = "streamUrl",
) {
  for (const key of preferredKeys) {
    const transcode = transcodes.find(
      (candidate) =>
        candidate.key === key &&
        candidate.encodeStatus !== "failed" &&
        candidate.encodeStatus !== "FAILURE" &&
        candidate[urlKey],
    );
    const url = transcode?.[urlKey];
    if (url && isAllowedFrameMediaUrl(url)) {
      return url;
    }
  }

  return null;
}

export async function loadFrameIoAssetMedia(
  shareId: string,
  assetId: string,
): Promise<FrameIoAssetMedia | null> {
  const frameResponse = await fetch("https://api.frame.io/graphql", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://next.frame.io",
      Referer: "https://next.frame.io/",
      "apollographql-client-name": "web-app",
      "x-frameio-share-authentication": Buffer.from(shareId).toString("base64"),
      "x-frameio-session-id": crypto.randomUUID(),
      "x-gql-op": "GetAssetsForViewer",
      "x-telemetry-event-name": "graphql.GetAssetsForViewer",
    },
    body: JSON.stringify({
      operationName: "GetAssetsForViewer",
      variables: { assetIds: [assetId] },
      query: FRAME_IO_ASSET_QUERY,
    }),
  });

  if (!frameResponse.ok) {
    throw new Error(`Frame.io returned ${frameResponse.status}`);
  }

  const payload = (await frameResponse.json()) as FrameIoAssetsResponse;
  const asset = payload.data?.assets?.[0];
  if (!asset) return null;

  const thumbnailImageUrl = asset.thumbnailImageUrl?.url;
  const thumbnailUrl =
    thumbnailImageUrl && isAllowedFrameMediaUrl(thumbnailImageUrl)
      ? thumbnailImageUrl
      : usableTranscode(asset.media?.imageTranscodes ?? [], [
          "image_small",
          "image_medium",
          "image_full",
        ]);
  const videoTranscodes = asset.media?.videoTranscodes ?? [];
  const originalPlaybackUrl =
    asset.media?.original?.inlineUrl || asset.media?.original?.downloadUrl;

  return {
    thumbnailUrl,
    playbackUrl:
      originalPlaybackUrl && isAllowedFrameMediaUrl(originalPlaybackUrl)
        ? originalPlaybackUrl
        : usableTranscode(
            videoTranscodes,
            [
              "h264_1080_best",
              "h264_1080",
              "h264_720",
              "h264_540",
              "h264_360",
            ],
            "downloadUrl",
          ),
  };
}
