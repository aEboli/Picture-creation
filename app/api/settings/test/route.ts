import { NextResponse } from "next/server";

import type { AppSettings } from "@/lib/types";
import { SettingsServiceError, testProviderConnectionFromInput } from "@/lib/server/settings/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<AppSettings> | null;
    const result = await testProviderConnectionFromInput(body);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof SettingsServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Connection test failed." },
      { status: 400 },
    );
  }
}
