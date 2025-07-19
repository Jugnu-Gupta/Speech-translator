import { Request, Response } from "express";
import mongoose, { isValidObjectId, Mongoose } from "mongoose";
import { Video } from "../models/video.model";
import { Like } from "../models/like.model";
import { Comment } from "../models/comment.model";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { UserType } from "types/user.type";
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary";
import { getVideoQuality } from "../utils/getVideoQuality";
import { User } from "../models/user.model";
import { Playlist } from "../models/playlist.model";
import {
    durationCriteria,
    sortCritieria,
    uploadDateCriteria,
} from "../config/constants/controllers.constants";
import request from "request";
import fs, { promises as fsPromises } from "fs";
import path from "path";
import { UploadApiResponse } from "cloudinary";
import { DeleteApiResponse } from "cloudinary";

interface RequestWithUser extends Request {
    user: UserType;
}

interface GetAllVideoQuery {
    page: string;
    limit: string;
    uploadDate: string;
    type: string;
    query: string;
    sortBy: string;
    duration: string;
}

// controller to fetch all videos based on query, sort, pagination
const getAllVideo = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const {
            page = "1",
            limit = "10",
            query = "",
            uploadDate = "anytime",
            type = "video",
            sortBy = "relevance",
            duration = "any",
        } = req.query as unknown as GetAllVideoQuery;
        const skip: number = (parseInt(page) - 1) * parseInt(limit);
        const searchQuery: string = decodeURIComponent(query);
        const uploadDateOption: number = uploadDateCriteria.get(uploadDate);
        const durationOption: [number, number] = durationCriteria.get(duration);
        const sortOption: string = sortCritieria.get(sortBy);
        const sortOptionValue: -1 | 1 = -1;

        let data;
        if (type === "video") {
            const pipeline = [
                ...(query !== ""
                    ? [
                          {
                              $search: {
                                  index: "default",
                                  text: {
                                      query: searchQuery,
                                      path: ["title", "description"],
                                      fuzzy: { maxEdits: 2, prefixLength: 1 },
                                  },
                              },
                          },
                      ]
                    : []),
                {
                    $match: {
                        isPublished: true,
                        duration: {
                            $gte: durationOption[0],
                            $lte: durationOption[1],
                        },
                        createdAt: {
                            $gte: new Date(
                                new Date().getTime() -
                                    uploadDateOption * 24 * 60 * 60 * 1000
                            ),
                        },
                    },
                },
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
                    $addFields: {
                        owner: { $arrayElemAt: ["$owner", 0] },
                        score: { $meta: "searchScore" },
                    },
                },
                { $sort: { [sortOption]: sortOptionValue } },
                { $skip: skip },
                { $limit: parseInt(limit) },
                {
                    $project: {
                        title: 1,
                        description: 1,
                        thumbnail: 1,
                        owner: 1,
                        duration: 1,
                        views: 1,
                        createdAt: 1,
                        updatedAt: 1,
                    },
                },
            ];
            data = await Video.aggregate(pipeline);
            if (!data) {
                throw new ApiError(404, "No videos found");
            }
        } else if (type === "channel") {
            if (!searchQuery) {
                throw new ApiError(
                    400,
                    "Search query is required for channel search"
                );
            }
            data = await User.aggregate([
                {
                    $search: {
                        index: "users",
                        text: {
                            query: searchQuery,
                            path: ["fullName", "userName"],
                            fuzzy: { maxEdits: 2, prefixLength: 1 },
                        },
                    },
                },
                {
                    $match: {
                        createdAt: {
                            $gte: new Date(
                                new Date().getTime() -
                                    uploadDateOption * 24 * 60 * 60 * 1000
                            ),
                        },
                    },
                },
                {
                    $lookup: {
                        from: "subscriptions",
                        localField: "_id",
                        foreignField: "channelId",
                        as: "subscribers",
                    },
                },
                {
                    $addFields: {
                        score: { $meta: "searchScore" },
                        subscribers: { $size: "$subscribers" },
                    },
                },
                { $sort: { [sortOption]: sortOptionValue } },
                { $skip: skip },
                { $limit: parseInt(limit) },
                {
                    $project: {
                        fullName: 1,
                        userName: 1,
                        avatar: 1,
                        subscribers: 1,
                        createdAt: 1,
                        updatedAt: 1,
                    },
                },
            ]);
            if (!data) {
                throw new ApiError(404, "No channels found");
            }
        } else if (type === "playlist") {
            if (!searchQuery) {
                throw new ApiError(
                    400,
                    "Search query is required for playlist search"
                );
            }
            data = await Playlist.aggregate([
                {
                    $search: {
                        index: "playlists",
                        text: {
                            query: searchQuery,
                            path: ["name"],
                            fuzzy: { maxEdits: 2, prefixLength: 1 },
                        },
                    },
                },
                {
                    $match: {
                        createdAt: {
                            $gte: new Date(
                                new Date().getTime() -
                                    uploadDateOption * 24 * 60 * 60 * 1000
                            ),
                        },
                    },
                },
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
                    $lookup: {
                        from: "videos",
                        localField: "videos",
                        foreignField: "_id",
                        as: "videos",
                    },
                },
                {
                    $addFields: {
                        score: { $meta: "searchScore" },
                        owner: { $arrayElemAt: ["$owner", 0] },
                        thumbnail: { $arrayElemAt: ["$videos.thumbnail", 0] },
                        videoId: { $arrayElemAt: ["$videos._id", 0] },
                        noOfVideos: { $size: "$videos" },
                        description: {
                            $arrayElemAt: ["$videos.description", 0],
                        },
                    },
                },
                { $sort: { [sortOption]: sortOptionValue } },
                { $skip: skip },
                { $limit: parseInt(limit) },
                {
                    $project: {
                        name: 1,
                        thumbnail: 1,
                        noOfVideos: 1,
                        videoId: 1,
                        description: 1,
                        owner: 1,
                        createdAt: 1,
                        updatedAt: 1,
                    },
                },
            ]);
            if (!data) {
                throw new ApiError(404, "No playlist found");
            }
        }

        return res
            .status(200)
            .json(
                new ApiResponse(200, { data }, "Videos fetched successfully")
            );
    }
);

const streamVideo = asyncHandler(async (req: Request, res: Response) => {
    const { fileName } = req.params as { fileName: string };
    const cloudUrl = `http://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/ar_16:9,q_auto:eco,c_fill,h_240,w_426/${fileName}`;
    request(cloudUrl)
        .on("response", (response) => {
            if (response.statusCode !== 200) {
                console.error(`Error fetching video: ${response.statusCode}`);
                return res
                    .status(404)
                    .json(new ApiResponse(404, null, "Video not found"));
            }
        })
        .on("error", (err) => {
            console.error("Request error:", err.message);
            return res
                .status(500)
                .json(new ApiResponse(500, null, "Failed to fetch video"));
        })
        .pipe(res);
});

const addView = asyncHandler(async (req: RequestWithUser, res: Response) => {
    const { videoId } = req.params as { videoId: string };
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video id");
    }

    // update views of video
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found");
    }
    video.views += 1;
    await video.save({ validateBeforeSave: false });

    // update watch history of user
    const user = await User.findById(req.user?._id).select("watchHistory");
    if (
        user.watchHistory.some((video) => video.videoId.toString() === videoId)
    ) {
        user.watchHistory = user.watchHistory.map((video) => {
            if (video.videoId.toString() === videoId) {
                video.watchedAt = new Date();
            }
            return video;
        });
        await user.save({ validateBeforeSave: false });
    } else {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                watchHistory: {
                    videoId: new mongoose.Types.ObjectId(videoId),
                },
            },
        });
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                null,
                "View added and updated history successfully"
            )
        );
});

interface UploadedFile {
    path: string;
}
interface CustomFiles {
    image?: UploadedFile[];
    video?: UploadedFile[];
}
interface FileType {
    files?: CustomFiles;
}

interface UploadVideoBody {
    title?: string;
    description?: string;
    isLastChunk: string;
    fileName: string;
}
interface UploadVideoQuery {
    uniqueId: string;
    chunkNumber: string;
    totalChunks: string;
}

const uploadVideo = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { title, description, isLastChunk, fileName }: UploadVideoBody =
            req.body;
        const { uniqueId, chunkNumber, totalChunks } =
            req.query as unknown as UploadVideoQuery;
        const TEMP_DIR = "/tmp";

        if (!uniqueId || !chunkNumber || !totalChunks) {
            throw new ApiError(
                400,
                "Missing required chunking metadata (uniqueId, chunkNumber, totalChunks)"
            );
        }

        try {
            if (parseInt(isLastChunk)) {
                console.log("Merging chunks...");
                if (!title || !description) {
                    const missingField = !title ? "Title" : "Description";
                    throw new ApiError(400, `${missingField} is required`);
                }

                const chunkDir = `${TEMP_DIR}/${uniqueId}`;
                const finalVideoPath = path.join(
                    TEMP_DIR,
                    `${uniqueId}/finalVideo.mp4`
                );
                const writeStream = fs.createWriteStream(finalVideoPath);

                // Loop over all chunks and append them to the final video
                for (let i = 1; i <= parseInt(totalChunks); i++) {
                    const chunkPath = path.join(
                        chunkDir,
                        `video-${uniqueId}-chunk-${i}${path.extname(fileName)}`
                    );

                    if (!fs.existsSync(chunkPath)) {
                        throw new Error(`Chunk ${i} is missing`);
                    }

                    const chunkData = fs.readFileSync(chunkPath);
                    writeStream.write(chunkData);
                    fs.unlinkSync(chunkPath); // Delete chunk after appending
                    console.log(`Appended chunk ${i} to final video`);
                }

                writeStream.end(); // Finalize the video file

                console.log(
                    `File ${fileName} merged successfully at ${finalVideoPath}`
                );

                const thumbnailLocalPath = (req as FileType).files?.image?.[0]
                    ?.path;
                if (!thumbnailLocalPath) {
                    throw new ApiError(400, "Thumbnail is required");
                }

                const thumbnail: UploadApiResponse | null =
                    await uploadOnCloudinary(
                        path.resolve(thumbnailLocalPath),
                        "image"
                    );

                const videoFile: UploadApiResponse | null =
                    await uploadOnCloudinary(finalVideoPath, "video");

                // Validate uploads
                if (!videoFile?.secure_url || !videoFile?.public_id) {
                    throw new ApiError(
                        500,
                        "Failed to upload video to Cloudinary"
                    );
                }
                if (!thumbnail?.secure_url || !thumbnail?.public_id) {
                    throw new ApiError(
                        500,
                        "Failed to upload thumbnail to Cloudinary"
                    );
                }

                const videoQuality = getVideoQuality(
                    videoFile.width,
                    videoFile.height
                );

                // Save the video details to the database
                const video = await Video.create({
                    videoFile: {
                        publicId: videoFile.public_id,
                        url: videoFile.secure_url,
                    },
                    thumbnail: {
                        publicId: thumbnail.public_id,
                        url: thumbnail.secure_url,
                    },
                    title,
                    description,
                    quality: videoQuality,
                    duration: videoFile.duration,
                    ownerId: req.user?._id,
                    isPublished: false,
                });

                return res
                    .status(201)
                    .json(
                        new ApiResponse(
                            201,
                            video,
                            "Video uploaded and processed successfully"
                        )
                    );
            } else {
                return res
                    .status(200)
                    .json(
                        new ApiResponse(
                            200,
                            (req as FileType).files?.video?.[0]?.path,
                            "Chunk uploaded successfully"
                        )
                    );
            }
        } catch (error) {
            console.error("Error during finalization: ", error);
            throw new ApiError(400, `Upload failed: ${error.message}`);
        } finally {
            // Remove the chunk directory after all chunks are processed and merged
            if (parseInt(isLastChunk)) {
                const chunkDir = `${TEMP_DIR}/${uniqueId}`;
                fsPromises.rm(chunkDir, { recursive: true });
            }
        }
    }
);

const getVideoById = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        let { videoId } = req.params as { videoId: string };
        let { userId } = req.query as { userId?: string };
        if (!isValidObjectId(videoId)) {
            throw new ApiError(400, "Invalid video id");
        }
        if (!isValidObjectId(userId)) {
            userId = null;
        }

        // get video details like likes, dislikes
        const video = await Video.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(videoId) } },
            {
                $lookup: {
                    from: "likes",
                    let: { videoId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$entityId", "$$videoId"],
                                        },
                                        {
                                            $eq: ["$entityType", "video"],
                                        },
                                    ],
                                },
                            },
                        },
                        { $project: { _id: 1, isLiked: 1, likedBy: 1 } },
                    ],
                    as: "videoLikes",
                },
            },
            {
                $addFields: {
                    likeStatus: {
                        $cond: {
                            if: {
                                $in: [
                                    new mongoose.Types.ObjectId(userId),
                                    "$videoLikes.likedBy",
                                ],
                            },
                            then: {
                                $cond: {
                                    if: {
                                        $arrayElemAt: [
                                            "$videoLikes.isLiked",
                                            {
                                                $indexOfArray: [
                                                    "$videoLikes.likedBy",
                                                    new mongoose.Types.ObjectId(
                                                        userId
                                                    ),
                                                ],
                                            },
                                        ],
                                    },
                                    then: 1,
                                    else: -1,
                                },
                            },
                            else: 0,
                        },
                    },
                    likes: {
                        $size: {
                            $filter: {
                                input: "$videoLikes",
                                as: "like",
                                cond: { $eq: ["$$like.isLiked", true] },
                            },
                        },
                    },
                    dislikes: {
                        $size: {
                            $filter: {
                                input: "$videoLikes",
                                as: "like",
                                cond: { $eq: ["$$like.isLiked", false] },
                            },
                        },
                    },
                },
            },
            {
                $lookup: {
                    from: "subscriptions",
                    localField: "ownerId",
                    foreignField: "channelId",
                    as: "subscribers",
                },
            },
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
                $lookup: {
                    from: "comments",
                    let: { videoId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$entityId", "$$videoId"],
                                        },
                                        {
                                            $eq: ["$entityType", "video"],
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    as: "comments",
                },
            },
            {
                $project: {
                    title: 1,
                    likeStatus: 1,
                    description: 1,
                    thumbnail: 1,
                    videoFile: 1,
                    noOfComments: { $size: "$comments" },
                    owner: { $arrayElemAt: ["$owner", 0] },
                    duration: 1,
                    quality: 1,
                    isPublished: 1,
                    subscribers: { $size: "$subscribers" },
                    isSubscribed: {
                        $in: [
                            new mongoose.Types.ObjectId(userId),
                            "$subscribers.subscriberId",
                        ],
                    },
                    views: 1,
                    likes: 1,
                    dislikes: 1,
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
        ]);
        if (!video) {
            throw new ApiError(404, "Video not found");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { video: video[0] },
                    "Video fetched successfully"
                )
            );
    }
);

interface VideoUpdateBody {
    title?: string;
    description?: string;
}

// controller to update video details like title, description, thumbnail
const videoUpdate = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { videoId } = req.params as { videoId: string };
        const { title, description }: VideoUpdateBody = req.body;
        const thumbnailLocalPath: string | undefined = req.file?.path;

        try {
            if (!isValidObjectId(videoId)) {
                throw new ApiError(400, "Invalid Video Id");
            }
            if (!title && !description && !thumbnailLocalPath) {
                throw new ApiError(
                    400,
                    "Title, description or thumbnail is required"
                );
            }

            const video = await Video.findById(videoId);
            if (!video) {
                throw new ApiError(404, "Video not found");
            }

            if (title) video.title = title;
            if (description) video.description = description;
            if (thumbnailLocalPath) {
                // delete existing thumbnail
                if (video?.thumbnail?.publicId) {
                    const oldThumbnail: DeleteApiResponse | null =
                        await deleteFromCloudinary(
                            video.thumbnail.publicId,
                            "image"
                        );

                    // check if thumbnail is deleted
                    if (!oldThumbnail) {
                        throw new ApiError(500, "Failed to delete thumbnail");
                    }
                }

                const thumbnail: UploadApiResponse | null =
                    await uploadOnCloudinary(thumbnailLocalPath, "image");
                if (!thumbnail) {
                    throw new ApiError(500, "Failed to upload thumbnail");
                }
                video.thumbnail = {
                    publicId: thumbnail?.public_id,
                    url: thumbnail?.secure_url,
                };
            }

            const updatedVideo = await video.save();
            if (!updatedVideo) {
                throw new ApiError(500, "Failed to update video");
            }

            return res
                .status(200)
                .json(
                    new ApiResponse(
                        200,
                        updatedVideo,
                        "Video updated successfully"
                    )
                );
        } catch (error) {
            throw new ApiError(500, "Something went wrong!");
        }
    }
);

interface LikeType {
    _id: mongoose.Types.ObjectId;
}
interface CommentType {
    _id: mongoose.Types.ObjectId;
    commentLikes: LikeType[];
}
const deleteVideo = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { videoId } = req.params as { videoId: string };
        if (!isValidObjectId(videoId)) {
            throw new ApiError(400, "Video id is required");
        }

        const video = await Video.findById(videoId);
        if (!video) {
            throw new ApiError(404, "Video not found");
        }

        // delete video and thumbnail from cloudinary
        const deleteVideo: DeleteApiResponse | null =
            await deleteFromCloudinary(video.videoFile.publicId, "video");
        const deleteThumbnail: DeleteApiResponse | null =
            await deleteFromCloudinary(video.thumbnail.publicId, "image");
        if (!deleteVideo) {
            throw new ApiError(500, "Failed to delete video from cloudinary");
        }
        if (!deleteThumbnail) {
            throw new ApiError(
                500,
                "Failed to delete thumbnail from cloudinary"
            );
        }

        const videoDetails = await Video.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(videoId) } },
            {
                $lookup: {
                    from: "likes",
                    let: { videoId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$entityId", "$$videoId"],
                                        },
                                        {
                                            $eq: ["$entityType", "video"],
                                        },
                                    ],
                                },
                            },
                        },
                        { $project: { _id: 1 } },
                    ],
                    as: "videoLikes",
                },
            },
            {
                $lookup: {
                    from: "comments",
                    let: { videoId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$entityId", "$$videoId"],
                                        },
                                        {
                                            $eq: ["$entityType", "video"],
                                        },
                                    ],
                                },
                            },
                        },
                        {
                            $lookup: {
                                from: "likes",
                                let: { commentId: "$_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    {
                                                        $eq: [
                                                            "$entityId",
                                                            "$$commentId",
                                                        ],
                                                    },
                                                    {
                                                        $eq: [
                                                            "$entityType",
                                                            "comment",
                                                        ],
                                                    },
                                                ],
                                            },
                                        },
                                    },
                                    { $project: { _id: 1 } },
                                ],
                                as: "commentLikes",
                            },
                        },
                        { $project: { commentLikes: 1, _id: 1 } },
                    ],
                    as: "videoComments",
                },
            },
            {
                $project: {
                    videoLikes: 1,
                    videoComments: 1,
                },
            },
        ]);
        if (!videoDetails) {
            throw new ApiError(500, "No likes or comments found");
        }

        // Extract videoLikeId, commentId and LikeId of comments from videoDetails
        const videoLikeIds: mongoose.Types.ObjectId[] =
            videoDetails[0]?.videoLikes.map((like: LikeType) => like._id);

        const commentIds: mongoose.Types.ObjectId[] =
            videoDetails[0]?.videoComments.map(
                (comment: CommentType) => comment._id
            );

        const commentLikeIds: mongoose.Types.ObjectId[] =
            videoDetails[0]?.videoComments.reduce(
                (
                    accumulator: mongoose.Types.ObjectId[],
                    comment: CommentType
                ) => {
                    const LikeIds: mongoose.Types.ObjectId[] =
                        comment.commentLikes.map((like: LikeType) => like._id);
                    return accumulator.concat(LikeIds);
                },
                []
            );

        // delete video, video likes, comments and comments likes
        const delVideo = await Video.findByIdAndDelete(videoId);
        if (!delVideo) {
            throw new ApiError(500, "Failed to delete video");
        }

        const delVideoLikes = await Like.deleteMany({
            _id: { $in: videoLikeIds },
        });
        if (!delVideoLikes?.acknowledged) {
            throw new ApiError(500, "Failed to delete video likes");
        }

        const delComments = await Comment.deleteMany({
            _id: { $in: commentIds },
        });
        if (!delComments?.acknowledged) {
            throw new ApiError(500, "Failed to delete comments of video");
        }

        const delCommentsLikes = await Like.deleteMany({
            _id: { $in: commentLikeIds },
        });
        if (!delCommentsLikes?.acknowledged) {
            throw new ApiError(500, "Failed to delete comments likes of video");
        }

        return res
            .status(200)
            .json(new ApiResponse(200, null, "Video deleted successfully"));
    }
);

const ToggleVideoPublishStatus = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { videoId } = req.params as { videoId: string };
        if (!isValidObjectId(videoId)) {
            throw new ApiError(400, "Invalid video id");
        }

        const video = await Video.findById(videoId);
        if (!video) {
            throw new ApiError(404, "Video not found");
        }

        video.isPublished = !video.isPublished;
        await video.save({ validateBeforeSave: false });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    video,
                    "Publish status updated successfully"
                )
            );
    }
);

export {
    addView,
    getAllVideo,
    uploadVideo,
    getVideoById,
    videoUpdate,
    deleteVideo,
    streamVideo,
    ToggleVideoPublishStatus,
};
