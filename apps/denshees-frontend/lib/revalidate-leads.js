import { mutate } from "swr";

/**
 * Revalidate every SWR cache key for a campaign's paginated leads list.
 * Exact-key mutate fails because the live key includes search/filters/page.
 */
export function revalidateCampaignLeads(campaignId) {
  if (!campaignId) return Promise.resolve();
  const marker = `campaign=${campaignId}`;
  return mutate(
    (key) =>
      typeof key === "string" &&
      key.includes("/api/contacts/paginatedapi") &&
      key.includes(marker),
    undefined,
    { revalidate: true },
  );
}

export function revalidateCampaignLeadExtras(campaignId) {
  if (!campaignId) return Promise.resolve();
  return Promise.all([
    revalidateCampaignLeads(campaignId),
    mutate(`/api/contacts/leads-growth?campaign=${campaignId}`),
    mutate(`/api/contacts?campaign=${campaignId}`),
  ]);
}
