import test from "node:test";
import assert from "node:assert/strict";
import {
  getSafeTeamReturnPath,
  getTeamIdentityForUsername,
  getTeamMemberIdentityForUsername,
  isGuestAllowedTeamPath,
  shouldRestrictSocialContentCardsToUser,
  TEAM_GUEST_DEFAULT_PATH,
  TEAM_MEMBER_PROFILES,
} from "../lib/team-auth.ts";
import {
  ClientInputError,
  slugifyClientName,
  validateClientName,
  validateNewClientInput,
} from "../lib/client-management.ts";

test("guest login is recognized but is not treated as a team member", () => {
  assert.equal(getTeamIdentityForUsername("understory_guest"), "guest");
  assert.equal(getTeamMemberIdentityForUsername("Understory_Guest"), null);
  assert.equal(
    TEAM_MEMBER_PROFILES.some((profile) => profile.username === "Understory_Guest"),
    false,
  );
});

test("guest routes are constrained to the social calendar and references", () => {
  assert.equal(isGuestAllowedTeamPath("/team-hub/social-media-calendar"), true);
  assert.equal(
    isGuestAllowedTeamPath("/team-hub/social-media-calendar/launch-post"),
    true,
  );
  assert.equal(isGuestAllowedTeamPath("/team-hub/references"), true);
  assert.equal(isGuestAllowedTeamPath("/team-hub/client-info/acme"), false);
  assert.equal(isGuestAllowedTeamPath("/team-hub/gallery"), false);
  assert.equal(isGuestAllowedTeamPath("/team-hub/projects"), false);
  assert.equal(isGuestAllowedTeamPath("/team-hub/payroll"), false);
  assert.equal(
    getSafeTeamReturnPath("/team-hub/payroll", "guest"),
    TEAM_GUEST_DEFAULT_PATH,
  );
  assert.equal(
    getSafeTeamReturnPath(
      "/team-hub/social-media-calendar?client=mvp",
      "guest",
    ),
    "/team-hub/social-media-calendar?client=mvp",
  );
});

test("Sure can view every social content card while other staff remain restricted", () => {
  assert.equal(
    shouldRestrictSocialContentCardsToUser({
      username: "Understory_Sure",
      accessLevel: "staff",
    }),
    false,
  );
  assert.equal(
    shouldRestrictSocialContentCardsToUser({
      username: "Understory_Arion",
      accessLevel: "staff",
    }),
    true,
  );
  assert.equal(
    shouldRestrictSocialContentCardsToUser({
      username: "Understory_Karen",
      accessLevel: "owner",
    }),
    false,
  );
});

test("new client input creates a stable URL slug", () => {
  assert.equal(slugifyClientName("  Café North Shore  "), "cafe-north-shore");
  assert.deepEqual(validateNewClientInput({ name: " North Shore Coffee " }), {
    name: "North Shore Coffee",
    slug: "north-shore-coffee",
  });
});

test("new client input rejects unusable names and slugs", () => {
  assert.throws(
    () => validateNewClientInput({ name: "A" }),
    ClientInputError,
  );
  assert.throws(
    () => validateNewClientInput({ name: "茶店" }),
    /URL slug/,
  );
});

test("client names are trimmed and validated before an update", () => {
  assert.equal(validateClientName("  New client name  "), "New client name");
  assert.throws(() => validateClientName("A"), ClientInputError);
});
