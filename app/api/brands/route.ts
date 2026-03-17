import { NextResponse } from "next/server";

import { BrandServiceError, createBrandFromInput, listBrandsForQuery } from "@/lib/server/brands/service";

export async function GET() {
  return NextResponse.json({ brands: listBrandsForQuery() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    return NextResponse.json(createBrandFromInput(body), { status: 201 });
  } catch (error) {
    if (error instanceof BrandServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Invalid brand input." }, { status: 400 });
  }
}
