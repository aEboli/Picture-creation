import { NextResponse } from "next/server";

import type { TemplateInput } from "@/lib/types";
import {
  createTemplateFromInput,
  listTemplatesForQuery,
  parseTemplateFilters,
  TemplateServiceError,
} from "@/lib/server/templates/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(listTemplatesForQuery(parseTemplateFilters(searchParams)));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<TemplateInput> | null;
    return NextResponse.json(createTemplateFromInput(body), { status: 201 });
  } catch (error) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Invalid template input." }, { status: 400 });
  }
}
