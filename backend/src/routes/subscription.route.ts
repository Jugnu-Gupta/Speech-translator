import { verifyJWT } from "../middlewares/auth.middleware";
import { Router } from "express";
import {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels,
    getSubscribedChannelsVideos,
} from "../controllers/subscription.controller";

const router = Router();

// Fetch all videos of channels subscribed to by a current user (secured route)
router.route("/").get(verifyJWT, getSubscribedChannelsVideos);

// Toggle subscription to a channel by a user (secured route)
router.route("/toggle/:channelId").post(verifyJWT, toggleSubscription);

// Fetch all subscribers of a channel (secured route)
router.route("/user/:channelId").get(verifyJWT, getUserChannelSubscribers);

// Fetch all channels subscribed to by a user and mark channel subscribed by curUser in that channel list (secured route)
router.route("/channel/:subscriberId").get(getSubscribedChannels);

export default router;
