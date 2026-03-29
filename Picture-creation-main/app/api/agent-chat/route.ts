import { NextResponse } from "next/server";

import { AgentChatRequestError, runAgentChatFromFormData } from "@/lib/server/agent-chat/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await runAgentChatFromFormData(await request.formData()));
  } catch (error) {
    if (error instanceof AgentChatRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}

