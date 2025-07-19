import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { User } from "../models/user.model";
import { Video } from "../models/video.model";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import mongoose, { isValidObjectId } from "mongoose";
import { UserType } from "../types/user.type";

interface RequestWithUser extends Request {
    user: UserType;
}

// controller to Get the channel stats like total video views, total subscribers, total videos, total likes etc.
const getAdminChannelStats = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const userId = new mongoose.Types.ObjectId(req?.user?._id);
        const user = await User.aggregate([
            { $match: { _id: userId } },
            {
                $lookup: {
                    from: "subscriptions",
                    localField: "_id",
                    foreignField: "channelId",
                    as: "Subscribers",
                },
            },
            {
                $lookup: {
                    from: "videos",
                    localField: "_id",
                    foreignField: "ownerId",
                    as: "Videos",
                    pipeline: [
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
                                                        $eq: [
                                                            "$entityId",
                                                            "$$videoId",
                                                        ],
                                                    },
                                                    {
                                                        $eq: [
                                                            "$entityType",
                                                            "video",
                                                        ],
                                                    },
                                                ],
                                            },
                                        },
                                    },

                                    { $project: { isLiked: 1 } },
                                ],
                                as: "Likes",
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
                                                        $eq: [
                                                            "$entityId",
                                                            "$$videoId",
                                                        ],
                                                    },
                                                    {
                                                        $eq: [
                                                            "$entityType",
                                                            "video",
                                                        ],
                                                    },
                                                ],
                                            },
                                        },
                                    },
                                    { $project: { _id: 1 } },
                                ],
                                as: "Comments",
                            },
                        },
                        {
                            $addFields: {
                                comments: { $size: "$Comments" },
                                likes: {
                                    $size: {
                                        $filter: {
                                            input: "$Likes",
                                            as: "like",
                                            cond: {
                                                $eq: ["$$like.isLiked", true],
                                            },
                                        },
                                    },
                                },
                                dislikes: {
                                    $size: {
                                        $filter: {
                                            input: "$Likes",
                                            as: "like",
                                            cond: {
                                                $eq: ["$$like.isLiked", false],
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        {
                            $project: {
                                likes: 1,
                                dislikes: 1,
                                views: 1,
                                comments: 1,
                            },
                        },
                    ],
                },
            },
            {
                $project: {
                    totalSubscribers: { $size: "$Subscribers" },
                    totalVideos: { $size: "$Videos" },
                    totalViews: { $sum: "$Videos.views" },
                    totalLikes: { $sum: "$Videos.likes" },
                    totalDislikes: { $sum: "$Videos.dislikes" },
                    totalComments: { $sum: "$Videos.comments" },
                },
            },
        ]);
        if (!user) {
            throw new ApiError(404, "No user found with this id");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { stats: user[0] },
                    "Channel stats fetched successfully"
                )
            );
    }
);

// controller to Get all the videos uploaded by the channel
const getAdminChannelVideos = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        if (!isValidObjectId(req?.user?._id)) {
            throw new ApiError(400, "Invalid user id");
        }
        const userId = new mongoose.Types.ObjectId(req?.user?._id);

        const videos = await Video.aggregate([
            { $match: { ownerId: userId } },
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
                    ],
                    as: "Likes",
                },
            },
            {
                $addFields: {
                    likes: {
                        $size: {
                            $filter: {
                                input: "$Likes",
                                as: "like",
                                cond: { $eq: ["$$like.isLiked", true] },
                            },
                        },
                    },
                    dislikes: {
                        $size: {
                            $filter: {
                                input: "$Likes",
                                as: "like",
                                cond: { $eq: ["$$like.isLiked", false] },
                            },
                        },
                    },
                },
            },
            {
                $project: {
                    title: 1,
                    description: 1,
                    isPublished: 1,
                    thumbnail: 1,
                    likes: 1,
                    dislikes: 1,
                    views: 1,
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
            { $sort: { createdAt: -1 } },
        ]);

        if (!videos) {
            throw new ApiError(404, "No videos found for this channel");
        }
        return res
            .status(200)
            .json(
                new ApiResponse(200, { videos }, "Videos fetched successfully")
            );
    }
);

export { getAdminChannelStats, getAdminChannelVideos };
