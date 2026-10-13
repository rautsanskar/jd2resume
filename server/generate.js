import { requestJson } from "./parse.js";
import { SCORE_PROMPT, SECTION_PROMPT, TAILOR_PROMPT } from "./prompts.js";
import { scoreResume } from "./scoring.js";

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9+#.]/g, " ").replace(/(?<![a-z0-9])\.|\.(?![a-z0-9])/g, " ").replace(/\s+/g, " ").trim();
}

function sourceTextFor(original) {
  return normalize([
    original.summary,
    ...Object.values(original.skills ?? {}).flatMap((items) => Array.isArray(items) ? items : []),
    ...(original.projects ?? []).flatMap((item) => [item.name, item.description, ...(item.bullets ?? []), ...(item.technologies ?? [])]),
    ...(original.experience ?? []).flatMap((item) => [item.title, item.company, ...(item.bullets ?? [])]),
    ...(original.education ?? []).flatMap((item) => [item.degree, item.institution, ...(item.details ?? [])]),
    ...(original.certifications ?? []).map((item) => item.name),
    ...(original.achievements ?? []),
  ].filter(Boolean).join(" "));
}

function containsPhrase(text, phrase) {
  const normalizedText = normalize(text);
  const normalizedPhrase = normalize(phrase);
  return normalizedPhrase && (` ${normalizedText} `).includes(` ${normalizedPhrase} `);
}

function preserveVerifiedSkills(original, tailored, confirmedSkills) {
  const sourceText = sourceTextFor(original);
  const confirmed = new Set(confirmedSkills.map(normalize));
  const categories = new Set([...Object.keys(original.skills ?? {}), ...Object.keys(tailored.skills ?? {})]);
  const sourceSkills = new Map(Object.values(original.skills ?? {}).flatMap((items) => ensureArray(items)).map((skill) => [normalize(skill), skill]));
  const result = Object.fromEntries([...categories].map((category) => [category, []]));
  for (const category of categories) {
    const candidates = [...ensureArray(original.skills?.[category]), ...ensureArray(tailored.skills?.[category])];
    const seen = new Set();
    for (const skill of candidates) {
      const key = normalize(skill);
      if (!key || seen.has(key)) continue;
      const verifiedSource = sourceSkills.get(key);
      if (verifiedSource || confirmed.has(key) || (` ${sourceText} `).includes(` ${key} `)) {
        result[category].push(verifiedSource ?? skill);
        seen.add(key);
      }
    }
  }
  return result;
}

const SAFE_REWRITE_STOPWORDS = new Set(["a", "an", "and", "are", "as", "at", "by", "for", "from", "in", "into", "is", "of", "on", "or", "the", "to", "using", "with", "that", "which"]);
function isGroundedRewrite(value, source) {
  if (typeof value !== "string" || !value.trim()) return false;
  const candidate = normalize(value);
  const evidence = normalize(source);
  const sourceNumbers = evidence.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  if ((candidate.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []).some((number) => !sourceNumbers.includes(number))) return false;
  const sourceWords = new Set(evidence.split(/\s+/));
  const addedTerms = candidate.split(/\s+/).filter((word) => word.length > 3 && !SAFE_REWRITE_STOPWORDS.has(word) && !sourceWords.has(word));
  return addedTerms.length === 0;
}

function preserveImmutable(original, tailored, confirmedSkills, jd) {
  const sourceExperience = ensureArray(original.experience);
  const sourceProjects = ensureArray(original.projects);
  const sourceText = sourceTextFor(original);
  const confirmed = ensureArray(confirmedSkills);
  const unsupportedJdSkills = [
    ...(jd.mustHaveSkills ?? []),
    ...(jd.niceToHaveSkills ?? []),
    ...(jd.tools ?? []),
  ].filter((skill) => !containsPhrase(sourceText, skill) && !confirmed.some((item) => normalize(item) === normalize(skill)));
  const removeUnsupportedClaims = (value, fallback) => unsupportedJdSkills.some((skill) => containsPhrase(value, skill))
    ? fallback
    : value;
  const preserveSafeText = (generated, fallback) => generated == null || !isGroundedRewrite(generated, sourceText) ? fallback : removeUnsupportedClaims(generated, fallback);
  const preserveBullets = (generated, source, projectSource = sourceText) => {
    const sourceBullets = ensureArray(source);
    if (!Array.isArray(generated)) return sourceBullets;
    const safeBullets = generated
      .filter((bullet) => isGroundedRewrite(bullet, projectSource))
      .map((bullet) => removeUnsupportedClaims(bullet, sourceBullets.find((item) => normalize(item) === normalize(bullet))))
      .filter((bullet) => typeof bullet === "string" && bullet.trim());
    return safeBullets.length ? safeBullets.slice(0, 3) : sourceBullets;
  };
  return {
    ...tailored,
    name: original.name,
    phone: original.phone,
    email: original.email,
    linkedin: original.linkedin,
    github: original.github,
    portfolio: original.portfolio,
    location: original.location,
    education: original.education,
    certifications: original.certifications,
    achievements: ensureArray(original.achievements),
    summary: preserveSafeText(tailored.summary, original.summary),
    skills: preserveVerifiedSkills(original, tailored, ensureArray(confirmedSkills)),
    experience: sourceExperience.map((source, index) => {
      const item = ensureArray(tailored.experience)[index] ?? source;
      return {
        ...source,
        ...item,
        company: source.company,
        title: source.title,
        location: source.location,
        dates: source.dates,
        bullets: preserveBullets(item.bullets, source.bullets),
      };
    }),
    projects: sourceProjects.map((source, index) => ({
      ...source,
      ...(ensureArray(tailored.projects)[index] ?? {}),
      name: source.name,
      description: preserveSafeText(ensureArray(tailored.projects)[index]?.description, source.description),
      bullets: preserveBullets(
        ensureArray(tailored.projects)[index]?.bullets,
        source.bullets,
        [source.name, source.description, ...(source.bullets ?? []), ...(source.technologies ?? [])].join(" "),
      ),
      technologies: [...new Set(ensureArray(source.technologies).map((technology) => [technology.trim(), normalize(technology)]).filter(([value, key], itemIndex, all) => value && all.findIndex(([, other]) => other === key) === itemIndex).map(([value]) => value))],
      dates: source.dates,
      link: source.link,
    })),
  };
}

export async function generateResume(client, model, original, jd, options) {
  const initialScore = scoreResume(original, jd, options);
  const userMessage = JSON.stringify({
    originalResume: original,
    jobDescription: jd,
    options,
    confirmedSkills: ensureArray(options.confirmedSkills),
    initialScore,
  });
  const first = await requestJson(client, model, TAILOR_PROMPT, userMessage);
  if (!first.resume) throw new Error("The AI response did not include a tailored resume.");
  let resume = preserveImmutable(original, first.resume, options.confirmedSkills ?? [], jd);
  let optimizationPasses = 0;
  let qualityCheck = { qualityNotes: [], safeOptimizations: [] };

  let score = scoreResume(resume, jd, { ...options, original });
  if (score.total < 80) {
    qualityCheck = await requestJson(
      client,
      model,
      SCORE_PROMPT,
      JSON.stringify({ originalResume: original, tailoredResume: resume, jobDescription: jd, score }),
    );
    const optimized = await requestJson(
      client,
      model,
      TAILOR_PROMPT,
      `${userMessage}\n\nONE SAFE OPTIMIZATION PASS: Improve alignment and clarity using only verified source facts. Apply these review suggestions if useful: ${JSON.stringify(ensureArray(qualityCheck.safeOptimizations))}. If no safe improvement is available, return the current resume unchanged. Current tailored resume: ${JSON.stringify(resume)}`,
    );
    if (optimized.resume) {
      resume = preserveImmutable(original, optimized.resume, options.confirmedSkills ?? [], jd);
      score = scoreResume(resume, jd, { ...options, original });
      optimizationPasses = 1;
    }
  }
  return {
    original,
    resume,
    jd,
    suggestions: first.suggestions ?? {},
    scores: { before: initialScore, after: score },
    optimizationPasses,
    qualityNotes: ensureArray(qualityCheck.qualityNotes),
  };
}

export async function regenerateSection(client, model, input) {
  const result = await requestJson(client, model, SECTION_PROMPT, JSON.stringify(input));
  if (!Object.hasOwn(result, "content")) throw new Error("The AI response did not include section content.");
  return result.content;
}
