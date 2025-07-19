import { Request, Response } from "express";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

// controller to build a healthcheck response that simply
// returns the OK status as json with a message
const healthCheck = asyncHandler(async (req: Request, res: Response) => {
    return res.status(200).json(new ApiResponse(200, null, "OK"));
});

export { healthCheck };
