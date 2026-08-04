import type { Context } from "hono";
import { performHealthCheck } from "../services/misc.service.js";



export async function handleHealthCheck(c: Context) {
  try {
    const healthStatus = await performHealthCheck();

    
    const statusCode = healthStatus.status === "OK" ? 200 : 503;

    return c.json(healthStatus, statusCode);
  } catch (error) {
    console.error("Health check failed:", error);

    return c.json(
      {
        status: "ERROR",
        timestamp: new Date().toISOString(),
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
}



export async function handleSimpleHealthCheck(c: Context) {
  return c.json({
    status: "OK",
    timestamp: new Date().toISOString(),
  });
}
