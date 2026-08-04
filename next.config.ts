import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
  async redirects() {
    return [
      {
        source: "/client-portal/approvals/social-media",
        destination: "/client-portal/projects/social-media",
        permanent: true,
      },
      {
        source: "/client/portal",
        destination: "/client-portal",
        permanent: true,
      },
      {
        source: "/client/portal/:path*",
        destination: "/client-portal/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.slack-edge.com",
      },
      {
        protocol: "https",
        hostname: "secure.gravatar.com",
      },
    ],
  },
};

export default nextConfig;
