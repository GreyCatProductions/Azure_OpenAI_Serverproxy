require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const readline = require("readline");
const { sanitizeSchemaForClaude } = require("./utils");

const app = express();
const port = process.env.PORT || 3000;

app.use(morgan("dev"));
app.use(cors());
app.use(bodyParser.json());

const azureConfigured = !!(
  process.env.AZURE_API_KEY &&
  process.env.AZURE_OPENAI_DEPLOYMENT &&
  process.env.AZURE_ENDPOINT
);

const claudeConfigured = !!(
  process.env.CLAUDE_API_KEY &&
  process.env.CLAUDE_ENDPOINT &&
  process.env.CLAUDE_MODEL
);

async function chooseProvider() {
  if (!azureConfigured && !claudeConfigured) {
    console.error("No AI provider configured. Set Azure OpenAI or Claude variables in .env.");
    process.exit(1);
  }

  if (azureConfigured && claudeConfigured) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question("Both Azure OpenAI and Claude are configured. Which do you want to use? (azure/claude): ", (answer) => {
        rl.close();
        const choice = answer.trim().toLowerCase();
        if (choice === "azure"  || choice === "a") return resolve("azure");
        if (choice === "claude" || choice === "c") return resolve("claude");

        console.log("Invalid choice!");
        process.exit(1);
      });
    });
  }

  return azureConfigured ? "azure" : "claude";
}

let provider;
let client;

async function initClient() {
  provider = await chooseProvider();

  if (provider === "azure") {
    const { AzureOpenAI } = require("openai");
    client = new AzureOpenAI({
      apiKey: process.env.AZURE_API_KEY,
      apiVersion: process.env.API_VERSION,
      endpoint: process.env.AZURE_ENDPOINT,
    });
    console.log("Using Azure OpenAI");
  } else {
    const Anthropic = require("@anthropic-ai/sdk");
    client = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
      baseURL: process.env.CLAUDE_ENDPOINT,
      defaultHeaders: { "api-key": process.env.CLAUDE_API_KEY },
    });
    console.log("Using Claude");
  }
}

function authenticate(req, res, next) {
  const key = req.header("aff-api-key");
  if (!key || key !== process.env.AFF_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down." },
});

const pingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down." },
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

    let output;

    if (provider === "azure") {
      const response = await client.responses.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT,
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: schema.title || "unity_response",
            schema,
            strict: true,
          },
        },
      });
      output = response.output[0].content[0].text;
    } else {
      const cleaned = sanitizeSchemaForClaude(schema);
      const response = await client.messages.create({
        model: process.env.CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
        output_config: {
          format: { type: "json_schema", cleaned },
        },
      });
      output = response.content[0].text;
    }

    console.log("Final output:", output);
    return res.json({ reply: output });
  } catch (err) {
    console.error("AI error:", err);
    return res.status(500).json({ error: "AI request failed" });
  }
});

initClient().then(() => {
  app.listen(port, () => {
    console.log("Server running on port " + port);
  });
});
