import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { UserType } from "../types/user.type";
import { User } from "../models/user.model";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { getAvailableUserName } from "../utils/getAvailableUserName";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { DeleteApiResponse, UploadApiResponse } from "cloudinary";

interface RequestWithUser extends Request {
    user: UserType;
}

interface UpdateUserPasswordBody {
    email?: string;
    curPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
}

const UpdateUserPassword = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const {
            email,
            curPassword,
            newPassword,
            confirmPassword,
        }: UpdateUserPasswordBody = req.body;
        if (!email) {
            throw new ApiError(400, "Email is required");
        }
        if (newPassword !== confirmPassword) {
            throw new ApiError(
                400,
                "New password and confirm password do not match"
            );
        }

        const user = await User.findOne({ email });
        if (!user) {
            throw new ApiError(404, "User not found");
        }

        const isPasswordValid: Boolean =
            await user.isPasswordCorrect(curPassword);
        if (!isPasswordValid) {
            throw new ApiError(401, "Incorrect password");
        }

        if (curPassword === newPassword) {
            throw new ApiError(
                400,
                "New password cannot be same as old password"
            );
        }

        const updateUser = await User.findById(user._id)?.select(
            "avatar coverImage isVerified"
        );
        if (updateUser) {
            updateUser.password = newPassword;
            await updateUser.save();
        }
        updateUser.password = undefined;
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { user: updateUser },
                    "Password changed successful"
                )
            );
    }
);

const getCurrentUser = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        return res
            .status(200)
            .json(new ApiResponse(200, { user: req.user }, "User found"));
    }
);

interface UpdateUserDetailsBody {
    fullName?: string;
    userName?: string;
    _id?: string;
}
// controller to update user account details like fullName, userName
const updateUserDetails = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { fullName, userName, _id }: UpdateUserDetailsBody = req.body;
        if (!fullName?.trim() || !userName?.trim() || !_id) {
            throw new ApiError(400, "FullName, username and id are required");
        }

        // check if the username already exists.
        const existedUser = await User.findOne({
            userName: userName.toLowerCase(),
        });
        if (existedUser && existedUser._id.toString() !== _id) {
            const availableUserName: string | null =
                await getAvailableUserName(fullName);

            throw new ApiError(409, "This username isn't available.", {
                availableUserName,
            });
        }

        // update the user profile.
        const user = await User.findByIdAndUpdate(
            req?.user?._id,
            { $set: { fullName, userName: userName.toLowerCase() } },
            { new: true }
        )?.select("userName fullName email avatar coverImage isVerified");

        if (!user) {
            throw new ApiError(
                500,
                "Something went wrong while updating the user profile"
            );
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { user },
                    "User profile updated successfully"
                )
            );
    }
);

const updateUserAvatar = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const avatarLocalPath: string | undefined = req.file?.path
            ? path.resolve(req.file.path)
            : undefined;
        if (!avatarLocalPath) {
            throw new ApiError(400, "Avatar file is required");
        }

        try {
            // delete the old cover image from cloudinary if exists.
            if (req.user?.avatar?.publicId) {
                const oldAvatar: DeleteApiResponse | null =
                    await deleteFromCloudinary(
                        req.user?.avatar?.publicId,
                        "image"
                    );

                // check if the old cover image is deleted successfully.
                if (!oldAvatar) {
                    fs.unlinkSync(avatarLocalPath);
                    throw new ApiError(
                        500,
                        "Failed to delete old avatar image from cloudinary"
                    );
                }
            }

            // uploading images to cloudinay and updating the user profile.
            const avatar: UploadApiResponse | null = await uploadOnCloudinary(
                avatarLocalPath,
                "image"
            );
            if (!avatar) {
                throw new ApiError(500, "Image upload failed on cloudinary");
            }

            const user = await User.findByIdAndUpdate(
                req?.user?._id,
                {
                    $set: {
                        avatar: {
                            publicId: avatar.public_id,
                            url: avatar.secure_url,
                        },
                    },
                },
                { new: true }
            )?.select("userName fullName email avatar coverImage isVerified");

            return res
                .status(200)
                .json(
                    new ApiResponse(
                        200,
                        { user },
                        "Avatar updated successfully"
                    )
                );
        } catch (error) {
            throw new ApiError(500, "Something went wrong!");
        }
    }
);

const updateUserCoverImage = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const coverImageLocalPath: string | undefined = req.file?.path
            ? path.resolve(req.file.path)
            : undefined;

        if (!coverImageLocalPath) {
            throw new ApiError(400, "Cover Image is required");
        }

        try {
            // delete the old cover image from cloudinary if exists.
            if (req.user?.coverImage?.publicId) {
                const oldCoverImage: DeleteApiResponse | null =
                    await deleteFromCloudinary(
                        req?.user?.coverImage?.publicId,
                        "image"
                    );

                // check if the old cover image is deleted successfully.
                if (!oldCoverImage) {
                    fs.unlinkSync(coverImageLocalPath);
                    throw new ApiError(
                        500,
                        "Failed to delete old cover image from cloudinary"
                    );
                }
            }

            const coverImage: UploadApiResponse | null =
                await uploadOnCloudinary(coverImageLocalPath, "image");
            if (!coverImage) {
                throw new ApiError(500, "Image upload failed on cloudinary");
            }

            const user = await User.findByIdAndUpdate(
                req?.user?._id,
                {
                    $set: {
                        coverImage: {
                            publicId: coverImage.public_id,
                            url: coverImage.secure_url,
                        },
                    },
                },
                { new: true }
            )?.select("userName fullName email avatar coverImage isVerified");

            return res
                .status(200)
                .json(
                    new ApiResponse(
                        200,
                        { user },
                        "Cover image updated successfully"
                    )
                );
        } catch (error) {
            throw new ApiError(500, "Something went wrong!");
        }
    }
);

const getUserChannelPage = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { userName } = req.params as { userName: string };
        if (!userName) {
            throw new ApiError(404, "User name is required");
        }

        const channel = await User.aggregate([
            { $match: { userName: userName.toLowerCase() } },
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
                    subscriberCount: { $size: "$subscribers" },
                    isSubscribed: {
                        $cond: {
                            if: {
                                $in: [req.user?._id, "$subscribers.subscriber"],
                            },
                            then: true,
                            else: false,
                        },
                    },
                },
            },
            {
                $lookup: {
                    from: "videos",
                    localField: "_id",
                    foreignField: "ownerId",
                    as: "videos",
                    pipeline: [{ $project: { _id: 1 } }],
                },
            },
            {
                $project: {
                    fullName: 1,
                    userName: 1,
                    email: 1,
                    avatar: 1,
                    coverImage: 1,
                    subscriberCount: 1,
                    isSubscribed: 1,
                    videoCount: { $size: "$videos" },
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
        ]);

        if (!channel.length) {
            throw new ApiError(404, "Channel does not exists");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    channel[0],
                    "User channel fetched successfully"
                )
            );
    }
);

const getUserChannelVideos = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const { userName } = req.params as { userName: string };
        if (!userName) {
            throw new ApiError(404, "User name is required");
        }

        const channelVideos = await User.aggregate([
            { $match: { userName: userName.toLowerCase() } },
            {
                $lookup: {
                    from: "videos",
                    localField: "_id",
                    foreignField: "ownerId",
                    as: "videos",
                    pipeline: [
                        {
                            $project: {
                                title: 1,
                                description: 1,
                                thumbnail: 1,
                                views: 1,
                                duration: 1,
                                isPublished: 1,
                                createdAt: 1,
                                updatedAt: 1,
                            },
                        },
                    ],
                },
            },
            {
                $project: {
                    videos: 1,
                },
            },
        ]);

        if (!channelVideos) {
            throw new ApiError(404, "Channel does not exists");
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { videos: channelVideos[0].videos },
                    "User channel fetched successfully"
                )
            );
    }
);

const getWatchHistory = asyncHandler(
    async (req: RequestWithUser, res: Response) => {
        const userId = new mongoose.Types.ObjectId(req?.user?._id);

        const user = await User.aggregate([
            { $match: { _id: userId } },
            { $unwind: "$watchHistory" },
            { $addFields: { watchedAt: "$watchHistory.watchedAt" } },
            {
                $lookup: {
                    from: "videos",
                    localField: "watchHistory.videoId",
                    foreignField: "_id",
                    as: "watchHistory",
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
                            $addFields: {
                                owner: { $arrayElemAt: ["$owner", 0] },
                            },
                        },
                        {
                            $project: {
                                title: 1,
                                description: 1,
                                thumbnail: 1,
                                views: 1,
                                duration: 1,
                                createdAt: 1,
                                updatedAt: 1,
                                owner: 1,
                            },
                        },
                    ],
                },
            },
            {
                $addFields: {
                    watchHistory: { $arrayElemAt: ["$watchHistory", 0] },
                },
            },
            { $addFields: { "watchHistory.watchedAt": "$watchedAt" } },
            {
                $group: {
                    _id: "$_id",
                    watchHistory: { $push: "$watchHistory" },
                },
            },
            {
                $project: {
                    watchHistory: 1,
                    _id: 0,
                },
            },
        ]);

        if (!user) {
            throw new ApiError(404, "Watch history not found");
        } else if (user[0]?.watchHistory?.length > 1) {
            // sort by watchedAt.
            user[0].watchHistory.sort(
                (a: any, b: any) =>
                    new Date(b.watchedAt).getTime() -
                    new Date(a.watchedAt).getTime()
            );
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { watchHistory: user[0]?.watchHistory || [] },
                    "Watch history fetched successfully"
                )
            );
    }
);

export {
    UpdateUserPassword,
    getCurrentUser,
    updateUserDetails,
    updateUserCoverImage,
    updateUserAvatar,
    getUserChannelPage,
    getUserChannelVideos,
    getWatchHistory,
};
