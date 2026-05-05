import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TEMPLATE_CENTER_RETIRED_MESSAGE = "Template center has been retired.";

export async function POST() {
  return NextResponse.json({ error: TEMPLATE_CENTER_RETIRED_MESSAGE }, { status: 410 });
}
