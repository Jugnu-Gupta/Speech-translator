import express from "express";
import multer from "multer";
import cors from "cors";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Load environment variables
dotenv.config();

// Polyfill for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: path.join(__dirname, "uploads/") });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors({
	origin: process.env.CORS_ORIGIN || "*",
	credentials: true,
}));
app.use(express.json());

// POST /api/v1/audio-chunk
// Receives an audio chunk (multipart/form-data, field: "audio")
// Optionally receives a "targetLang" field for translation (e.g., "en", "es", "fr")
app.post("/api/v1/audio-chunk", upload.single("audio"), async (req, res) => {
	try {
		const audioFile = req.file;
		const targetLang = req.body.targetLang || "en";

		if (!audioFile) {
			return res.status(400).json({ error: "No audio file uploaded" });
		}

		// OpenAI Whisper expects a readable stream or file path
		// The multer file object has a .path property
		const transcription = await openai.audio.transcriptions.create({
			file: fs.createReadStream(audioFile.path),
			model: "whisper-1",
			response_format: "json",
			language: "auto",
		});

		const transcript = transcription.text;
		const detectedLanguage = transcription.language || null;

		// Now translate the transcript to the target language
		// Use OpenAI Chat API for translation
		let translation = "";
		try {
			const chatCompletion = await openai.chat.completions.create({
				model: "gpt-3.5-turbo",
				messages: [
					{
						role: "system",
						content: `You are a translation assistant. Translate the following text to ${targetLang}. Only return the translation, no explanation.`,
					},
					{
						role: "user",
						content: transcript,
					},
				],
				temperature: 0.2,
			});
			translation = chatCompletion.choices[0].message.content.trim();
		} catch (translationError) {
			console.error("Translation error:", translationError);
			translation = "";
		}

		// Clean up uploaded file
		fs.unlink(audioFile.path, (err) => {
			if (err) console.error("Failed to delete uploaded file:", err);
		});

		res.json({
			transcript,
			detectedLanguage,
			translation,
			targetLanguage: targetLang,
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Whisper transcription or translation failed" });
	}
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
