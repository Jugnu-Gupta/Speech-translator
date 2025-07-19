// import express from "express";
// import cookieParser from "cookie-parser";
// import cors from "cors";
// const app = express();
// import dotenv from "dotenv";
// dotenv.config();

// app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
// app.use(express.urlencoded({ extended: true, limit: "5mb" }));
// app.use(express.json({ limit: "5mb" }));
// app.use(express.static("tmp"));
// app.use(cookieParser());

// // routes import
// import authRouter from "./routes/auth.route";
// import userRouter from "./routes/user.route";
// import likeRouter from "./routes/like.route";
// import videoRouter from "./routes/video.route";
// import tweetRouter from "./routes/tweet.route";
// import commentRouter from "./routes/comment.route";
// import playlistRouter from "./routes/playlist.route";
// import dashboardRouter from "./routes/dashboard.route";
// import healthCheckRouter from "./routes/healthCheck.route";
// import subscriptionRouter from "./routes/subscription.route";

// // routes declaration/mount
// app.use("/api/v1/auths", authRouter);
// app.use("/api/v1/users", userRouter);
// app.use("/api/v1/likes", likeRouter);
// app.use("/api/v1/videos", videoRouter);
// app.use("/api/v1/tweets", tweetRouter);
// app.use("/api/v1/comments", commentRouter);
// app.use("/api/v1/playlists", playlistRouter);
// app.use("/api/v1/dashboard", dashboardRouter);
// app.use("/api/v1/healthCheck", healthCheckRouter);
// app.use("/api/v1/subscriptions", subscriptionRouter);

// export { app };

import express from "express";
import multer from "multer";
import cors from "cors";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();

// Polyfill for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: path.join(__dirname, "uploads/") });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

app.post("/transcribe", upload.single("audio"), async (req, res) => {
	try {
		const audioFile = req.file;
		const transcription = await openai.audio.transcriptions.create({
			file: audioFile,
			model: "whisper-1",
			response_format: "json",
			language: "auto", // optional
		});

		res.json({
			transcript: transcription.text,
			language: transcription.language,
		});
	} catch (error) {
		console.error(error);
		res.status(500).send("Whisper transcription failed");
	}
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
