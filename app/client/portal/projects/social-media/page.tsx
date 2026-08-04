"use client";

import {
  SocialApprovalCalendar,
  type ApprovalReviewer,
} from "@/app/_components/SocialApprovalCalendar";
import {
  CLIENT_IDENTITIES,
  useClientIdentity,
} from "../../_components/ClientIdentity";

export default function SocialMediaProjectPage() {
  const { identity, clientSlug, clientName, isReady } = useClientIdentity();
  const profile = identity ? CLIENT_IDENTITIES[identity] : null;
  const requiredReviewers: ApprovalReviewer[] = Object.values(
    CLIENT_IDENTITIES,
  )
    .filter((reviewer) => reviewer.clientSlug === clientSlug)
    .map((reviewer) => ({
      key: reviewer.username,
      name: reviewer.name,
      role: reviewer.role,
      initials: reviewer.initials,
    }));

  return (
    <SocialApprovalCalendar
      mode="client"
      clientSlug={clientSlug}
      clientName={clientName}
      currentReviewer={
        isReady && profile
          ? {
              key: profile.username,
              name: profile.name,
              role: profile.role,
              initials: profile.initials,
            }
          : null
      }
      requiredReviewers={requiredReviewers}
    />
  );
}
