import "server-only";

import { ZohoBooksError } from "@/lib/zoho-books";

export function financeRouteError(caught: unknown) {
  if (caught instanceof ZohoBooksError) {
    return Response.json(
      { error: caught.message, code: caught.code },
      { status: caught.status },
    );
  }
  return Response.json(
    { error: "The Finance service could not complete the request." },
    { status: 500 },
  );
}
