import type { NextRequest } from "next/server";
import {
  isTrustedMutationOrigin,
  requireFinanceAccess,
} from "@/lib/finance-auth";
import {
  getFinanceStaffPrivateProfiles,
  saveStaffPrivateProfile,
  staffPrivateProfileRouteError,
  validateStaffPrivateDetails,
} from "@/lib/staff-private-profile";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await requireFinanceAccess(request);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  try {
    return Response.json(
      { profiles: await getFinanceStaffPrivateProfiles() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (caught) {
    return staffPrivateProfileRouteError(caught);
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireFinanceAccess(request);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  if (!isTrustedMutationOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const profileId =
      typeof body.profileId === "string" ? body.profileId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(profileId)) {
      return Response.json(
        { error: "Choose a valid staff profile." },
        { status: 422 },
      );
    }
    const details = validateStaffPrivateDetails(body);
    await saveStaffPrivateProfile(profileId, details);
    return Response.json({ ok: true });
  } catch (caught) {
    return staffPrivateProfileRouteError(caught);
  }
}
