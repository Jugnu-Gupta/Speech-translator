import { upload } from "../middlewares/multer.middleware";
import { verifyJWT } from "../middlewares/auth.middleware";
import { Router } from "express";
import {
    addView,
    getAllVideo,
    uploadVideo,
    getVideoById,
    videoUpdate,
    deleteVideo,
    streamVideo,
    ToggleVideoPublishStatus,
} from "../controllers/video.controller";

const router = Router();

// Get all videos, upload video (secured routes)
router
    .route("/")
    .get(getAllVideo)
    .post(
        verifyJWT,
        upload.fields([
            { name: "image", maxCount: 1 },
            { name: "video", maxCount: 1 },
        ]),
        uploadVideo
    );

// Get, update, delete video by id (secured routes)
router
    .route("/:videoId")
    .get(getVideoById)
    .patch(verifyJWT, upload.single("image"), videoUpdate)
    .delete(verifyJWT, deleteVideo);

// Add view to video and update watch History (secured route)
router.route("/:videoId/views").post(verifyJWT, addView);

// Stream video (public route)
router.route("/video/:fileName").get(streamVideo);

// Toggle publish status of video (secured route)
router.route("/:videoId/publish").patch(verifyJWT, ToggleVideoPublishStatus);

export default router;
