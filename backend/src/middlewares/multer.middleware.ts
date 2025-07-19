import { Request } from "express";
import multer, { FileFilterCallback } from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

const storage = multer.diskStorage({
    destination: async (
        req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, destination: string | undefined) => void
    ) => {
        const uniqueId = req.query.uniqueId;
        const tempPath = uniqueId ? `/tmp/${uniqueId}` : "/tmp";
        if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath, { recursive: true }); // Ensure directory exists
        }
        cb(null, tempPath);
    },
    filename: (
        req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, destination: string | undefined) => void
    ) => {
        if (file.fieldname === "image") {
            cb(null, `image-${uuidv4()}${path.extname(file.originalname)}`);
        } else if (file.fieldname === "video") {
            const { uniqueId, chunkNumber } = req.query;
            req.body.fileName = file.originalname;
            cb(
                null,
                `video-${uniqueId}-chunk-${chunkNumber}${path.extname(
                    file.originalname
                )}`
            );
        } else {
            cb(new Error("Invalid file type!"), undefined);
        }
    },
});

const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
) => {
    if (file.fieldname === "image") {
        const filetypes = /jpeg|jpg|png|jfif|pjp|pjpeg/;
        const extname = filetypes.test(
            path.extname(file.originalname).toLowerCase()
        );

        if (extname) {
            return cb(null, true);
        } else {
            cb(new Error("Images only of type jpeg,jpg,png,jfif,pjp,pjpeg!"));
        }
    } else if (file.fieldname === "video") {
        const filetypes = /mp4/;
        const extname = filetypes.test(
            path.extname(file.originalname).toLowerCase()
        );

        if (extname) {
            return cb(null, true);
        } else {
            cb(new Error("Videos only of type mp4!"));
        }
    } else {
        cb(new Error("Invalid file type!"));
    }
};

export const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter,
});
