


export function buildLeadsQuery({ campaignId, search = "", page, filters }) {
  const query = new URLSearchParams({
    campaign: campaignId,
    search,
    sentAtSort: filters.sentAtSort,
    stage: filters.stageFilter,
    statuses: filters.statuses.join(","),
  });
  if (page) query.set("page", String(page));
  return query.toString();
}
