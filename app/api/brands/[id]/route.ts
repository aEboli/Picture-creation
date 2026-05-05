import { NextResponse } from "next/server";

import { BrandServiceError, deleteBrandById, updateBrandById } from "@/lib/server/brands/service";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as unknown;
    return NextResponse.json(updateBrandById(id, body));
  } catch (error) {
    if (error instanceof BrandServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Invalid brand input." }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    deleteBrandById(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof BrandServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  }
}
