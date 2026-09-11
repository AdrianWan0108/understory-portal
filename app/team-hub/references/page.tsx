import { ProjectThemeProvider } from "@/app/team-hub/projects/_components/ProjectThemeProvider";
import { GuestSocialMediaReferences } from "./workspace";

export default function TeamSocialMediaReferencesPage() {
  return (
    <ProjectThemeProvider>
      <GuestSocialMediaReferences />
    </ProjectThemeProvider>
  );
}
