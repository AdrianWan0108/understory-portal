export type ClientBrandProfile = {
  name: string;
  logoUrl: string;
  palette: Array<{
    name: string;
    hex: string;
  }>;
};

const CLIENT_BRANDS: Record<string, ClientBrandProfile> = {
  "unknown-dancecrew": {
    name: "Unknown Dance Crew",
    logoUrl: "/unknown-dancecrew-logo.jpeg",
    palette: [
      { name: "Midnight navy", hex: "#071B3D" },
      { name: "Crew blue", hex: "#173E73" },
      { name: "Steel silver", hex: "#98A4B6" },
      { name: "Bright silver", hex: "#D7DCE4" },
    ],
  },
};

export function clientBrandProfile(
  slug: string | null | undefined,
): ClientBrandProfile | null {
  return slug ? CLIENT_BRANDS[slug] ?? null : null;
}
