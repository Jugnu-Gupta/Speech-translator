import { Response, Request } from "express";
import mongoose, { isValidObjectId } from "mongoose";
import { Comment } from "../models/comment.model";
import { UserType } from "types/user.type";
import { Like } from "../models/like.model";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";

interface RequestWithUser extends Request {
    user: UserType;
}

interface GetCommentsParams {
    entityId: string;
    entityType: string;
    parentId?: string | null;
}
interface GetCommentsQuery {
    userId?: string | null;
    page?: string;
    limit?: string;
}

const getComments = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const {
            entityId,
            entityType,
            parentId = null,
        } = req.params as unknown as GetCommentsParams;
        let { page = "1", limit = "10", userId }: GetCommentsQuery = req.query;

        if (!isValidObjectId(entityId)) {
            throw new ApiError(400, "Invalid entity Id");
        }
        if (!["video", "tweet"].includes(entityType)) {
            throw new ApiError(400, "Invalid entity type");
        }
        if (!isValidObjectId(userId)) {
            userId = null;
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const comments = await Comment.aggregate([
            {
                $match: {
                    entityId: new mongoose.Types.ObjectId(entityId),
                    entityType,
                    parentId: parentId
                        ? new mongoose.Types.ObjectId(parentId)
                        : null,
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
                    let: { commentId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$parentId", "$$commentId"],
                                        },
                                        {
                                            $eq: ["$entityType", entityType],
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    as: "replies",
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
                                            $eq: ["$entityId", "$$commentId"],
                                        },
                                        {
                                            $eq: ["$entityType", "comment"],
                                        },
                                    ],
                                },
                            },
                        },
                        { $project: { likedBy: 1, isLiked: 1 } },
                    ],
                    as: "Likes",
                },
            },
            {
                $addFields: {
                    owner: { $arrayElemAt: ["$owner", 0] },
                    replies: { $size: "$replies" },
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
                },
            },
            { $sort: { createdAt: 1 } },
            { $skip: skip },
            { $limit: parseInt(limit) },
            {
                $project: {
                    owner: 1,
                    content: 1,
                    likeStatus: 1,
                    likes: 1,
                    dislikes: 1,
                    replies: 1,
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
        ]);

        if (!comments) {
            throw new ApiError(404, "No comments found");
        }

        return res
            .status(200)
            .json(new ApiResponse(200, { comments }, "Comments found"));
    }
);

interface CreateCommentParams {
    entityId: string;
    entityType: string;
    parentId?: string;
}
interface CreateCommentBody {
    content?: string;
}

const createComment = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const {
            entityId,
            entityType,
            parentId = null,
        } = req.params as unknown as CreateCommentParams;
        const { content }: CreateCommentBody = req.body;

        if (!content) {
            throw new ApiError(400, "Content is required");
        }
        if (!isValidObjectId(entityId)) {
            throw new ApiError(400, "Invalid entity Id");
        }
        if (!["video", "tweet"].includes(entityType)) {
            throw new ApiError(400, "Invalid entity type");
        }

        const comment = await Comment.create({
            entityId,
            entityType,
            content,
            parentId: parentId ? parentId : null,
            ownerId: req.user._id,
        });

        if (!comment) {
            throw new ApiError(500, "Failed to add comment");
        }

        return res
            .status(201)
            .json(new ApiResponse(201, comment, "Comment added successfully"));
    }
);

const updateComment = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { commentId } = req.params as { commentId: string };
        const { content } = req.body as { content: string };
        if (!content) {
            throw new ApiError(400, "Content is required");
        }
        if (!isValidObjectId(commentId)) {
            throw new ApiError(400, "Invalid comment id");
        }

        const comment = await Comment.findByIdAndUpdate(
            commentId,
            { $set: { content } },
            { new: true }
        );
        if (!comment) {
            throw new ApiError(500, "Failed to update comment");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(200, comment, "Comment updated successfully")
            );
    }
);

// Recursive function to find all replies of a comment
const findRepliesRec = async (commentId: string): Promise<string[]> => {
    try {
        const replies = await Comment.find({ parentId: commentId });
        let result: string[] = [];
        for (let i = 0; i < replies.length; i++) {
            const subReplies = await findRepliesRec(replies[i]._id);

            result.push(replies[i]._id.toString());
            result = result.concat(subReplies);
        }
        return result;
    } catch (error) {
        throw new ApiError(500, "Failed to find replies");
    }
};

const deleteComment = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { commentId } = req.params as { commentId: string };
        if (!isValidObjectId(commentId)) {
            throw new ApiError(400, "Invalid Comment Id");
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            throw new ApiError(404, "Comment not found");
        }

        // Extract all replies/comments to be deleted.
        const commentIds = (await findRepliesRec(commentId)).concat(commentId);

        // delete comment, allReplies, and its likes
        const delComment = await Comment.deleteMany({
            _id: { $in: commentIds },
        });
        const delLikes = await Like.deleteMany({
            entityId: { $in: commentIds },
            entityType: "comment",
        });
        if (!delComment?.acknowledged) {
            throw new ApiError(500, "Failed to delete comment");
        }
        if (!delLikes?.acknowledged) {
            throw new ApiError(500, "Failed to delete comment likes");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(200, delComment, "Comment deleted successfully")
            );
    }
);

export { getComments, createComment, updateComment, deleteComment };
