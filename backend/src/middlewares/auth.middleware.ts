import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import { User } from "../models/user.model";
import { UserType } from "../types/user.type";
import jwt from "jsonwebtoken";

interface RequestWithUser extends Request {
    user: UserType;
}
interface TokenPayload {
    _id: string;
}

export const verifyJWT = asyncHandler(
    async (req: RequestWithUser, res: Response, next: NextFunction) => {
        try {
            const token =
                req.cookies?.accessToken ||
                req.header("Authorization")?.replace("Bearer ", "");

            if (!token) {
                throw new ApiError(401, "Unauthorized request");
            }

            const decodedToken = jwt.verify(
                token,
                process.env.ACCESS_TOKEN_SECRET
            ) as TokenPayload;
            const user = await User.findById(decodedToken._id)?.select(
                "userName fullName email avatar coverImage isVerified"
            );
            if (!user) {
                throw new ApiError(401, "Invalid Access Token");
            }

            req.user = user;
            next();
        } catch (error) {
            throw new ApiError(401, error.message);
        }
    }
);
