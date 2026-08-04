



import { Hono } from "hono";
import {
  handleHealthCheck,
  handleSimpleHealthCheck,
} from "../controllers/misc.controller.js";

const miscRoutes = new Hono();


miscRoutes.get("/health", handleHealthCheck);


miscRoutes.get("/ping", handleSimpleHealthCheck);

export { miscRoutes };
