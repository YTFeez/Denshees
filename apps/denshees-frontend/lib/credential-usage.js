



export const ACTIVE_CAMPAIGN_STATUSES = ["RUNNING", "PENDING"];


export function isCampaignActive(campaign) {
  return (
    !!campaign &&
    campaign.deleted === false &&
    ACTIVE_CAMPAIGN_STATUSES.includes(campaign.status)
  );
}


export function activeCampaignWhere() {
  return {
    campaign: {
      deleted: false,
      status: { in: ACTIVE_CAMPAIGN_STATUSES },
    },
  };
}
