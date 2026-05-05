import { NextResponse } from "next/server";

import type { AppSettings } from "@/lib/types";
import { getSettingsForQuery, SettingsServiceError, updateSettingsFromInput } from "@/lib/server/settings/service";
import { clearIntegrationProbeCache, redactSettingsForServiceDrawer } from "@/lib/server/workspace/queries";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getSettingsForQuery());
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<AppSettings> | null;
    const settings = updateSettingsFromInput(body);
    clearIntegrationProbeCache();
    const shouldRedact = new URL(request.url).searchParams.get("redacted") === "1";
    return NextResponse.json(shouldRedact ? redactSettingsForServiceDrawer(settings) : settings);
  } catch (error) {
    if (error instanceof SettingsServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Invalid headers JSON." }, { status: 400 });
  }
}
