import { verifyJWT } from "../middlewares/auth.middleware";
import { Router } from "express";
import {
    getAdminChannelStats,
    getAdminChannelVideos,
} from "../controllers/dashboard.controller";

const router = Router();

// Fetch channel stats (secured route)
router.route("/channel-stats").get(verifyJWT, getAdminChannelStats);

// Fetch channel videos (secured route)
router.route("/channel-videos").get(verifyJWT, getAdminChannelVideos);

export default router;
