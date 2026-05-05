import { NextResponse } from "next/server";

import { listJobsForQuery, parseJobListFilters } from "@/lib/server/jobs/queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(listJobsForQuery(parseJobListFilters(searchParams)));
}
