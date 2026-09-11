import { ProjectThemeProvider } from "@/app/team-hub/projects/_components/ProjectThemeProvider";
import { GuestSocialMediaCalendar } from "./workspace";

export default function TeamSocialMediaCalendarPage() {
  return (
    <ProjectThemeProvider>
      <GuestSocialMediaCalendar />
    </ProjectThemeProvider>
  );
}
