import { NextResponse } from "next/server";

import {
  createGenerationJobFromFormData,
  GenerationRequestError,
} from "@/lib/server/generation/create-job";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { jobId } = await createGenerationJobFromFormData(await request.formData());
    return NextResponse.json({ jobId });
  } catch (error) {
    if (error instanceof GenerationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}
