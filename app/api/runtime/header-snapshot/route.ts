import { NextResponse } from "next/server";

import { getRuntimeHeaderSnapshot } from "@/lib/server/runtime/header-snapshot-service";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getRuntimeHeaderSnapshot());
}
