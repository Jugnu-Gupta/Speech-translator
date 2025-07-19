import React, { useState, useEffect, useRef } from "react";

const languages = [
  { code: "auto", name: "Auto-Detect" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "hi", name: "Hindi" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "zh", name: "Chinese" },
];

export default function App() {
  const [inputLang, setInputLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [transcript, setTranscript] = useState("");
  const [translated, setTranslated] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window)) {
      alert("Speech Recognition not supported in this browser.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = inputLang === "auto" ? "en-US" : `${inputLang}-US`;

    recognition.onresult = async (event) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const finalText = text.trim();
          setTranscript((prev) => prev + finalText + ". ");
          const translatedText = await translateText(finalText);
          setTranslated((prev) => prev + translatedText + " ");
        } else {
          interimTranscript += text;
        }
      }
    };

    recognitionRef.current = recognition;
  }, [inputLang, targetLang]);

  const translateText = async (text) => {
    try {
      const response = await fetch("https://api.mymocktranslate.com/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: text,
          target: targetLang,
          source: inputLang === "auto" ? undefined : inputLang,
        }),
      });
      const data = await response.json();
      return data.translatedText || "[Translation failed]";
    } catch (error) {
      console.error("Translation error:", error);
      return "[Error]";
    }
  };

  const handleStart = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
      setListening(true);
    }
  };

  const handleStop = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-xl mx-auto bg-white shadow-md rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-6 text-center">🎙️ Realtime Speech Translator</h1>

        <div className="mb-4">
          <label className="block mb-1 font-medium">Input Language</label>
          <select
            className="w-full border p-2 rounded-md"
            value={inputLang}
            onChange={(e) => setInputLang(e.target.value)}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="block mb-1 font-medium">Target Language</label>
          <select
            className="w-full border p-2 rounded-md"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          >
            {languages
              .filter((l) => l.code !== "auto")
              .map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
          </select>
        </div>

        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={handleStart}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded"
          >
            Start 🎤
          </button>
          <button
            onClick={handleStop}
            className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded"
          >
            Stop ✋
          </button>
        </div>

        <div className="mt-6">
          <h2 className="font-semibold mb-2">Live Transcript</h2>
          <div className="bg-gray-100 border rounded-md p-3 h-32 overflow-y-auto whitespace-pre-wrap">
            {transcript || <span className="text-gray-500">Speak something...</span>}
          </div>
        </div>

        <div className="mt-6">
          <h2 className="font-semibold mb-2">Translated Text</h2>
          <div className="bg-gray-100 border rounded-md p-3 h-32 overflow-y-auto whitespace-pre-wrap">
            {translated || <span className="text-gray-500">Waiting for translation...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}