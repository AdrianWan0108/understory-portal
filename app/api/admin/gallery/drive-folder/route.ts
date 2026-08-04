import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const MAX_IMPORTED_FILES = 1000;

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
};

type DriveListResponse = {
  files?: DriveFile[];
  nextPageToken?: string;
  error?: {
    message?: string;
  };
};

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

function parseFolderReference(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname !== "drive.google.com") return null;

    const folderId =
      url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/)?.[1] ??
      url.searchParams.get("id");
    if (!folderId || !/^[A-Za-z0-9_-]{10,}$/.test(folderId)) return null;

    return {
      folderId,
      resourceKey: url.searchParams.get("resourcekey"),
    };
  } catch {
    return null;
  }
}

async function listFolderChildren({
  folderId,
  resourceKey,
  apiKey,
}: {
  folderId: string;
  resourceKey: string | null;
  apiKey: string;
}) {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("q", `'${folderId}' in parents and trashed = false`);
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("orderBy", "name_natural");
    url.searchParams.set(
      "fields",
      "nextPageToken,files(id,name,mimeType,webViewLink)",
    );
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: resourceKey
        ? { "X-Goog-Drive-Resource-Keys": `${folderId}/${resourceKey}` }
        : undefined,
      cache: "no-store",
    });
    const result = (await response.json()) as DriveListResponse;

    if (!response.ok) {
      throw new Error(
        result.error?.message ?? "Google Drive could not read this folder.",
      );
    }

    files.push(...(result.files ?? []));
    pageToken = result.nextPageToken;
  } while (pageToken);

  return files;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      "Google Drive folder import is not configured. Add GOOGLE_DRIVE_API_KEY to the server environment.",
      503,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const folderUrl =
    typeof body === "object" &&
    body !== null &&
    "folderUrl" in body &&
    typeof body.folderUrl === "string"
      ? body.folderUrl
      : "";
  const folder = parseFolderReference(folderUrl);
  if (!folder) {
    return jsonError("Paste a valid Google Drive folder link.", 422);
  }

  try {
    const queue = [folder.folderId];
    const visitedFolders = new Set<string>();
    const imageFiles: DriveFile[] = [];

    while (queue.length && imageFiles.length < MAX_IMPORTED_FILES) {
      const currentFolderId = queue.shift();
      if (!currentFolderId || visitedFolders.has(currentFolderId)) continue;
      visitedFolders.add(currentFolderId);

      const children = await listFolderChildren({
        folderId: currentFolderId,
        resourceKey:
          currentFolderId === folder.folderId ? folder.resourceKey : null,
        apiKey,
      });

      for (const file of children) {
        if (file.mimeType === DRIVE_FOLDER_MIME_TYPE) {
          queue.push(file.id);
        } else if (file.mimeType.startsWith("image/")) {
          imageFiles.push(file);
        }

        if (imageFiles.length >= MAX_IMPORTED_FILES) break;
      }
    }

    return Response.json({
      files: imageFiles.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        driveLink:
          file.webViewLink ??
          `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
      })),
      truncated: imageFiles.length >= MAX_IMPORTED_FILES,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Google Drive could not read this folder.";
    return jsonError(
      `${message} Confirm the folder is shared as “Anyone with the link can view.”`,
      502,
    );
  }
}
