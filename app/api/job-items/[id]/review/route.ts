import { NextResponse } from "next/server";

import { JobItemReviewServiceError, updateJobItemReviewById } from "@/lib/server/job-items/review";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { reviewStatus?: string } | null;
    return NextResponse.json(updateJobItemReviewById(id, body?.reviewStatus));
  } catch (error) {
    if (error instanceof JobItemReviewServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Invalid review status." }, { status: 400 });
  }
}
