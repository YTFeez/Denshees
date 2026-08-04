import { Queue, redisConnection } from "../config/redis.js";

const campaignQueue = new Queue("campaignQueue", {
  connection: redisConnection,
});


const campaignCron =
  process.env.CAMPAIGN_CRON_PATTERN ||
  (process.env.NODE_ENV === "production" ? "0 * * * *" : "* * * * *");

console.log(`[campaign-queue] scheduler cron: ${campaignCron}`);

await campaignQueue.upsertJobScheduler(
  "email-scheduler",
  { pattern: campaignCron },
  {
    name: "campaign-queue",
    opts: {
      backoff: 3,
      attempts: 5,
      removeOnFail: 1000,
    },
  },
);

export default campaignQueue;
