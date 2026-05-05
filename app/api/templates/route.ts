import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TEMPLATE_CENTER_RETIRED_MESSAGE = "Template center has been retired.";

function respondTemplateCenterRetired() {
  return NextResponse.json({ error: TEMPLATE_CENTER_RETIRED_MESSAGE }, { status: 410 });
}

export async function GET() {
  return respondTemplateCenterRetired();
}

export async function POST() {
  return respondTemplateCenterRetired();
}
