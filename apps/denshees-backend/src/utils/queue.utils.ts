



import { Queue } from "bullmq"
import { redis } from "../config/redis.js"
import { log } from "./logger.js"


export const batchEmailQueue = new Queue("batchEmailQueue", { connection: redis })



export async function queueEmailBatch(emailIds: string[]): Promise<string> {
  const job = await batchEmailQueue.add(
    "process-emails",
    { emailIds },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 60000, 
      },
      removeOnComplete: true,
      removeOnFail: 1000, 
    },
  )

  log("INFO", `Queued ${emailIds.length} emails for processing`, job.id)
  return job.id
}



export async function getEmailBatchStatus(jobId: string): Promise<any> {
  const job = await batchEmailQueue.getJob(jobId)
  if (!job) {
    return { status: "not_found" }
  }

  const state = await job.getState()
  const progress = job.progress

  return {
    id: job.id,
    status: state,
    progress,
    data: job.data,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
  }
}
