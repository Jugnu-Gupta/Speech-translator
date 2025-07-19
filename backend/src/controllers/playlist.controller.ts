import { Request, Response } from "express";
import mongoose, { isValidObjectId } from "mongoose";
import { UserType } from "../types/user.type";
import { Playlist } from "../models/playlist.model";
import { User } from "../models/user.model";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";

interface RequestWithUser extends Request {
    user: UserType;
}
interface CreatePlaylistBody {
    name?: string;
    videoId?: string;
}
const createPlaylist = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { name, videoId }: CreatePlaylistBody = req.body;
        if (!name) {
            throw new ApiError(400, "Playlist name is required");
        }
        if (!isValidObjectId(videoId)) {
            throw new ApiError(400, "Invalid video id");
        }
        const playlist = await Playlist.create({
            name,
            ownerId: req.user._id,
            videos: [new mongoose.Types.ObjectId(videoId)],
        });

        if (!playlist) {
            throw new ApiError(400, "Failed to create playlist");
        }

        return res
            .status(201)
            .json(new ApiResponse(201, { playlist }, "Playlist created"));
    }
);

interface GetUserPlaylistQuery {
    userName?: string;
    videoId?: string;
}

const getUserPlaylists = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        let { userName, videoId }: GetUserPlaylistQuery = req.query;
        if (!userName) {
            throw new ApiError(400, "userName is required");
        }
        if (!isValidObjectId(videoId)) {
            videoId = null;
        }

        // get thumbnail of 1st video and no. of videos of each playlist
        const playlists = await User.aggregate([
            { $match: { userName: userName.toLowerCase() } },
            {
                $lookup: {
                    from: "playlists",
                    localField: "_id",
                    foreignField: "ownerId",
                    as: "playlists",
                    pipeline: [
                        {
                            $lookup: {
                                from: "videos",
                                localField: "videos",
                                foreignField: "_id",
                                as: "videos",
                            },
                        },
                        {
                            $addFields: {
                                videoStatus: {
                                    $cond: {
                                        if: {
                                            $in: [
                                                new mongoose.Types.ObjectId(
                                                    videoId
                                                ),
                                                "$videos._id",
                                            ],
                                        },
                                        then: true,
                                        else: false,
                                    },
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 1,
                                name: 1,
                                description: 1,
                                videoStatus: 1,
                                thumbnail: {
                                    $arrayElemAt: ["$videos.thumbnail", 0],
                                },
                                videoId: {
                                    $arrayElemAt: ["$videos._id", 0],
                                },
                                noOfVideos: { $size: "$videos" },
                                createdAt: 1,
                                updatedAt: 1,
                            },
                        },
                    ],
                },
            },
            {
                $project: {
                    _id: 1,
                    playlists: 1,
                    fullName: 1,
                    userName: 1,
                },
            },
        ]);
        if (!playlists) {
            throw new ApiError(404, "No playlists found");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { playlists: playlists[0].playlists },
                    "User playlists"
                )
            );
    }
);

const getPlaylistById = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { playlistId } = req.params as { playlistId: string };

        if (!isValidObjectId(playlistId)) {
            throw new ApiError(400, "Invalid playlist id");
        }

        // get videos of playlist and owner info
        const playlist = await Playlist.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(playlistId) } },
            {
                $lookup: {
                    from: "videos",
                    localField: "videos",
                    foreignField: "_id",
                    as: "videos",
                    pipeline: [
                        {
                            $lookup: {
                                from: "users",
                                localField: "ownerId",
                                foreignField: "_id",
                                as: "owner",
                                pipeline: [
                                    {
                                        $project: {
                                            fullName: 1,
                                            userName: 1,
                                            avatar: 1,
                                        },
                                    },
                                ],
                            },
                        },
                        {
                            $project: {
                                _id: 1,
                                thumbnail: 1,
                                title: 1,
                                description: 1,
                                duration: 1,
                                views: 1,
                                createdAt: 1,
                                updatedAt: 1,
                                owner: {
                                    $arrayElemAt: ["$owner", 0],
                                },
                            },
                        },
                    ],
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "ownerId",
                    foreignField: "_id",
                    as: "owner",
                },
            },
            { $addFields: { owner: { $arrayElemAt: ["$owner", 0] } } },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    description: 1,
                    videos: 1,
                    noOfVideos: { $size: "$videos" },
                    owner: {
                        userName: "$owner.userName",
                        fullName: "$owner.fullName",
                        avatar: "$owner.avatar",
                    },
                    updatedAt: 1,
                    createdAt: 1,
                },
            },
        ]);
        if (!playlist) {
            throw new ApiError(404, "Playlist not found");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { playlist: playlist[0] },
                    "Playlist found"
                )
            );
    }
);

interface AddVideoInPlaylistParams {
    playlistId: string;
    videoId: string;
}
const addVideoInPlaylist = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { playlistId, videoId } =
            req.params as unknown as AddVideoInPlaylistParams;
        if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
            throw new ApiError(400, "Invalid playlist or video Id");
        }

        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            throw new ApiError(404, "Playlist not found");
        }
        if (playlist.videos.some((id) => id.toString() === videoId)) {
            throw new ApiError(400, "Video already exists in playlist");
        }

        const updatedPlaylist = await Playlist.findByIdAndUpdate(
            playlistId,
            { $push: { videos: new mongoose.Types.ObjectId(videoId) } },
            { new: true }
        );

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { playlist: updatedPlaylist },
                    "Video added to playlist"
                )
            );
    }
);

interface DeleteVideoFromPlaylistParams {
    playlistId: string;
    videoId: string;
}

const deleteVideoFromPlaylist = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { playlistId, videoId } =
            req.params as unknown as DeleteVideoFromPlaylistParams;
        if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
            throw new ApiError(400, "Invalid playlist or video Id");
        }

        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            throw new ApiError(404, "Playlist not found");
        }
        if (!playlist.videos.some((id) => id.toString() === videoId)) {
            throw new ApiError(400, "Video does not exist in playlist");
        }

        playlist.videos = playlist.videos.filter(
            (id) => id.toString() !== videoId
        );
        await playlist.save({ validateBeforeSave: false });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { playlist },
                    "Video removed from playlist"
                )
            );
    }
);

const deletePlaylist = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { playlistId } = req.params as { playlistId: string };
        if (!isValidObjectId(playlistId)) {
            throw new ApiError(400, "Invalid playlist Id");
        }

        const playlist = await Playlist.findByIdAndDelete(playlistId);
        if (!playlist) {
            throw new ApiError(404, "Playlist not found");
        }

        return res
            .status(200)
            .json(new ApiResponse(200, null, "Playlist deleted"));
    }
);

const updatePlaylist = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { playlistId } = req.params as { playlistId: string };
        const { name } = req.body as { name: string };
        if (!isValidObjectId(playlistId)) {
            throw new ApiError(400, "Invalid playlist Id");
        }
        if (!name) {
            throw new ApiError(400, "Name or description is required");
        }

        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            throw new ApiError(404, "Playlist not found");
        }

        // update playlist
        playlist.name = name;
        await playlist.save({ validateBeforeSave: false });

        return res
            .status(200)
            .json(new ApiResponse(200, { playlist }, "Playlist updated"));
    }
);

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoInPlaylist,
    deleteVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist,
};
