"use client";

import {
  SocialApprovalCalendar,
  type ApprovalReviewer,
} from "@/app/_components/SocialApprovalCalendar";
import { useTeamIdentity } from "@/app/team-hub/_components/TeamIdentity";

const INTERNAL_TEAM: ApprovalReviewer[] = [
  {
    key: "Understory_Karen",
    name: "Karen",
    role: "Owner",
    initials: "K",
  },
  {
    key: "Understory_Adrian",
    name: "Adrian",
    role: "Co-owner",
    initials: "A",
  },
];

const REQUIRED_INTERNAL_REVIEWERS = INTERNAL_TEAM.filter(
  (reviewer) => reviewer.key === "Understory_Karen",
);

export function SocialContentCalendarWorkspace({ taskId }: { taskId: string }) {
  const { username, accessLevel, isReady } = useTeamIdentity();
  const currentReviewer =
    isReady && username
      ? INTERNAL_TEAM.find((reviewer) => reviewer.key === username) ?? null
      : null;

  return (
    <SocialApprovalCalendar
      mode="internal"
      workspaceId={taskId}
      currentReviewer={currentReviewer}
      requiredReviewers={REQUIRED_INTERNAL_REVIEWERS}
      canSendToClient={
        accessLevel === "owner" &&
        (username === "Understory_Karen" || username === "Understory_Adrian")
      }
    />
  );
}
