import { Worker } from "bullmq"
import { redis } from "../config/redis.js"
import { processEmailBatchJob } from "../jobs/batch-emails.js"

const batchemailWorker = new Worker(
  "batchEmailQueue",
  async (job) => {
    
    const results = await processEmailBatchJob(job.data)

    console.log(
      `Job ${job.id} completed. Processed ${results.length} emails. Waiting 1 minute before processing the next job...`,
    )

    
    await new Promise((resolve) => setTimeout(resolve, 60000))
  },
  { connection: redis, concurrency: 1 }, 
)


batchemailWorker.on("completed", (job) => {
  console.log(`Job ${job.id} has completed successfully`)
})

batchemailWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} has failed with error: ${err.message}`)
})

export { batchemailWorker }
