import { scoreResume } from "./scoring.js";
import { buildScoringExtraction, generateResumeLocally, groupSkills } from "./local.js";
import { normalizeKeyword } from "./scoring.js";

function stringArray(items) {
  return { type: "ARRAY", items: { type: "STRING" } };
}

export const GEMINI_JD_SCHEMA = {
  type: "OBJECT",
  properties: {
    required_skills: stringArray(),
    preferred_skills: stringArray(),
    tools: stringArray(),
    responsibilities: stringArray(),
    experience_level: { type: "STRING" },
    job_title: { type: "STRING" },
    keywords: stringArray(),
  },
  required: ["required_skills", "preferred_skills", "tools", "responsibilities", "experience_level", "job_title", "keywords"],
};

export const GEMINI_EXTRACTION_RESUME_SCHEMA = {
  type: "OBJECT",
  properties: {
    skills: stringArray(),
    tools: stringArray(),
    projects: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          technologies: stringArray(),
          summary: { type: "STRING" },
        },
        required: ["title", "technologies", "summary"],
      },
    },
    education: stringArray(),
    certifications: stringArray(),
  },
  required: ["skills", "tools", "projects", "education", "certifications"],
};

export const GEMINI_RESUME_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    contact: {
      type: "OBJECT",
      properties: {
        phone: { type: "STRING" },
        email: { type: "STRING" },
        linkedin: { type: "STRING" },
        github: { type: "STRING" },
        location: { type: "STRING" },
      },
      required: ["phone", "email", "linkedin", "github", "location"],
    },
    summary: { type: "STRING" },
    skills: {
      type: "OBJECT",
      properties: {
        programmingLanguages: { type: "ARRAY", items: { type: "STRING" } },
        frontend: { type: "ARRAY", items: { type: "STRING" } },
        backendFrameworks: { type: "ARRAY", items: { type: "STRING" } },
        databases: { type: "ARRAY", items: { type: "STRING" } },
        tools: { type: "ARRAY", items: { type: "STRING" } },
        coreConcepts: { type: "ARRAY", items: { type: "STRING" } },
        softSkills: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["programmingLanguages", "frontend", "backendFrameworks", "databases", "tools", "coreConcepts", "softSkills"],
    },
    projects: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          bullets: { type: "ARRAY", items: { type: "STRING" } },
          technologies: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "bullets", "technologies"],
      },
    },
    education: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          degree: { type: "STRING" },
          institute: { type: "STRING" },
          year: { type: "STRING" },
          cgpa: { type: "STRING" },
        },
        required: ["degree", "institute", "year", "cgpa"],
      },
    },
    certifications: { type: "ARRAY", items: { type: "STRING" } },
    experience: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          company: { type: "STRING" },
          location: { type: "STRING" },
          dates: { type: "STRING" },
          bullets: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "company", "location", "dates", "bullets"],
      },
    },
    ats_score: { type: "INTEGER" },
    suggestions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["name", "contact", "summary", "skills", "projects", "education", "certifications", "experience", "ats_score", "suggestions"],
};

export const GEMINI_JD_EXTRACTION_PROMPT = "Extract only information explicitly stated in the job description. Normalize common skill synonyms. Return only JSON matching the supplied schema.";
export const GEMINI_RESUME_EXTRACTION_PROMPT = "Extract only skills, tools, projects, education, and certifications explicitly supported by the resume. Never infer or invent a skill or project fact. Return only JSON matching the supplied schema.";
export const GEMINI_TAILORING_PROMPT = "Return only JSON matching the supplied response schema. Tailor the summary and reorder skills using only the source resume and job description. Never create contact details, skills, project facts, bullets, technologies, dates, education, employers, certifications, or metrics. Keep suggestions as separate on-screen recommendations, never resume content.";

const NORMALIZE = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9+#.]/g, " ").replace(/\s+/g, " ").trim();
const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "of", "on", "or", "the", "to", "using", "with", "that", "which"]);
const array = (value) => Array.isArray(value) ? value : [];

async function geminiJson({ apiKey, model, schema, instructions, input, fetchImpl }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      system_instruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`Gemini returned ${response.status}: ${detail}`);
  }
  const payload = await response.json();
  const jsonText = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!jsonText) throw new Error("Gemini returned no structured JSON.");
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Gemini returned invalid JSON: ${error.message}`);
  }
}

function verifiedSourceTerm(term, source) {
  const candidate = normalizeKeyword(term);
  const normalizedSource = ` ${normalizeKeyword(source)} `;
  return Boolean(candidate && normalizedSource.includes(` ${candidate} `));
}

function mergeResumeExtraction(original, extracted, jd) {
  const source = original._sourceText ?? "";
  const verifiedSkills = unique([...array(extracted.skills), ...array(extracted.tools)])
    .filter((skill) => verifiedSourceTerm(skill, source));
  const skillInventory = Object.values(original.skills ?? {}).flatMap((items) => array(items));
  const projects = (original.projects ?? []).map((project) => {
    const extractedProject = array(extracted.projects).find((candidate) => NORMALIZE(candidate.title) === NORMALIZE(project.name));
    const technologies = unique([
      ...array(project.technologies),
      ...array(extractedProject?.technologies).filter((technology) => verifiedSourceTerm(technology, source)),
    ]);
    return { ...project, technologies };
  });
  return {
    ...original,
    skills: groupSkills([...skillInventory, ...verifiedSkills], jd),
    projects,
  };
}

function mergeJobExtraction(localJd, extracted) {
  const requiredSkills = unique([...array(localJd.required_skills), ...array(extracted.required_skills)]);
  const preferredSkills = unique([...array(localJd.preferred_skills), ...array(extracted.preferred_skills)])
    .filter((skill) => !requiredSkills.some((required) => NORMALIZE(required) === NORMALIZE(skill)));
  const tools = unique([...array(localJd.tools), ...array(extracted.tools)]);
  const responsibilities = unique([...array(localJd.responsibilities), ...array(extracted.responsibilities)]);
  const keywords = unique([...requiredSkills, ...preferredSkills, ...tools, ...array(extracted.keywords), ...array(localJd.keywords)]);
  return {
    ...localJd,
    job_title: extracted.job_title || localJd.job_title || localJd.role,
    role: extracted.job_title || localJd.role,
    required_skills: requiredSkills,
    preferred_skills: preferredSkills,
    mustHaveSkills: requiredSkills,
    niceToHaveSkills: preferredSkills,
    tools,
    responsibilities,
    experience_level: extracted.experience_level || localJd.experience_level,
    keywords,
  };
}

function grounded(text, evidence) {
  if (typeof text !== "string" || !text.trim()) return false;
  const normalizedText = NORMALIZE(text);
  const normalizedEvidence = NORMALIZE(evidence);
  const evidenceWords = new Set(normalizedEvidence.split(/\s+/));
  const numbers = normalizedText.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const sourceNumbers = normalizedEvidence.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  return numbers.every((number) => sourceNumbers.includes(number))
    && normalizedText.split(/\s+/).every((word) => word.length <= 3 || STOP_WORDS.has(word) || evidenceWords.has(word));
}

function unique(values) {
  const seen = new Set();
  return array(values).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()).filter((value) => {
    const key = NORMALIZE(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeModelOutput(output, original, jd, options) {
  if (!output || typeof output !== "object" || !output.contact || !output.skills || !Array.isArray(output.projects)) {
    throw new Error("Gemini returned JSON that does not match the resume schema.");
  }
  const base = generateResumeLocally(original, jd, options);
  const evidence = original._sourceText ?? "";
  const summary = grounded(output.summary, evidence) ? output.summary.trim() : base.resume.summary;
  const projects = array(original.projects).map((source, index) => {
    const candidate = output.projects.find((project) => NORMALIZE(project.title) === NORMALIZE(source.name)) ?? output.projects[index];
    const projectEvidence = [source.name, source.description, ...(source.bullets ?? []), ...(source.technologies ?? [])].join(" ");
    const modelBullets = unique(candidate?.bullets).filter((bullet) => grounded(bullet, projectEvidence)).slice(0, 3);
    return {
      ...source,
      bullets: modelBullets.length ? modelBullets : array(source.bullets),
      technologies: unique(source.technologies),
    };
  });
  const resume = {
    ...base.resume,
    name: original.name,
    phone: original.phone,
    email: original.email,
    linkedin: original.linkedin,
    github: original.github,
    portfolio: original.portfolio,
    location: original.location,
    summary,
    skills: base.resume.skills,
    projects,
    education: original.education,
    certifications: original.certifications,
    experience: original.experience,
  };
  const scores = { before: scoreResume(original, jd, options), after: scoreResume(resume, jd, { ...options, original }) };
  return {
    ...base,
    resume,
    scores,
    optimizationPasses: 0,
    qualityNotes: ["Gemini structured JSON was checked against the source resume. Unsupported contact, skill, project, education, and experience changes were discarded."],
    mode: "gemini",
  };
}

export async function generateResumeWithGemini({ apiKey, model = "gemini-2.5-flash", original, jd, options, resumeText = original._sourceText ?? "", jdText = "", fetchImpl = fetch }) {
  const [jdExtraction, resumeExtraction] = await Promise.all([
    geminiJson({
      apiKey, model, schema: GEMINI_JD_SCHEMA, fetchImpl,
        instructions: GEMINI_JD_EXTRACTION_PROMPT,
      input: { jobDescription: jdText, requiredOutput: GEMINI_JD_SCHEMA },
    }),
    geminiJson({
      apiKey, model, schema: GEMINI_EXTRACTION_RESUME_SCHEMA, fetchImpl,
        instructions: GEMINI_RESUME_EXTRACTION_PROMPT,
      input: { resume: resumeText, requiredOutput: GEMINI_EXTRACTION_RESUME_SCHEMA },
    }),
  ]);
  const extractedJd = mergeJobExtraction(jd, jdExtraction);
  const extractedOriginal = mergeResumeExtraction(original, resumeExtraction, extractedJd);
  const base = generateResumeLocally(extractedOriginal, extractedJd, options);
  const sourceResume = Object.fromEntries(Object.entries(extractedOriginal).filter(([key]) => !key.startsWith("_")));
  const output = await geminiJson({
    apiKey, model, schema: GEMINI_RESUME_SCHEMA, fetchImpl,
    instructions: GEMINI_TAILORING_PROMPT,
    input: { originalResume: sourceResume, jobDescription: extractedJd, options, requestedSchema: GEMINI_RESUME_SCHEMA },
  });
  const result = normalizeModelOutput(output, extractedOriginal, extractedJd, options);
  result.extraction = buildScoringExtraction(extractedOriginal, extractedJd);
  result.scores.before = scoreResume(extractedOriginal, extractedJd, options);
  result.scores.after = scoreResume(result.resume, extractedJd, { ...options, original: extractedOriginal });
  if (result.scores.after.total < 80 && base.optimizationPasses > 0) {
    const optimizedResume = { ...result.resume, summary: base.resume.summary };
    const optimizedScore = scoreResume(optimizedResume, extractedJd, { ...options, original: extractedOriginal });
    if (optimizedScore.total > result.scores.after.total) {
      result.resume = optimizedResume;
      result.scores.after = optimizedScore;
      result.optimizationPasses = 1;
    }
  }
  result.suggestions = base.suggestions;
  return result;
}
