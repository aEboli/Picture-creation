import { notFound } from "next/navigation";

import { JobDetailsClient } from "@/components/job-details-client";
import { getClientSafeJobDetailsForQuery } from "@/lib/server/jobs/queries";
import { getUiLanguage } from "@/lib/ui-language";

export default async function JobDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const details = getClientSafeJobDetailsForQuery(id);
  if (!details) {
    notFound();
  }

  const language = await getUiLanguage();
  const itemParam =
    typeof query.itemId === "string" ? query.itemId : typeof query.item === "string" ? query.item : null;
  const initialActiveItemId = itemParam && details.items.some((item) => item.id === itemParam) ? itemParam : null;

  return <JobDetailsClient initialDetails={details} language={language} initialActiveItemId={initialActiveItemId} />;
}
