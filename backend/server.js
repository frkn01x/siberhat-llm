const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { addMessage, getSessions, deleteSession, getFullHistory } = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;
const INFERENCE_URL = process.env.INFERENCE_URL || "http://localhost:8000";

app.use(cors());
app.use(express.json());

// Tüm oturumları listele
app.get("/api/sessions", (req, res) => {
  res.json(getSessions());
});

// Streaming chat
app.post("/api/chat/stream", async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ error: "message ve sessionId gerekli" });
  }

  addMessage(sessionId, "user", message);
  const history = getFullHistory(sessionId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const response = await axios.post(
      `${INFERENCE_URL}/generate/stream`,
      { messages: history },
      { responseType: "stream", timeout: 0 }
    );

    response.data.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          addMessage(sessionId, "assistant", fullResponse);
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.token) {
            fullResponse += parsed.token;
            res.write(`data: ${JSON.stringify({ token: parsed.token })}\n\n`);
          }
        } catch {}
      }
    });

    response.data.on("end", () => {
      if (!res.writableEnded) {
        if (fullResponse) addMessage(sessionId, "assistant", fullResponse);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    });

    response.data.on("error", () => {
      if (!res.writableEnded) res.end();
    });

  } catch (err) {
    console.error("Inference hatası:", err.message);
    res.write(`data: ${JSON.stringify({ error: "Model servisi yanıt vermedi." })}\n\n`);
    res.end();
  }
});

// Oturum geçmişini getir
app.get("/api/session/:sessionId", (req, res) => {
  const history = getFullHistory(req.params.sessionId);
  // system prompt'u frontend'e gönderme
  res.json(history.filter((m) => m.role !== "system"));
});

// Oturum sil
app.delete("/api/session/:sessionId", (req, res) => {
  deleteSession(req.params.sessionId);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Backend ${PORT} portunda çalışıyor`);
});
