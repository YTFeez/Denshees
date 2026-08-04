import { Queue } from "bullmq"
import { redis } from "../config/redis.js"
import { log } from "../utils/logger.js"


const batchEmailQueue = new Queue("batchEmailQueue", { connection: redis })


const enqueuedEmailIds = new Set<string>()



export async function enqueueEmailBatches(emailIds: string[]): Promise<string[]> {
  const batchSize = 50 
  const jobIds: string[] = []

  
  for (let i = 0; i < emailIds.length; i += batchSize) {
    const batch = emailIds.slice(i, i + batchSize)

    const job = await batchEmailQueue.add(
      "process-emails",
      { emailIds: batch },
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

    
    batch.forEach((id) => enqueuedEmailIds.add(id))

    jobIds.push(job.id)
    log("INFO", `Enqueued batch of ${batch.length} emails`, job.id)
  }

  return jobIds
}



export async function getEnqueuedEmailIds(): Promise<Set<string>> {
  
  
  return enqueuedEmailIds
}



export function removeEnqueuedEmailIds(emailIds: string[]): void {
  emailIds.forEach((id) => enqueuedEmailIds.delete(id))
}
