import { Workspace } from "../../_components/Workspace";
export default async function Page({ params }: { params: Promise<{ taskId: string }> }) { const { taskId } = await params; return <Workspace section="detail" taskId={taskId} />; }
