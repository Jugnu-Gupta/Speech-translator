import { verifyJWT } from "../middlewares/auth.middleware";
import { Router } from "express";
import {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoInPlaylist,
    deleteVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist,
} from "../controllers/playlist.controller";

const router = Router();

// Create a new playlist, get all playlists of a user
router.route("/").get(getUserPlaylists).post(verifyJWT, createPlaylist);

// Get playlist by id, and Update, delete playlist by id (secured route)
router
    .route("/:playlistId")
    .get(getPlaylistById)
    .patch(verifyJWT, updatePlaylist)
    .delete(verifyJWT, deletePlaylist);

// Add, remove video to playlist by id (secured route)
router
    .route("/:playlistId/:videoId")
    .post(verifyJWT, addVideoInPlaylist)
    .delete(verifyJWT, deleteVideoFromPlaylist);

export default router;
