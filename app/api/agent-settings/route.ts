import { NextResponse } from "next/server";

import type { AgentId, AgentProfileSettings } from "@/lib/types";
import {
  AgentSettingsServiceError,
  getAgentSettingsForQuery,
  updateAgentSettingsFromInput,
} from "@/lib/server/agent-settings/service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getAgentSettingsForQuery());
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<Record<AgentId, AgentProfileSettings>> | null;
    return NextResponse.json(updateAgentSettingsFromInput(body));
  } catch (error) {
    if (error instanceof AgentSettingsServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Invalid agent settings." }, { status: 400 });
  }
}
