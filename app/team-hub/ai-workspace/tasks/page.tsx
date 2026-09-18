import { Workspace } from "../_components/Workspace";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const read = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  return <Workspace section="tasks" taskDefaults={{ ...(read("agent") ? { agent: read("agent") } : {}), title: read("action").replaceAll("_", " "),
    client_id: read("client"), project_id: read("project"), content_item_id: read("content") }} />;
}
