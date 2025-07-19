import { upload } from "../middlewares/multer.middleware";
import { verifyJWT } from "../middlewares/auth.middleware";
import { Router } from "express";
import {
    UpdateUserPassword,
    getCurrentUser,
    updateUserCoverImage,
    getUserChannelPage,
    getUserChannelVideos,
    updateUserDetails,
    updateUserAvatar,
    getWatchHistory,
} from "../controllers/user.controller";

const router = Router();

// Get current user (secured route), Update user details (secured route)
router
    .route("/me")
    .get(verifyJWT, getCurrentUser)
    .patch(verifyJWT, updateUserDetails);

// Change user password (secured route)
router.route("/password").patch(verifyJWT, UpdateUserPassword);

// Update user avatar (secured route)
router
    .route("/avatar")
    .patch(verifyJWT, upload.single("image"), updateUserAvatar);

// Update user cover image (secured route)
router
    .route("/cover-image")
    .patch(verifyJWT, upload.single("image"), updateUserCoverImage);

// Get watch history (secured route)
router.route("/watch-history").get(verifyJWT, getWatchHistory);

// Get channel page by username (secured route)
router.route("/channel/:userName").get(getUserChannelPage);

// Get channel page videos by username (public route)
router.route("/video/:userName").get(getUserChannelVideos);

export default router;
