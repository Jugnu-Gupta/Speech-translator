import { verifyJWT } from "../middlewares/auth.middleware";
import { Router } from "express";
import {
    getComments,
    createComment,
    updateComment,
    deleteComment,
} from "../controllers/comment.controller";

const router = Router();

// Fetch all comments of a video/tweet, add a comment to a video/tweet (secured route)
router
    .route("/:entityType/:entityId/:parentId?")
    .get(getComments)
    .post(verifyJWT, createComment);

// Update, delete comment by id (secured route)
router
    .route("/:commentId")
    .patch(verifyJWT, updateComment)
    .delete(verifyJWT, deleteComment);

export default router;
