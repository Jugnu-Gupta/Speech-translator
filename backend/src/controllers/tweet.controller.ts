import { Request, Response } from "express";
import mongoose, { isValidObjectId } from "mongoose";
import { Tweet } from "../models/tweet.model";
import { Comment } from "../models/comment.model";
import { Like } from "../models/like.model";
import { UserType } from "types/user.type";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary";
import { DeleteApiResponse, UploadApiResponse } from "cloudinary";
import fs from "fs";

interface RequestWithUser extends Request {
    user: UserType;
}
interface CreateTweetData {
    ownerId: string;
    content: string;
    image?: {
        publicId: string;
        url: string;
    };
}

const createTweet = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { content } = req.body as { content: string };
        const imageLocalPath: string | undefined = req.file?.path;
        if (!content) {
            throw new ApiError(400, "Content is required");
        }

        let uploadImage: UploadApiResponse | null = null;
        if (imageLocalPath) {
            uploadImage = await uploadOnCloudinary(imageLocalPath, "image");
            if (!uploadImage) {
                throw new ApiError(500, "Failed to upload image");
            }
        }

        const data: CreateTweetData = {
            ownerId: req.user?._id,
            content,
        };
        if (uploadImage) {
            data.image = {
                publicId: uploadImage.public_id,
                url: uploadImage.secure_url,
            };
        }

        const tweet = await Tweet.create(data);
        if (!tweet) {
            throw new ApiError(500, "Failed to create tweet");
        }

        return res
            .status(201)
            .json(new ApiResponse(201, tweet, "Tweet created successfully"));
    }
);

interface GetUserTweetParams {
    userId: string;
    curUserId?: string;
}

const getUserTweet = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        let { userId, curUserId } = req.params as unknown as GetUserTweetParams;
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid user Id");
        }
        if (!isValidObjectId(curUserId)) {
            curUserId = null;
        }

        const tweets = await Tweet.aggregate([
            { $match: { ownerId: new mongoose.Types.ObjectId(userId) } },
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
                                avatar: 1,
                                userName: 1,
                            },
                        },
                    ],
                },
            },
            {
                $lookup: {
                    from: "likes",
                    let: { tweetId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$entityId", "$$tweetId"],
                                        },
                                        {
                                            $eq: ["$entityType", "tweet"],
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
                $lookup: {
                    from: "comments",
                    let: { tweetId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$entityId", "$$tweetId"],
                                        },
                                        {
                                            $eq: ["$entityType", "tweet"],
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    as: "Comments",
                },
            },
            {
                $addFields: {
                    likeStatus: {
                        $cond: {
                            if: {
                                $in: [
                                    new mongoose.Types.ObjectId(curUserId),
                                    "$Likes.likedBy",
                                ],
                            },
                            then: {
                                $cond: {
                                    if: {
                                        $arrayElemAt: [
                                            "$Likes.isLiked",
                                            {
                                                $indexOfArray: [
                                                    "$Likes.likedBy",
                                                    new mongoose.Types.ObjectId(
                                                        curUserId
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
                    comments: { $size: "$Comments" },
                    owner: { $arrayElemAt: ["$owner", 0] },
                },
            },
            {
                $project: {
                    Likes: 0,
                    Comments: 0,
                    ownerId: 0,
                },
            },
            { $sort: { createdAt: 1 } },
        ]);

        if (!tweets) {
            throw new ApiError(404, "No tweets found");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { tweets },
                    "User tweets fetched successfully"
                )
            );
    }
);

interface GetTweetByIdParams {
    tweetId: string;
    userId?: string;
}

const getTweetById = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        let { tweetId, userId } = req.params as unknown as GetTweetByIdParams;
        if (!isValidObjectId(tweetId)) {
            throw new ApiError(400, "Invalid user id");
        }
        if (!isValidObjectId(userId)) {
            userId = null;
        }

        const tweets = await Tweet.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(tweetId) } },
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
                                avatar: 1,
                                userName: 1,
                            },
                        },
                    ],
                },
            },
            {
                $lookup: {
                    from: "likes",
                    let: { tweetId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$entityId", "$$tweetId"],
                                        },
                                        {
                                            $eq: ["$entityType", "tweet"],
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
                $lookup: {
                    from: "comments",
                    let: { tweetId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$entityId", "$$tweetId"],
                                        },
                                        {
                                            $eq: ["$entityType", "tweet"],
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    as: "Comments",
                },
            },
            {
                $addFields: {
                    likeStatus: {
                        $cond: {
                            if: {
                                $in: [
                                    new mongoose.Types.ObjectId(userId),
                                    "$Likes.likedBy",
                                ],
                            },
                            then: {
                                $cond: {
                                    if: {
                                        $arrayElemAt: [
                                            "$Likes.isLiked",
                                            {
                                                $indexOfArray: [
                                                    "$Likes.likedBy",
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
                    comments: { $size: "$Comments" },
                    owner: { $arrayElemAt: ["$owner", 0] },
                },
            },
            {
                $project: {
                    Likes: 0,
                    Comments: 0,
                    ownerId: 0,
                },
            },
        ]);

        if (!tweets) {
            throw new ApiError(404, "No tweets found");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { tweets },
                    "User tweets fetched successfully"
                )
            );
    }
);

const updateTweet = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { tweetId } = req.params as { tweetId: string };
        const { content } = req.body as { content: string };
        const imageLocalPath: string | undefined = req.file?.path;
        if (!isValidObjectId(tweetId)) {
            throw new ApiError(400, "Invalid tweet Id");
        }
        if (!content) {
            throw new ApiError(400, "Content is required");
        }

        const tweet = await Tweet.findById(tweetId);
        if (!tweet) {
            throw new ApiError(404, "No tweet found");
        }

        if (tweet?.image?.publicId && imageLocalPath) {
            const oldImage: DeleteApiResponse | null =
                await deleteFromCloudinary(tweet.image.publicId, "image");
            if (!oldImage) {
                fs.unlinkSync(imageLocalPath);
                throw new ApiError(500, "Failed to delete old image");
            }
        }

        let uploadImage: UploadApiResponse | null = null;
        if (imageLocalPath) {
            uploadImage = await uploadOnCloudinary(imageLocalPath, "image");
            if (!uploadImage?.secure_url || !uploadImage?.public_id) {
                throw new ApiError(500, "Failed to upload image");
            }
            tweet.image = {
                publicId: uploadImage.public_id,
                url: uploadImage.secure_url,
            };
        }
        if (content) tweet.content = content;
        await tweet.save();

        return res
            .status(200)
            .json(new ApiResponse(200, tweet, "Tweet updated successfully"));
    }
);

interface LikeType {
    _id: mongoose.Types.ObjectId;
}
interface CommentType {
    _id: mongoose.Types.ObjectId;
    commentLikes: LikeType[];
}
const deleteTweet = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { tweetId } = req.params as { tweetId: string };
        if (!isValidObjectId(tweetId)) {
            throw new ApiError(400, "Tweet id is required");
        }

        const tweet = await Tweet.findById(tweetId);
        if (!tweet) {
            throw new ApiError(404, "Tweet not found");
        }

        const tweetDetails = await Tweet.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(tweetId) } },
            {
                $lookup: {
                    from: "likes",
                    let: { tweetId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$entityId", "$$tweetId"],
                                        },
                                        {
                                            $eq: ["$entityType", "tweet"],
                                        },
                                    ],
                                },
                            },
                        },
                        { $project: { _id: 1 } },
                    ],
                    as: "tweetLikes",
                },
            },
            {
                $lookup: {
                    from: "comments",
                    let: { tweetId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$entityId", "$$tweetId"],
                                        },
                                        {
                                            $eq: ["$entityType", "tweet"],
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
                    as: "tweetComments",
                },
            },
            {
                $project: {
                    tweetLikes: 1,
                    tweetComments: 1,
                },
            },
        ]);
        if (!tweetDetails) {
            throw new ApiError(500, "No likes or comments found");
        }

        // Extract videoLikeId, commentId and LikeId of comments from videoDetails
        const tweetLikeIds: mongoose.Types.ObjectId[] =
            tweetDetails[0]?.tweetLikes.map((like: LikeType) => like._id);
        const commentIds: mongoose.Types.ObjectId[] =
            tweetDetails[0]?.tweetComments.map(
                (comment: CommentType) => comment._id
            );
        const commentLikeIds: mongoose.Types.ObjectId[] =
            tweetDetails[0]?.tweetComments.reduce(
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

        // delete tweet, Tweet likes, comments and comments likes
        const delTweet = await Tweet.findByIdAndDelete(tweetId);
        if (!delTweet) {
            throw new ApiError(500, "Failed to delete tweet");
        }

        const delTweetLikes = await Like.deleteMany({
            _id: { $in: tweetLikeIds },
        });
        if (!delTweetLikes?.acknowledged) {
            throw new ApiError(500, "Failed to delete tweet likes");
        }

        const delComments = await Comment.deleteMany({
            _id: { $in: commentIds },
        });
        if (!delComments?.acknowledged) {
            throw new ApiError(500, "Failed to delete comments of tweet");
        }

        const delCommentsLikes = await Like.deleteMany({
            _id: { $in: commentLikeIds },
        });
        if (!delCommentsLikes?.acknowledged) {
            throw new ApiError(500, "Failed to delete comments likes of tweet");
        }

        return res
            .status(200)
            .json(new ApiResponse(200, null, "Tweet deleted successfully"));
    }
);

export { createTweet, getUserTweet, updateTweet, getTweetById, deleteTweet };
