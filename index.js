require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const { AzureOpenAI } = require("openai");


const app = express();
const port = process.env.PORT || 3000;

app.use(morgan("dev"));
app.use(cors());
app.use(bodyParser.json());

const GAME_API_KEY = process.env.AFF_API_KEY;

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_API_KEY,
  apiVersion:"2025-03-01-preview",
  endpoint:"https://wirtschaftsinformatik-projekt.openai.azure.com/"
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
  max: 20,                  
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
  console.log("Ping received");
  res.json({ ok: true });
});

app.post("/chat", authenticate, chatLimiter, async (req, res) => {
  try {
    const { prompt, responseClassJson } = req.body;
    console.log("Received prompt:", prompt);
    console.log("Received responseClassJson:", responseClassJson);

    if (!prompt) {
      console.warn("Missing prompt in request");
      return res.status(400).json({ error: "Missing 'prompt' in body" });
    }

    if (!responseClassJson) {
      console.warn("Missing responseClassJson in request");
      return res.status(400).json({ error: "Missing 'responseClassJson' in body" });
    }

    let schema;
    try {
      schema = JSON.parse(responseClassJson);
    } catch (e) {
      console.error("Invalid JSON schema:", e);
      return res.status(400).json({ error: "Invalid 'responseClassJson' JSON" });
    }

    const response = await client.responses.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: schema.title || "unity_response", 
            schema,        
            strict: true   
          }
        }
    });

    const output = response.output[0].content[0].text;

    console.log("Final output:", output);
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
