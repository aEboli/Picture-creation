import { NextResponse } from "next/server";

import type { MultimodalSettingsInput } from "@/lib/server/settings/service";
import { SettingsServiceError, testMultimodalConnectionFromInput } from "@/lib/server/settings/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as MultimodalSettingsInput | null;
    const result = await testMultimodalConnectionFromInput(body);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof SettingsServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Multimodal diagnostic failed.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
