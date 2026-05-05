import { NextResponse } from "next/server";

import { getClientSafeJobDetailsOrThrow, JobQueryError } from "@/lib/server/jobs/queries";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(getClientSafeJobDetailsOrThrow(id));
  } catch (error) {
    if (error instanceof JobQueryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}
