import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import express from "express";
import multer from "multer";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createDocx, createPdf } from "./export.js";
import { generateResume, regenerateSection } from "./generate.js";
import { buildParseRequests, extractResumeText } from "./parse.js";
import { scoreResume } from "./scoring.js";
import { generateResumeLocally, parseJobDescriptionLocally, parseResumeLocally, regenerateLocally } from "./local.js";
import { createOllamaClient } from "./ollama.js";
import { generateResumeWithGemini } from "./gemini.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_TEXT_LENGTH = 100_000;
const MAX_JD_LENGTH = 60_000;

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function readText(value, label, maxLength) {
  if (typeof value !== "string") throw inputError(`${label} must be text.`);
  const text = value.trim();
  if (text.length > maxLength) throw inputError(`${label} exceeds the ${maxLength.toLocaleString()} character limit.`);
  return text;
}

function requestBody(req) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
}

function createLimiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: message }),
  });
}

export function createApp({ env = process.env, rateLimitOverrides = {} } = {}) {
  const app = express();
  const maxUploadMb = Number(env.MAX_UPLOAD_MB ?? 8);
  if (!Number.isInteger(maxUploadMb) || maxUploadMb < 1 || maxUploadMb > 10) {
    throw new Error("MAX_UPLOAD_MB must be an integer from 1 to 10.");
  }
  const ollamaBaseUrl = env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = env.OLLAMA_MODEL?.trim() || "";
  const geminiApiKey = env.GEMINI_API_KEY?.trim() || "";
  const geminiModel = env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadMb * 1024 * 1024,
      files: 1,
      fields: 8,
      parts: 9,
      fieldSize: MAX_TEXT_LENGTH,
      fieldNameSize: 100,
    },
  });
  const limits = {
    analyze: rateLimitOverrides.analyze ?? 10,
    regenerate: rateLimitOverrides.regenerate ?? 30,
    score: rateLimitOverrides.score ?? 120,
    export: rateLimitOverrides.export ?? 30,
  };
  const windowMs = 15 * 60 * 1000;

  app.set("trust proxy", env.TRUST_PROXY === "1" ? 1 : false);
  app.disable("x-powered-by");
  app.use(helmet({
    frameguard: { action: "deny" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "2mb" }));

  function getClient() {
    return model ? createOllamaClient(ollamaBaseUrl, model) : null;
  }

  function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  }

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.post("/api/analyze", createLimiter(windowMs, limits.analyze, "Analysis limit reached. Please try again later."), upload.single("resumeFile"), asyncRoute(async (req, res) => {
    const body = requestBody(req);
    const jdText = readText(body.jobDescription, "Job description", MAX_JD_LENGTH);
    if (!jdText) return res.status(400).json({ error: "Paste the job description before generating a resume." });
    const resumeText = req.file ? await extractResumeText(req.file) : readText(body.resumeText ?? "", "Resume text", MAX_TEXT_LENGTH);
    if (!resumeText) return res.status(400).json({ error: "Upload a PDF/DOCX resume or paste your resume text." });
    let confirmedSkills;
    try {
      confirmedSkills = body.confirmedSkills ? JSON.parse(body.confirmedSkills) : [];
    } catch {
      return res.status(400).json({ error: "Confirmed skills must be a valid list." });
    }
    if (!Array.isArray(confirmedSkills) || confirmedSkills.length > 100 || confirmedSkills.some((skill) => typeof skill !== "string" || skill.length > 100)) {
      return res.status(400).json({ error: "Confirmed skills must be a list of up to 100 text values, each 100 characters or fewer." });
    }
    const roleTitle = body.roleTitle ? readText(body.roleTitle, "Role title", 120) : "";
    const yearsExperience = body.yearsExperience ? readText(body.yearsExperience, "Years of experience", 80) : "";
    const options = {
      roleTitle,
      yearsExperience,
      experienceLevel: body.experienceLevel === "fresher" ? "fresher" : "experienced",
      confirmedSkills,
    };
    const original = parseResumeLocally(resumeText);
    const jd = parseJobDescriptionLocally(jdText, options);
    if (options.roleTitle) {
      jd.role = options.roleTitle;
      jd.job_title = options.roleTitle;
    }
    let result;
    if (geminiApiKey) {
      try {
        result = await generateResumeWithGemini({
          apiKey: geminiApiKey,
          model: geminiModel,
          original,
          jd,
          options,
          resumeText,
          jdText,
        });
      } catch {
        console.warn("Gemini processing failed; using the built-in parser instead.");
        result = generateResumeLocally(original, jd, options);
        result.qualityNotes.unshift("Gemini was unavailable, so the built-in parser was used instead.");
        result.mode = "offline";
      }
    } else if (model) {
      try {
        const client = getClient();
        const [aiOriginal, aiJd] = await buildParseRequests(client, model, resumeText, jdText);
        if (options.roleTitle) {
          aiJd.role = options.roleTitle;
          aiJd.job_title = options.roleTitle;
        }
        result = await generateResume(client, model, aiOriginal, aiJd, options);
        result.mode = "ollama";
      } catch {
        console.warn("Local Ollama processing failed; using the built-in parser instead.");
        result = generateResumeLocally(original, jd, options);
        result.qualityNotes.unshift("Ollama was unavailable, so the built-in parser was used instead.");
        result.mode = "offline";
      }
    } else {
      result = generateResumeLocally(original, jd, options);
    }
    res.json(result);
  }));

  app.post("/api/regenerate", createLimiter(windowMs, limits.regenerate, "Section regeneration limit reached. Please try again later."), asyncRoute(async (req, res) => {
    const body = requestBody(req);
    const { section, original, resume, jd, confirmedSkills = [] } = body;
    if (!["summary", "skills", "project"].includes(section)) return res.status(400).json({ error: "Choose summary, skills, or project." });
    if (!original || !resume || !jd) return res.status(400).json({ error: "The resume session is incomplete. Generate it again." });
    let content;
    let mode = "local";
    if (model) {
      try {
        content = await regenerateSection(getClient(), model, {
          section, originalResume: original, currentResume: resume, jobDescription: jd, confirmedSkills,
          project: section === "project" ? body.project : undefined,
        });
        mode = "ollama";
      } catch {
        console.warn("Local section regeneration failed; retaining verified content.");
        content = regenerateLocally(section, original, resume, body.projectIndex ?? 0);
        mode = "offline";
      }
    } else {
      content = regenerateLocally(section, original, resume, req.body.projectIndex ?? 0);
    }
    res.json({ content, mode });
  }));

  app.post("/api/score", createLimiter(windowMs, limits.score, "Scoring limit reached. Please try again later."), (req, res) => {
    const { resume, jd, options = {} } = requestBody(req);
    if (!resume || !jd) return res.status(400).json({ error: "Resume and job description are required to score." });
    res.json(scoreResume(resume, jd, { ...options, original: options.original ?? undefined }));
  });

  app.post("/api/export/:format", createLimiter(windowMs, limits.export, "Export limit reached. Please try again later."), asyncRoute(async (req, res) => {
    const { resume } = requestBody(req);
    if (!resume || typeof resume !== "object" || Array.isArray(resume)) return res.status(400).json({ error: "Resume content is required." });
    const isDocx = req.params.format === "docx";
    if (!isDocx && req.params.format !== "pdf") return res.status(404).json({ error: "Unsupported export format." });
    const buffer = isDocx ? await createDocx(resume) : await createPdf(resume);
    res.setHeader("Content-Type", isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="JD2Resume.${isDocx ? "docx" : "pdf"}"`);
    res.send(buffer);
  }));

  if (env.NODE_ENV === "production") {
    app.use(express.static(resolve(projectRoot, "dist"), { index: false, maxAge: "1h" }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(resolve(projectRoot, "dist", "index.html"), (error) => error && next(error));
    });
  }

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ error: error.code === "LIMIT_FILE_SIZE" ? `File exceeds the ${maxUploadMb} MB limit.` : "Upload contains too many or oversized fields." });
    }
    if (error instanceof SyntaxError && "body" in error) return res.status(400).json({ error: "Request body must contain valid JSON." });
    if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Request failed:", error?.stack || error?.message || error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}

export const app = createApp();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, "0.0.0.0", () => console.log(`JD2Resume server listening on port ${port}`));
}
