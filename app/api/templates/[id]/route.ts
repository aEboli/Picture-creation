import { NextResponse } from "next/server";

import type { TemplateInput } from "@/lib/types";
import {
  deleteTemplateById,
  getTemplateOrThrow,
  TemplateServiceError,
  updateTemplateById,
} from "@/lib/server/templates/service";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(getTemplateOrThrow(id));
  } catch (error) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Partial<TemplateInput> | null;
    return NextResponse.json(updateTemplateById(id, body));
  } catch (error) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Invalid template input." }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(deleteTemplateById(id));
  } catch (error) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
}
