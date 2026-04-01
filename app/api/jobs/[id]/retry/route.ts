import { NextResponse } from "next/server";

import { JobLifecycleError, retryJobById } from "@/lib/server/jobs/lifecycle";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = retryJobById(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof JobLifecycleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}
