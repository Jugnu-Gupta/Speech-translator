import { healthCheck } from "../controllers/healthCheck.controller";
import { Router } from "express";
const router = Router();

// Health check route
router.route("/").get(healthCheck);

export default router;
