import { NextResponse } from "next/server";

import { matchTemplatesFromInput, TemplateServiceError } from "@/lib/server/templates/service";
import type { TemplateMatchRequestBody } from "@/lib/server/templates/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as TemplateMatchRequestBody | null;
    return NextResponse.json(matchTemplatesFromInput(body));
  } catch (error) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Missing match fields." }, { status: 400 });
  }
}
