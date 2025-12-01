require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const OpenAI = require("openai");
const rateLimit = require("express-rate-limit");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const GAME_API_KEY = process.env.AFF_API_KEY;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function authenticate(req, res, next) {
  const key = req.header("aff-api-key");
  if (!key || key !== GAME_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,      
  max: 3,                  
  standardHeaders: true,    
  legacyHeaders: false,
  message: { error: "Too many requests, slow down." }
});

const pingLimiter = rateLimit({
  windowMs: 60 * 1000,      
  max: 10,                  
  standardHeaders: true,    
  legacyHeaders: false,
  message: { error: "Too many requests, slow down." }
});

app.get("/ping", authenticate, pingLimiter, (req, res) => {
  res.json({ ok: true });
});

app.post("/chat", authenticate, chatLimiter, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing 'prompt' in body" });
    }

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    const output = response.output[0].content[0].text;

    return res.json({
      reply: output,
    });
  } catch (err) {
    console.error("OpenAI error:", err);
    return res.status(500).json({ error: "OpenAI request failed" });
  }
});

app.listen(port, () => {
  console.log("Server running on port " + port);
});
