const SYNONYM_RULES = [
  [/\bsql\s*\/\s*rdbms\b/g, "sql rdbms"],
  [/\bspring\s*boot\b/g, "spring boot"],
  [/\bhtml5\b/g, "html"],
  [/\bcss3\b/g, "css"],
  [/\boop\b/g, "object oriented programming"],
  [/\bdata structures\s*(?:&|and)\s*algorithms\b/g, "data structures algorithms"],
  [/\brestful\s+services?\b/g, "rest api"],
  [/\brest\s+apis?\b/g, "rest api"],
  [/\bjs\b/g, "javascript"],
  [/\bpostgres\b/g, "postgresql"],
  [/\bnode\s*\.?\s*js\b/g, "node js"],
  [/\bnode\b/g, "node js"],
  [/\breact\s*\.?\s*js\b/g, "react"],
  [/\bangular\s*\.?\s*js\b/g, "angular"],
  [/\bvue\s*\.?\s*js\b/g, "vue"],
];
const STANDARD_HEADINGS = ["Summary", "Skills", "Projects", "Education", "Certifications"];

export function normalizeKeyword(value) {
  let normalized = String(value ?? "").toLowerCase();
  for (const [pattern, replacement] of SYNONYM_RULES) normalized = normalized.replace(pattern, replacement);
  return normalized.replace(/[^a-z0-9+#.]/g, " ").replace(/(?<![a-z0-9])\.|\.(?![a-z0-9])/g, " ").replace(/\s+/g, " ").trim();
}

const uniqueTerms = (values) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.trim()).filter((value) => {
    const key = normalizeKeyword(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function jdCategories(jd) {
  const required = uniqueTerms(jd.required_skills ?? jd.mustHaveSkills);
  const preferred = uniqueTerms([
    ...(jd.preferred_skills ?? jd.niceToHaveSkills ?? []),
    ...(jd.tools ?? []),
  ]).filter((term) => !required.some((requiredTerm) => normalizeKeyword(requiredTerm) === normalizeKeyword(term)));
  return { required, preferred };
}

function resumeEvidence(resume) {
  const groups = Object.values(resume.skills ?? {}).flatMap((items) => Array.isArray(items) ? items : []);
  const tools = Array.isArray(resume.tools) ? resume.tools : [];
  const projects = (resume.projects ?? []).map((project) => ({
    title: project.title ?? project.name ?? "",
    technologies: Array.isArray(project.technologies) ? project.technologies : [],
    text: [project.title, project.name, project.summary, project.description, ...(project.bullets ?? [])].filter(Boolean).join(" "),
  }));
  const experience = (resume.experience ?? []).flatMap((item) => [item.title, item.bullets ?? []]).flat(Infinity);
  const sourceText = resume._sourceText ?? "";
  const skillsAndProjectEvidence = [
    ...groups,
    ...tools,
    ...projects.flatMap((project) => [...project.technologies, project.text]),
  ].join(" ");
  return {
    skills: groups,
    tools,
    projects,
    skillsAndProjectEvidence,
    originalText: [sourceText, resume.summary, skillsAndProjectEvidence, ...experience].filter(Boolean).join(" "),
  };
}

function containsPhrase(text, phrase) {
  const normalizedText = ` ${normalizeKeyword(text)} `;
  const normalizedPhrase = normalizeKeyword(phrase);
  return Boolean(normalizedPhrase && normalizedText.includes(` ${normalizedPhrase} `));
}

function evidenceFor(term, evidence) {
  if (normalizeKeyword(term) === "sql rdbms") {
    const alternatives = ["SQL", "RDBMS"];
    const foundAlternative = alternatives.find((alternative) => containsPhrase(evidence.skillsAndProjectEvidence, alternative));
    if (foundAlternative) return { status: "FOUND", evidence: [`SQL/RDBMS supported by ${foundAlternative}`] };
  }
  const entries = [
    ...evidence.skills.map((value) => ({ value, type: "skill" })),
    ...evidence.tools.map((value) => ({ value, type: "tool" })),
    ...evidence.projects.flatMap((project) => [
      ...project.technologies.map((value) => ({ value, type: "project technology", project: project.title })),
      { value: project.text, type: "project text", project: project.title },
    ]),
  ];
  const found = entries.filter((entry) => containsPhrase(entry.value, term));
  if (found.length) return { status: "FOUND", evidence: uniqueTerms(found.map(({ value, type, project }) => `${type}${project ? ` — ${project}` : ""}: ${value}`)) };

  const targetTokens = normalizeKeyword(term).split(" ").filter((token) => token.length > 1);
  if (targetTokens.length > 1) {
    const sourceTokens = new Set(normalizeKeyword(evidence.skillsAndProjectEvidence).split(" "));
    const overlap = targetTokens.filter((token) => sourceTokens.has(token)).length;
    if (overlap > 0 && overlap < targetTokens.length && overlap / targetTokens.length >= 0.5) {
      return { status: "PARTIAL", evidence: [`Related term overlap: ${overlap}/${targetTokens.length} key terms`] };
    }
  }
  return { status: "MISSING", evidence: [] };
}

function scoreMatches(terms, evidence) {
  return terms.map((keyword) => ({ keyword, ...evidenceFor(keyword, evidence) }));
}

function categoryPoints(items, weight) {
  if (!items.length) return 0;
  const earned = items.reduce((total, item) => total + (item.status === "FOUND" ? 1 : item.status === "PARTIAL" ? 0.5 : 0), 0);
  return weight * earned / items.length;
}

function sectionStatus(resume) {
  const source = resume._sourceText ?? "";
  const detected = resume.sections_present ?? [];
  const aliases = {
    Summary: ["summary", "professional summary", "profile", "objective", "career objective"],
    Skills: ["skills", "technical skills", "core competencies", "technologies", "skill set", "technical proficiency"],
    Projects: ["projects", "selected projects", "personal projects"],
    Education: ["education", "academic background"],
    Certifications: ["certifications", "certificates", "licenses"],
  };
  return Object.fromEntries(Object.entries(aliases).map(([name, names]) => {
    const presentByContent = name === "Summary" ? Boolean(String(resume.summary ?? "").trim())
      : name === "Skills" ? Object.values(resume.skills ?? {}).some((items) => Array.isArray(items) && items.length > 0)
      : name === "Projects" ? Boolean(resume.projects?.length)
      : name === "Education" ? Boolean(resume.education?.length)
      : Boolean(resume.certifications?.length);
    const headingPresent = detected.length
      ? detected.some((heading) => names.includes(String(heading).toLowerCase()))
      : names.some((heading) => new RegExp(`^\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*$`, "im").test(source));
    return [name, { present: presentByContent, headingPresent }];
  }));
}

function formattingStatus(resume, sections) {
  const contactPresent = Boolean(resume.name && (resume.email || resume.phone));
  const sectionContent = Object.entries(sections).filter(([, section]) => section.present);
  const standardHeadings = sectionContent.length > 0 && sectionContent.every(([, section]) => section.headingPresent);
  const structurallySingleColumn = resume.formatting?.singleColumn ?? (!resume.columns || resume.columns === 1);
  const noStructuredTables = resume.formatting?.noTables ?? (resume.tables !== true);
  const noDecorativeIcons = resume.formatting?.noIcons ?? (resume.icons !== true);
  const hasStandardHeadings = resume.formatting?.standardHeadings ?? standardHeadings;
  const hasParseableContact = resume.formatting?.parseableContact ?? contactPresent;
  return {
    singleColumn: structurallySingleColumn,
    standardHeadings: hasStandardHeadings,
    noTables: noStructuredTables,
    noIcons: noDecorativeIcons,
    parseableContact: hasParseableContact,
  };
}

function missingAdvice(keyword, status, originalEvidence, required) {
  const supported = containsPhrase(originalEvidence, keyword);
  if (supported) {
    return {
      recommendation: "Add to resume",
      whyNotAdded: "Related evidence is present in the original. Verify that evidence and add the exact term only in the truthful section.",
      miniProjectIdea: "",
      priority: required ? "High" : "Medium",
    };
  }
  return {
    recommendation: "Learn / build this",
    whyNotAdded: status === "PARTIAL" ? "The resume contains partial related evidence, but not enough to claim this skill." : "No supporting evidence was found in the original resume.",
    miniProjectIdea: `Add a ${keyword} feature to a project already listed in the resume, then document only what you actually implemented.`,
    priority: required ? "High" : "Medium",
  };
}

function scoringDetails(resume, jd, original) {
  const evidence = resumeEvidence(resume);
  const originalEvidence = resumeEvidence(original ?? resume).originalText;
  const categories = jdCategories(jd);
  const requiredMatches = scoreMatches(categories.required, evidence);
  const preferredMatches = scoreMatches(categories.preferred, evidence);
  const sections = sectionStatus(resume);
  const presentSections = Object.values(sections).filter((section) => section.present).length;
  const completenessPoints = 15 * presentSections / STANDARD_HEADINGS.length;
  const formatting = formattingStatus(resume, sections);
  const formattingPoints = 10 * Object.values(formatting).filter(Boolean).length / 5;
  const keywords = uniqueTerms(jd.keywords?.length ? jd.keywords : [...categories.required, ...categories.preferred]);
  const summaryMatches = keywords.filter((keyword) => containsPhrase(resume.summary ?? "", keyword));
  const components = {
    required: categoryPoints(requiredMatches, 50),
    preferred: categoryPoints(preferredMatches, 20),
    completeness: completenessPoints,
    formatting: formattingPoints,
    summaryKeywords: keywords.length ? 5 * summaryMatches.length / keywords.length : 0,
  };
  const eligibleWeights = {
    required: categories.required.length > 0 ? 50 : 0,
    preferred: categories.preferred.length > 0 ? 20 : 0,
    completeness: STANDARD_HEADINGS.length ? 15 : 0,
    formatting: 10,
    summaryKeywords: keywords.length > 0 ? 5 : 0,
  };
  const activeMaximum = Object.values(eligibleWeights).reduce((sum, weight) => sum + weight, 0);
  const normalizedComponents = Object.fromEntries(Object.entries(components).map(([key, value]) => [
    key,
    activeMaximum ? value * 100 / activeMaximum : 0,
  ]));
  const normalizedWeights = Object.fromEntries(Object.entries(eligibleWeights).map(([key, weight]) => [
    key,
    activeMaximum ? weight * 100 / activeMaximum : 0,
  ]));
  const missingKeywords = [...requiredMatches.map((item) => ({ ...item, category: "Required" })), ...preferredMatches.map((item) => ({ ...item, category: "Preferred" }))]
    .filter((item) => item.status !== "FOUND")
    .map((item) => ({ ...item, ...missingAdvice(item.keyword, item.status, originalEvidence, item.category === "Required") }));
  const deductions = [
    ["Required skills", components.required, 50, categories.required.length > 0, requiredMatches.filter((item) => item.status !== "FOUND").map((item) => `${item.keyword} is ${item.status.toLowerCase()}.`)],
    ["Preferred skills and tools", components.preferred, 20, categories.preferred.length > 0, preferredMatches.filter((item) => item.status !== "FOUND").map((item) => `${item.keyword} is ${item.status.toLowerCase()}.`)],
    ["Section completeness", components.completeness, 15, true, Object.entries(sections).filter(([, section]) => !section.present).map(([name]) => `${name} section is absent or empty.`)],
    ["ATS formatting", components.formatting, 10, true, Object.entries(formatting).filter(([, pass]) => !pass).map(([key]) => `${key} check failed for the resume's structure.`)],
    ["JD keywords in summary", components.summaryKeywords, 5, keywords.length > 0, keywords.filter((keyword) => !summaryMatches.includes(keyword)).map((keyword) => `${keyword} is not present in the summary.`)],
  ];
  const breakdown = deductions.filter(([, , , active]) => active).map(([category, points, maximum, , reasons]) => ({
    category,
    points: Math.round(normalizedComponents[category === "Required skills" ? "required" : category === "Preferred skills and tools" ? "preferred" : category === "Section completeness" ? "completeness" : category === "ATS formatting" ? "formatting" : "summaryKeywords"] * 10) / 10,
    maximum: Math.round(normalizedWeights[category === "Required skills" ? "required" : category === "Preferred skills and tools" ? "preferred" : category === "Section completeness" ? "completeness" : category === "ATS formatting" ? "formatting" : "summaryKeywords"] * 10) / 10,
    reason: points === maximum ? "No deduction." : reasons.length ? reasons.join(" ") : "No scoreable terms were present in this category.",
  }));
  const rawScore = Object.values(normalizedComponents).reduce((sum, value) => sum + value, 0);
  return {
    total: Math.round(rawScore),
    rawTotal: Math.round(rawScore * 100) / 100,
    formula: "Available rubric weights are re-normalized to 100 when a keyword category is empty. FOUND=1, PARTIAL=0.5, MISSING=0.",
    components: Object.fromEntries(Object.entries(normalizedComponents).map(([key, value]) => [key, Math.round(value * 10) / 10])),
    weights: Object.fromEntries(Object.entries(normalizedWeights).map(([key, value]) => [key, Math.round(value * 10) / 10])),
    breakdown,
    requiredMatch: { items: requiredMatches, found: requiredMatches.filter((item) => item.status === "FOUND").length, matched: requiredMatches.filter((item) => item.status === "FOUND").length, partial: requiredMatches.filter((item) => item.status === "PARTIAL").length, total: requiredMatches.length },
    preferredMatch: { items: preferredMatches, found: preferredMatches.filter((item) => item.status === "FOUND").length, matched: preferredMatches.filter((item) => item.status === "FOUND").length, partial: preferredMatches.filter((item) => item.status === "PARTIAL").length, total: preferredMatches.length },
    matchedKeywords: [...requiredMatches, ...preferredMatches].filter((item) => item.status === "FOUND").map((item) => item.keyword),
    partialKeywords: [...requiredMatches, ...preferredMatches].filter((item) => item.status === "PARTIAL").map((item) => item.keyword),
    missingKeywords,
    keywordSummary: { matched: summaryMatches.length, total: keywords.length, matchedKeywords: summaryMatches },
    completeness: { score: presentSections / STANDARD_HEADINGS.length, sections, standardHeadings: STANDARD_HEADINGS },
    formatting,
  };
}

export function scoreResume(resume, jd, options = {}) {
  return scoringDetails(resume, jd, options.original);
}
