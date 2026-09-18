import type { NextRequest } from "next/server";
import { aiActor, aiAdmin, aiError } from "@/lib/ai-workspace/server";

export async function GET(request: NextRequest) {
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const admin = aiAdmin();
  const [clients, projects, people] = await Promise.all([
    admin.from("clients").select("id, name").order("name"),
    admin.from("division_tasks").select("id, client_id, title").order("title").limit(1000),
    admin.from("profiles").select("id, full_name, role").in("role", ["owner", "staff", "contractor"]).order("full_name"),
  ]);
  if (clients.error || projects.error || people.error) return aiError("Could not load options.", 500);
  return Response.json({ clients: clients.data ?? [], projects: projects.data ?? [], people: people.data ?? [] });
}
