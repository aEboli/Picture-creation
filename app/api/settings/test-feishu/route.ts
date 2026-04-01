import { NextResponse } from "next/server";

import type { AppSettings } from "@/lib/types";
import { SettingsServiceError, testFeishuConnectionFromInput } from "@/lib/server/settings/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<AppSettings> | null;
    const result = await testFeishuConnectionFromInput(body);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof SettingsServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Feishu connection test failed." },
      { status: 400 },
    );
  }
}
