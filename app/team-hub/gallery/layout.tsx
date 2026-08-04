import { ProjectThemeProvider } from "../projects/_components/ProjectThemeProvider";

export default function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProjectThemeProvider>{children}</ProjectThemeProvider>;
}
