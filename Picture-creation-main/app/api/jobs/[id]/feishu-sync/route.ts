import { NextResponse } from "next/server";

import { JobSyncError, rebuildJobFeishuSyncById } from "@/lib/server/jobs/feishu-sync";
import { JobQueryError } from "@/lib/server/jobs/queries";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await rebuildJobFeishuSyncById(id));
  } catch (error) {
    if (error instanceof JobQueryError || error instanceof JobSyncError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}
