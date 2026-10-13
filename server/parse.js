import mammoth from "mammoth";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { RESUME_PARSE_PROMPT, JD_PARSE_PROMPT } from "./prompts.js";

export function parseJsonResponse(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`The AI returned invalid JSON: ${error.message}`);
  }
}

function invalidDocument(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export async function extractResumeText(file) {
  if (!file) throw new Error("Upload a PDF or DOCX resume, or paste resume text.");
  let text;
  const filename = typeof file.originalname === "string" ? file.originalname.toLowerCase() : "";
  if (filename.endsWith(".pdf")) {
    if (!file.buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
      throw invalidDocument("The uploaded file is not a valid PDF.");
    }
    try {
      const parsed = await pdf(file.buffer);
      text = parsed.text;
    } catch {
      throw invalidDocument("The PDF could not be read. Try a text-based PDF or paste the resume text.");
    }
  } else if (filename.endsWith(".docx")) {
    if (file.buffer.length < 4 || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
      throw invalidDocument("The uploaded file is not a valid DOCX document.");
    }
    try {
      const parsed = await mammoth.extractRawText({ buffer: file.buffer });
      text = parsed.value;
    } catch {
      throw invalidDocument("The DOCX could not be read. Try saving it again or paste the resume text.");
    }
  } else {
    throw invalidDocument("Unsupported file type. Please upload a PDF or DOCX file.");
  }
  if (!text.trim()) throw invalidDocument("No selectable text was found. Try a text-based PDF or paste the resume text.");
  if (text.length > 100_000) throw invalidDocument("Extracted resume text exceeds the 100,000 character limit.");
  return text.trim();
}

export function buildParseRequests(client, model, resumeText, jdText) {
  return Promise.all([
    requestJson(client, model, RESUME_PARSE_PROMPT, `RESUME SOURCE:\n${resumeText}`),
    requestJson(client, model, JD_PARSE_PROMPT, `JOB DESCRIPTION:\n${jdText}`),
  ]);
}

export async function requestJson(client, model, system, user) {
  const response = await client.messages.create({
    model,
    max_tokens: 5000,
    temperature: 0,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = response.content.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("The AI response did not contain text.");
  return parseJsonResponse(text);
}
