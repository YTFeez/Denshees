



import { Hono } from "hono";
import { handleEmailOpen } from "../controllers/tracking.controller.js";

const trackingRoutes = new Hono();


trackingRoutes.get("/open", handleEmailOpen);

export { trackingRoutes };
