export type NewClientInput = {
  name: string;
  slug: string;
};

export class ClientInputError extends Error {}

export function slugifyClientName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function validateNewClientInput(value: unknown): NewClientInput {
  if (!value || typeof value !== "object") {
    throw new ClientInputError("Enter a client name.");
  }

  const payload = value as Record<string, unknown>;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const requestedSlug =
    typeof payload.slug === "string" ? payload.slug.trim() : "";
  const slug = slugifyClientName(requestedSlug || name);

  if (name.length < 2 || name.length > 100) {
    throw new ClientInputError("Client name must be between 2 and 100 characters.");
  }
  if (slug.length < 2) {
    throw new ClientInputError("Enter a URL slug with at least 2 letters or numbers.");
  }

  return { name, slug };
}

export function validateClientName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 2 || name.length > 100) {
    throw new ClientInputError("Client name must be between 2 and 100 characters.");
  }
  return name;
}
