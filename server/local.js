import { scoreResume } from "./scoring.js";

const SECTION_ALIASES = {
  summary: ["summary", "professional summary", "profile", "objective", "career objective"],
  skills: ["skills", "technical skills", "core competencies", "technologies", "skill set", "technical proficiency"],
  experience: ["experience", "work experience", "employment history", "professional experience"],
  projects: ["projects", "selected projects", "personal projects"],
  education: ["education", "academic background"],
  certifications: ["certifications", "certificates", "licenses"],
  achievements: ["achievements", "awards", "honors"],
};

const COMMON_SKILLS = [
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", ".NET", "React", "Angular", "Vue",
  "Spring Boot", "Spring", "Hibernate", "JPA", "J2EE", "JDBC", "Maven", "Gradle",
  "Microservices", "Object-Oriented Programming", "OOP", "Data Structures", "Algorithms", "Node.js",
  "Express", "HTML", "CSS", "Bootstrap", "Tailwind CSS", "SQL", "PostgreSQL", "MySQL", "MongoDB", "REST APIs",
  "GraphQL", "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Git", "Linux", "Machine Learning",
  "TensorFlow", "PyTorch", "Excel", "Power BI", "Tableau", "Figma", "Agile", "Scrum", "Communication",
  "Leadership", "Collaboration", "Problem solving", "Critical Thinking", "Teamwork", "Time Management", "Communication", "Project management", "Customer service",
  "Data analysis", "Data visualization", "CI/CD", "Terraform", "Jenkins", "Redis", "Spring",
  "Django", "Flask", "Airflow", "Snowflake", "dbt", "DBMS", "Eclipse", "VS Code",
];
const TOOL_SKILLS = new Set(["Git", "Maven", "Gradle", "Docker", "Kubernetes", "AWS", "Azure", "GCP", "Excel", "Power BI", "Tableau", "Figma", "Terraform", "Jenkins", "Airflow", "Snowflake", "dbt", "Eclipse", "VS Code"]);
const DATABASE_SKILLS = new Set(["SQL", "PostgreSQL", "MySQL", "MongoDB", "DBMS", "Redis", "Snowflake"]);
const WEB_SKILLS = new Set(["HTML", "CSS", "React", "Angular", "Vue", "Bootstrap", "Tailwind CSS", "Node.js", "Express", "REST APIs", "GraphQL"]);
const SOFT_SKILLS = new Set(["Communication", "Leadership", "Collaboration", "Problem solving", "Critical Thinking", "Teamwork", "Time Management", "Customer service", "Project management"]);
const CORE_SKILLS = new Set(["Object-Oriented Programming", "OOP", "Data Structures", "Algorithms", "Data Structures & Algorithms", "Data Visualization", "Critical Thinking"]);
const ACTION_VERB = /^(built|created|developed|designed|implemented|improved|increased|reduced|automated|led|launched|delivered|managed|analyzed|optimized|maintained|collaborated|supported|coordinated|engineered|migrated|resolved|configured|wrote|deployed|tested|integrated|streamlined|generated|achieved)\b/i;

const cleanLine = (line) => line.replace(/^\s*(?:[•*-]|\d+[.)])\s*/, "").trim();
const normalized = (value) => String(value ?? "").toLowerCase()
  .replace(/\bhtml5\b/g, "html")
  .replace(/\bcss3\b/g, "css")
  .replace(/\boop\b/g, "object oriented programming")
  .replace(/\bdata structures\s*(?:&|and)\s*algorithms\b/g, "data structures algorithms")
  .replace(/[^a-z0-9+#.]/g, " ")
  .replace(/(?<![a-z0-9])\.|\.(?![a-z0-9])/g, " ")
  .replace(/\s+/g, " ").trim();
const hasTerm = (text, term) => (` ${normalized(text)} `).includes(` ${normalized(term)} `);

function detectSection(line) {
  const heading = cleanLine(line).replace(/[:\s]+$/, "").toLowerCase();
  return Object.entries(SECTION_ALIASES).find(([, aliases]) => aliases.includes(heading))?.[0];
}

function getSectionLines(lines) {
  const sections = Object.fromEntries(Object.keys(SECTION_ALIASES).map((name) => [name, []]));
  let active = "";
  const unclassified = [];
  for (const line of lines) {
    const section = detectSection(line);
    if (section) {
      active = section;
      continue;
    }
    if (active) sections[active].push(line);
    else unclassified.push(cleanLine(line));
  }
  return { sections, unclassified };
}

function splitItems(lines) {
  return lines.flatMap((line) => line.split(/[;,|]/)).map(cleanLine).filter(Boolean);
}

function sectionEntries(lines) {
  const entries = [];
  let current = null;
  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const explicitBullet = /^\s*(?:[•*-]|\d+[.)])\s*/.test(rawLine);
    if (!explicitBullet && current && (/\b(19|20)\d{2}\b/.test(line) || line.length < 105)) {
      entries.push(current);
      current = { heading: line, bullets: [] };
    } else if (!current) {
      current = { heading: line, bullets: [] };
    } else {
      current.bullets.push(line);
    }
  }
  if (current) entries.push(current);
  return entries;
}

function detectSkills(text) {
  const found = COMMON_SKILLS.filter((skill) => hasTerm(text, skill));
  return found.filter((skill) => !found.some((other) => (
    other !== skill && normalized(other).startsWith(`${normalized(skill)} `)
  )));
}

const REQUIREMENT_PREFIX = /^(?:(?:required|must[- ]have|preferred|nice[- ]to[- ]have|bonus|proficiency in|proficient in|experience with|experienced with|knowledge of|familiarity with|skills? in|including|such as)\s*:?\s*)+/i;
const GENERIC_REQUIREMENTS = new Set([
  "experience", "years of experience", "related experience", "strong communication",
  "excellent communication", "work authorization", "bachelor degree", "bachelor s degree",
  "master degree", "master s degree", "relevant field", "or equivalent",
]);

function extractRequirementPhrases(text, knownSkills) {
  const known = new Set(knownSkills.map(normalized));
  return [...new Set(text
    .split(/[,;|\n•]+|(?<=\.)\s+(?=[A-Z])/)
    .map((chunk) => chunk.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").replace(REQUIREMENT_PREFIX, "").replace(/[.!?]+$/, "").trim())
    .filter((phrase) => phrase && phrase.split(/\s+/).length <= 6 && !GENERIC_REQUIREMENTS.has(normalized(phrase)))
    .filter((phrase) => !known.has(normalized(phrase)))
    .filter((phrase) => /[a-z]/i.test(phrase) && !/^\d/.test(phrase)))]
    .map((phrase) => phrase.replace(/\s+/g, " "));
}

const JOB_SECTION_BOUNDARY = /^\s*(?:preferred(?:\s+skills?)?|nice[- ]to[- ]have|bonus|responsibilities|key responsibilities|what you(?:'|’)ll do|what you(?:'|’)ll bring|about (?:the )?(?:role|job|company)|benefits|equal opportunity|compensation|company|position|experience|eligibility|location|apply here|job details)\s*[:*\-–]/i;
const MUST_LABEL = /^\s*(?:required(?:\s+skills?)?|must[- ]have(?:\s+skills?)?|technical requirements|what you(?:'|’)ll need)\s*[:\-–]?\s*(.*)$/i;
const NICE_LABEL = /^\s*(?:preferred\s+skills?|nice[- ]to[- ]have|bonus\s+skills?)\s*[:\-–]?\s*(.*)$/i;

function cleanJobDescription(text) {
  return String(text ?? "")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[\uFE0F\u200D]/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[#*`]/g, " ")
      .replace(/\bexciting opportunity(?: to work)?\b[:,!\s-]*/ig, " ")
      .replace(/\bapply now\b.*$/i, " ")
      .replace(/\b(?:message|connect)\s+(?:us\s+)?on whatsapp\b.*$/i, " ")
      .replace(/\s+/g, " ").trim())
    .filter((line) => line && !/whats?app|linkedin|apply now|apply here|follow us|contact (?:us|the recruiter)|send your resume|share your cv|walk-in drive/i.test(line)
      && !/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d\s().-]{8,}\d)|https?:\/\/|www\.)/i.test(line))
    .join("\n")
    .trim();
}

function extractJobTitle(lines) {
  for (const line of lines.slice(0, 6)) {
    const clean = line
      .replace(/^(?:(?:exciting\s+)?(?:fresher|experienced|entry[- ]level)\s+)?(?:urgent hiring|job opening|career opportunity|opportunity)\s*[:|,-]?\s*/i, "")
      .replace(/^(?:fresher|experienced|entry[- ]level)\s*[:|,-]?\s*/i, "")
      .replace(/\b(?:at|with)\s+[A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,3}\b.*$/i, "")
      .replace(/^(?:exciting opportunity|opportunity|job title|position)\s*[:|,-]?\s*/i, "")
      .replace(/\s+/g, " ").trim();
    if (clean && clean.length < 100 && /(?:developer|engineer|analyst|designer|manager|consultant|associate|intern|specialist|architect)/i.test(clean)) return clean;
  }
  return lines[0]?.slice(0, 120) ?? "";
}

function assumedSkillsForRole(jobTitle, level, sourceText) {
  const title = normalized(jobTitle);
  if (/full stack|fullstack/.test(title) && (/java/.test(title) || /\bjava\b/i.test(sourceText))) {
    return {
      required: ["Java", "OOP", "Data Structures & Algorithms", "SQL/RDBMS", "HTML", "CSS", "JavaScript", "REST APIs"],
      preferred: ["Spring Boot", "React", "Angular", "Git", "Hibernate/JPA", "Maven", "Microservices", "Agile"],
      assumptionSource: `Assumed from role: ${level} Java full-stack developer market requirements.`,
    };
  }
  if (/full stack|fullstack/.test(title)) {
    return {
      required: ["JavaScript", "HTML", "CSS", "REST APIs", "SQL", "Git"],
      preferred: ["React", "Node.js", "TypeScript", "Docker", "Agile"],
      assumptionSource: `Assumed from role: ${level} full-stack developer market requirements.`,
    };
  }
  if (/java|software developer|software engineer/.test(title)) {
    return {
      required: ["Java", "OOP", "Data Structures & Algorithms", "SQL", "REST APIs"],
      preferred: ["Spring Boot", "Git", "Maven", "Docker", "Agile"],
      assumptionSource: `Assumed from role: ${level} software developer market requirements.`,
    };
  }
  return {
    required: ["Communication", "Problem Solving", "Microsoft Office", "Teamwork", "Time Management"],
    preferred: ["Project Management", "Data Analysis", "Presentation Skills"],
    assumptionSource: `Assumed from role: ${level} ${jobTitle || "professional"} market requirements.`,
  };
}

function extractLabeledBlock(text, labelPattern) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(labelPattern);
    if (!match) continue;
    const block = [match[1] ?? ""];
    for (let next = index + 1; next < lines.length; next += 1) {
      if (JOB_SECTION_BOUNDARY.test(lines[next]) || MUST_LABEL.test(lines[next]) || NICE_LABEL.test(lines[next])) break;
      block.push(lines[next]);
    }
    blocks.push(block.join("\n"));
  }
  return blocks.join("\n");
}

function parseEducation(lines) {
  const entries = [];
  const degreePattern = /\b(?:bachelor|master|associate|b\.?\s?e\.?|b\.?\s?tech|b\.?\s?sc|m\.?\s?tech|m\.?\s?sc|diploma|high school|ph\.?d)\b/i;
  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const yearMatches = [...line.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => match[0]);
    const year = yearMatches.at(-1) ?? "";
    const cgpa = line.match(/\b(?:CGPA|GPA)\s*[:\-]?\s*[\d.]+(?:\s*\/\s*[\d.]+)?/i)?.[0] ?? "";
    const clean = line
      .replace(/\b(?:19|20)\d{2}\b/g, "")
      .replace(/\b(?:CGPA|GPA)\s*[:\-]?\s*[\d.]+(?:\s*\/\s*[\d.]+)?/ig, "")
      .replace(/^[\s|·,–-]+|[\s|·,–-]+$/g, "")
      .trim();
    const parts = clean.split(/\t+|\s*[|·]\s*/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      if (degreePattern.test(part) || !entries.length) {
        entries.push({ degree: part, institution: "", location: "", dates: year, cgpa, details: [] });
      } else {
        const current = entries.at(-1);
        if (!current.institution && !degreePattern.test(part)) current.institution = part;
        else if (part !== current.degree && part !== current.institution) current.details.push(part);
        if (year && !current.dates) current.dates = year;
        if (cgpa && !current.cgpa) current.cgpa = cgpa;
      }
    }
  }
  return entries.filter((entry) => entry.degree || entry.institution).map((entry) => ({
    ...entry,
    dates: entry.dates ? String(entry.dates).match(/\b(?:19|20)\d{2}\b/g).at(-1) : "",
    details: deduplicateItems(entry.details),
  }));
}

function parseExperience(lines) {
  return sectionEntries(lines).map(({ heading, bullets }) => {
    const chunks = heading.split(/\s*[|·]\s*/).map((part) => part.trim());
    const datesIndex = chunks.findIndex((part) => /\b(?:19|20)\d{2}\b/.test(part));
    return {
      title: chunks[0] ?? "",
      company: chunks.length > 2 ? chunks[1] : "",
      location: "",
      dates: datesIndex >= 0 ? chunks[datesIndex] : "",
      bullets: bullets.length ? bullets : [heading],
    };
  });
}

function parseProjects(lines) {
  const entries = [];
  let current = null;
  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const technologies = line.match(/^(?:technologies|tech(?:nology)? stack)\s*:\s*(.*)$/i);
    if (technologies) {
      if (current) current.technologies.push(...splitItems([technologies[1]]));
      continue;
    }
    const explicitBullet = /^\s*(?:[•*-]|\d+[.)])\s*/.test(rawLine);
    if (!explicitBullet && current && (/\b(19|20)\d{2}\b/.test(line) || line.length < 105)) {
      entries.push(current);
      current = { heading: line, bullets: [], technologies: [] };
    } else if (!current) {
      current = { heading: line, bullets: [], technologies: [] };
    } else {
      current.bullets.push(line);
    }
  }
  if (current) entries.push(current);
  return entries.map(({ heading, bullets, technologies }) => ({
    name: heading.split(/\s*[|·]\s*/)[0].replace(/\s+\b(?:19|20)\d{2}\b.*$/, "").trim(),
    description: "",
    bullets: deduplicateItems(bullets.flatMap((bullet) => bullet.split(/(?<=[.!?])\s+(?=[A-Z])/).flatMap(splitCompoundAction))).slice(0, 3),
    technologies: deduplicateItems([...technologies, ...detectSkills([heading, ...bullets].join(" "))]),
    dates: heading.match(/\b(?:19|20)\d{2}(?:\s*[-–]\s*(?:(?:19|20)\d{2}|present))?\b/i)?.[0] ?? "",
    link: "",
  })).filter((project) => project.name && !/^(?:technologies|tech(?:nology)? stack)\s*:/i.test(project.name));
}

function splitCompoundAction(text) {
  const match = text.match(/^(.+?)[,;]?\s+and\s+(track|build|create|develop|design|implement|manage|analyze|optimize|maintain|automate|test|integrate|deploy|deliver|support)\s+(.+)[.!?]?$/i);
  if (!match) return [text];
  const pastTense = {
    track: "Tracked", build: "Built", create: "Created", develop: "Developed", design: "Designed",
    implement: "Implemented", manage: "Managed", analyze: "Analyzed", optimize: "Optimized",
    maintain: "Maintained", automate: "Automated", test: "Tested", integrate: "Integrated",
    deploy: "Deployed", deliver: "Delivered", support: "Supported",
  };
  const first = `${match[1].replace(/[,\s]+$/, "")}.`;
  const second = `${pastTense[match[2].toLowerCase()]} ${match[3].replace(/[.!?]+$/, "")}.`;
  return [first, second];
}

function deduplicateItems(items) {
  const seen = new Set();
  return items.map((item) => String(item ?? "").trim()).filter((item) => {
    const key = normalized(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalizeSkillItems(items) {
  const aliases = new Map([
    ["js", "JavaScript"], ["postgres", "PostgreSQL"], ["node", "Node.js"],
    ["html", "HTML5"], ["html5", "HTML5"], ["css", "CSS3"], ["css3", "CSS3"],
    ["object oriented programming", "OOP"], ["data structures algorithms", "Data Structures & Algorithms"],
  ]);
  const canonical = deduplicateItems(items.map((item) => aliases.get(normalized(item)) ?? item));
  const combinedDsa = canonical.some((item) => normalized(item) === "data structures algorithms");
  const hasDsaParts = ["data structures", "algorithms"].every((part) => canonical.some((item) => normalized(item) === part));
  if (!combinedDsa && hasDsaParts) {
    const firstPart = canonical.findIndex((item) => ["data structures", "algorithms"].includes(normalized(item)));
    canonical.splice(firstPart, 0, "Data Structures & Algorithms");
  }
  return canonical.filter((item) => !(
    (combinedDsa || hasDsaParts) && ["data structures", "algorithms"].includes(normalized(item))
  ));
}

function parseExplicitSkillItems(lines) {
  const items = [];
  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    const content = line.includes(":") ? line.slice(line.indexOf(":") + 1) : line;
    items.push(...content.split(/[,;|•\t]+/).map((item) => item.trim()).filter(Boolean));
  }
  return deduplicateItems(items.filter((item) => !/^(?:skills?|languages?|databases?|web|tools?|soft skills?)$/i.test(item)));
}

export function groupSkills(items, jd) {
  const relevance = [...(jd?.required_skills ?? jd?.mustHaveSkills ?? []), ...(jd?.preferred_skills ?? jd?.niceToHaveSkills ?? []), ...(jd?.tools ?? [])];
  const aliases = new Map([
    ["html", "HTML5"], ["html5", "HTML5"], ["css", "CSS3"], ["css3", "CSS3"],
    ["oop", "OOP"], ["object oriented programming", "OOP"],
    ["data structures algorithms", "Data Structures & Algorithms"],
    ["data structures", "Data Structures"], ["algorithms", "Algorithms"],
    ["problem solving", "Problem Solving"], ["critical thinking", "Critical Thinking"],
    ["data visualization", "Data Visualization"],
  ]);
  const canonical = canonicalizeSkillItems(items.map((skill) => aliases.get(normalized(skill)) ?? skill));
  const hasCombinedDataStructuresAndAlgorithms = canonical.some((skill) => normalized(skill) === "data structures algorithms");
  const distinctSkills = canonical.filter((skill) => (
    !(hasCombinedDataStructuresAndAlgorithms && ["data structures", "algorithms"].includes(normalized(skill)))
  )).sort((left, right) => Number(relevance.some((term) => hasTerm(right, term))) - Number(relevance.some((term) => hasTerm(left, term))));
  const skills = { programmingLanguages: [], frontend: [], backendFrameworks: [], databases: [], tools: [], coreConcepts: [], softSkills: [] };
  for (const skill of distinctSkills) {
    const key = normalized(skill);
    const category = [...SOFT_SKILLS].some((candidate) => normalized(candidate) === key) ? "softSkills"
      : ["SQL"].includes(skill) || ["javascript", "java", "python", "typescript", "c++", "c#", "kotlin", "ruby"].includes(key) ? "programmingLanguages"
        : [...DATABASE_SKILLS].some((candidate) => normalized(candidate) === key) ? "databases"
          : [...TOOL_SKILLS].some((candidate) => normalized(candidate) === key) ? "tools"
            : [...WEB_SKILLS].some((candidate) => normalized(candidate) === key) || ["HTML5", "CSS3"].includes(skill) ? "frontend"
              : [...CORE_SKILLS].some((candidate) => normalized(candidate) === key) ? "coreConcepts"
                : ["Java", "Spring Boot", "Spring", "Hibernate", "JPA", "J2EE", "JDBC", "Microservices", ".NET", "Django", "Flask"].some((candidate) => normalized(candidate) === key) ? "backendFrameworks"
                  : "programmingLanguages";
    skills[category].push(skill);
  }
  return skills;
}

function extractHeader(lines) {
  const firstSection = lines.findIndex((line) => detectSection(line));
  const headerLines = firstSection < 0 ? lines.slice(0, 8) : lines.slice(0, firstSection);
  const headerText = headerLines.join("\n");
  const email = headerText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] ?? "";
  const phone = headerText.match(/(?:\+?\d[\d().\s-]{7,}\d)/)?.[0]?.trim() ?? "";
  const linkedin = headerText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|,)]+/i)?.[0] ?? "";
  const github = headerText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|,)]+/i)?.[0] ?? "";
  const excluded = /(?:eclipse|vs\s*code|visual studio|github\.com|linkedin\.com|@|https?:\/\/)/i;
  const locationPattern = /\b(?:[A-Z][a-z]+(?:[ -][A-Z][a-z]+)*,\s*(?:[A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)|Mumbai|Pune|Bengaluru|Bangalore|Chennai|Hyderabad|Delhi|Kolkata|Ahmedabad|Jaipur|Indore|Nagpur|Nashik|Thane|New York|San Francisco|Seattle|Austin|Chicago|Boston|Los Angeles|Portland|Denver|Toronto|Vancouver|London|Dublin|Singapore)\b/;
  const name = headerLines.map((line) => cleanLine(line).split(/[|\t•]/)[0].trim()).find((line) => line && line.length < 70
    && !/@|https?:\/\/|\d{7,}/.test(line)
    && !/^(?:resume|curriculum vitae|cv)$/i.test(line)
    && !/^(?:summary|skills|education|projects|experience|certifications?)$/i.test(line)) ?? "";
  const location = headerText.match(locationPattern)?.[0] ?? "";
  return { name, phone, email, linkedin, github, location,   portfolio: headerText.match(/https?:\/\/(?![^/\s]*(?:linkedin|github)\.com)[^\s|,)]+/i)?.[0] ?? "" };
}

export function parseResumeLocally(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const { sections } = getSectionLines(lines);
  const header = extractHeader(lines);
  const summaryLines = sections.summary;
  const allText = [text, ...Object.values(sections).flat()].join("\n");
  const projects = parseProjects(sections.projects);
  const explicitSkills = parseExplicitSkillItems(sections.skills);
  const projectSkills = projects.flatMap((project) => project.technologies);
  const skills = groupSkills([...explicitSkills, ...projectSkills, ...detectSkills(text)]);
  return {
    ...header,
    summary: summaryLines.map(cleanLine).filter(Boolean).join(" "),
    education: parseEducation(sections.education),
    skills,
    projects,
    experience: parseExperience(sections.experience),
    certifications: sectionEntries(sections.certifications).map(({ heading }) => ({ name: heading, issuer: "", date: "" })),
    achievements: sections.achievements,
    sections_present: Object.entries(sections).filter(([, content]) => content.length > 0).map(([section]) => section[0].toUpperCase() + section.slice(1)),
    formatting: { singleColumn: false, standardHeadings: true, noTables: false, noIcons: false, parseableContact: Boolean(header.name && (header.phone || header.email)) },
    _sourceText: allText,
  };
}

export function parseJobDescriptionLocally(text, options = {}) {
  const cleanedText = cleanJobDescription(text);
  const lines = cleanedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const role = options.roleTitle?.trim() || extractJobTitle(lines);
  const explicitMustArea = extractLabeledBlock(cleanedText, MUST_LABEL);
  const explicitNiceArea = extractLabeledBlock(cleanedText, NICE_LABEL);
  const niceArea = explicitNiceArea;
  const mustArea = explicitMustArea || cleanedText.split(/\r?\n/).filter((line) => !JOB_SECTION_BOUNDARY.test(line) && !NICE_LABEL.test(line)).join("\n");
  const knownMust = detectSkills(mustArea);
  const knownNice = detectSkills(niceArea);
  let mustHaveSkills = canonicalizeSkillItems([
    ...knownMust,
    ...(explicitMustArea ? extractRequirementPhrases(explicitMustArea, knownMust) : []),
  ]);
  let niceToHaveSkills = canonicalizeSkillItems([
    ...knownNice,
    ...(explicitNiceArea ? extractRequirementPhrases(explicitNiceArea, knownNice) : []),
  ]).filter((skill) => !mustHaveSkills.some((must) => normalized(must) === normalized(skill)));
  const tools = detectSkills(cleanedText).filter((skill) => /^(git|docker|kubernetes|aws|azure|gcp|excel|power bi|tableau|figma|terraform|jenkins|airflow|snowflake|dbt)$/i.test(skill));
  const softSkills = detectSkills(cleanedText).filter((skill) => /^(communication|leadership|collaboration|problem solving|customer service|project management)$/i.test(skill));
  const responsibilities = [];
  let readingResponsibilities = false;
  for (const line of lines) {
    const header = line.match(/^(?:[-•*]\s*)?(?:(?:key\s+)?responsibilities|what you(?:'|’)ll do|you will|role overview)\s*:?\s*(.*)$/i);
    if (header) {
      readingResponsibilities = true;
      const trailing = header[1]?.trim();
      if (trailing) responsibilities.push(cleanLine(trailing));
      continue;
    }
    if (readingResponsibilities && /^(?:required|must[- ]have|preferred|nice[- ]to[- ]have|qualifications?|what you(?:'|’)ll need|about (?:the )?(?:role|company)|location|benefits|apply here)\b/i.test(cleanLine(line))) {
      readingResponsibilities = false;
    }
    if (readingResponsibilities) responsibilities.push(cleanLine(line));
  }
  const qualifications = lines.filter((line) => /^(?:[-•*]\s*)?(?:required|must|qualification|bachelor|master|degree|experience with)/i.test(line)).map(cleanLine);
  const company = cleanedText.match(/\b(?:at|join|company:?)\s+([A-Z][\w&.-]*(?:[ \t]+[A-Z][\w&.-]*){0,3})/i)?.[1]
    ?.replace(/\s+(?:is hiring|is looking|for the role).*$/i, "") ?? "";
  const location = cleanedText.match(/\b(?:location:?\s*|based in\s+|in\s+)(Pune|Mumbai|Bengaluru|Bangalore|Chennai|Hyderabad|Delhi|Kolkata|Ahmedabad|Jaipur|Nagpur|Nashik|New York|San Francisco|London|Toronto)(?:,\s*[A-Z]{2,3})?/i)?.[1] ?? "";
  const experienceLevel = /\b(fresher|fresh graduate|entry[- ]level|intern)\b/i.test(cleanedText) ? "fresher"
    : /\b(senior|years? of experience|experienced)\b/i.test(cleanedText) ? "experienced"
      : options.experienceLevel === "fresher" || options.experienceLevel === "experienced" ? options.experienceLevel : "unspecified";
  const isThin = mustHaveSkills.length < 5;
  let assumptionSource = "";
  if (isThin) {
    const assumed = assumedSkillsForRole(role, experienceLevel, cleanedText);
    mustHaveSkills = assumed.required;
    niceToHaveSkills = assumed.preferred;
    assumptionSource = assumed.assumptionSource;
  }
  return {
    role, job_title: role, company, location, mustHaveSkills, niceToHaveSkills, tools, softSkills,
    required_skills: mustHaveSkills,
    preferred_skills: niceToHaveSkills,
    responsibilities,
    experience_level: experienceLevel,
    is_thin: isThin,
    assumption_source: assumptionSource,
    qualifications, keywords: [...new Set([...mustHaveSkills, ...niceToHaveSkills, ...tools, ...softSkills])],
  };
}

export function buildScoringExtraction(original, jd) {
  return {
    jd: {
      required_skills: jd.required_skills ?? jd.mustHaveSkills ?? [],
      preferred_skills: jd.preferred_skills ?? jd.niceToHaveSkills ?? [],
      tools: jd.tools ?? [],
      responsibilities: jd.responsibilities ?? [],
      experience_level: jd.experience_level ?? "unspecified",
      job_title: jd.job_title ?? jd.role ?? "",
      keywords: jd.keywords ?? [],
    },
    resume: {
      skills: Object.entries(original.skills ?? {}).filter(([category]) => category !== "tools").flatMap(([, items]) => Array.isArray(items) ? items : []),
      tools: [...(original.skills?.tools ?? []), ...(original.tools ?? [])],
      projects: (original.projects ?? []).map((project) => ({
        title: project.title ?? project.name ?? "",
        technologies: project.technologies ?? [],
        summary: project.summary ?? project.description ?? [...(project.bullets ?? [])].join(" "),
      })),
      project_technologies: [...new Set((original.projects ?? []).flatMap((project) => project.technologies ?? []))],
      education: original.education ?? [],
      certifications: (original.certifications ?? []).map((certification) => typeof certification === "string" ? certification : certification.name).filter(Boolean),
      sections_present: original.sections_present ?? [],
    },
  };
}

function resumeCorpus(resume) {
  return [
    resume._sourceText,
    resume.summary,
    ...Object.values(resume.skills ?? {}).flatMap((items) => Array.isArray(items) ? items : []),
    ...(resume.projects ?? []).flatMap((project) => [project.name, project.description, ...(project.bullets ?? []), ...(project.technologies ?? [])]),
    ...(resume.experience ?? []).flatMap((experience) => [experience.title, experience.company, ...(experience.bullets ?? [])]),
  ].filter(Boolean).join(" ");
}

function suggestionsFor(original, jd) {
  const gaps = scoreResume(original, jd, { original }).missingKeywords;
  const missingSkills = gaps.map((gap) => ({
    skill: gap.keyword,
    reason: gap.whyNotAdded,
    priority: gap.priority,
    status: gap.status,
    recommendation: gap.recommendation,
    miniProjectIdea: gap.miniProjectIdea,
  }));
  const addToResume = missingSkills.filter((item) => item.recommendation === "Add to resume");
  const learnItems = missingSkills.filter((item) => item.recommendation === "Learn / build this");
  const isJavaFullStack = /full.?stack/.test(normalized(jd.job_title ?? jd.role)) && /\bjava\b/i.test(normalized(jd.job_title ?? jd.role));
  const bankingProject = (original.projects ?? []).find((project) => /banking management system/i.test(project.name));
  const ideas = isJavaFullStack && learnItems.some((item) => /spring boot/i.test(item.skill))
    ? [{
      title: "Spring Boot, REST APIs: convert the Banking Management System into REST endpoints",
      techStack: ["Java", "Spring Boot", "REST APIs"],
      features: [`Add REST endpoints to ${bankingProject?.name ?? "a Java project"}`, "Test and document only the endpoints you implement"],
      resumeAngle: "After implementation, add a source-backed bullet describing the actual endpoints and Spring Boot work.",
    }]
    : learnItems.slice(0, 3).map((item) => ({
      title: `Practice project: ${item.skill} applied to a role-relevant problem`,
      techStack: [item.skill, ...(jd.tools ?? []).slice(0, 2)],
      features: (jd.responsibilities ?? []).slice(0, 2).length ? (jd.responsibilities ?? []).slice(0, 2) : [`Build a small, end-to-end example using ${item.skill}`, "Document decisions, testing, and limitations"],
      resumeAngle: item.miniProjectIdea,
    }));
  const sampleQuestions = (original.projects ?? []).flatMap((project) => {
    const name = project.name ?? project.title ?? "this project";
    const technologies = deduplicateItems(project.technologies ?? []).slice(0, 4);
    const bullets = deduplicateItems(project.bullets ?? []);
    return [
      `Walk me through ${name}. What did it do, and what part did you personally build?`,
      ...(technologies.length ? [`How did you use ${technologies.join(", ")} in ${name}?`] : []),
      ...(bullets[0] ? [`Your resume says, "${bullets[0]}". How did you approach that work?`] : []),
    ];
  }).slice(0, 8);
  return {
    missingSkills,
    addToResume,
    learnBuild: learnItems,
    projectIdeas: ideas,
    courses: learnItems.slice(0, 3).map(({ skill }) => ({ name: `${skill}: official documentation and beginner learning path`, reason: `Build the missing ${skill} foundation through vendor documentation or a free introductory course.` })),
    interviewTopics: [...new Set([...(jd.mustHaveSkills ?? []).slice(0, 4), ...(jd.responsibilities ?? []).slice(0, 3)])],
    sampleQuestions,
    topChanges: missingSkills.slice(0, 3).map((item) => item.recommendation === "Add to resume"
      ? `Verify source evidence for ${item.skill}, then add the term to the relevant section.`
      : `Learn and build ${item.skill}; it is required for the role but unsupported by current resume evidence.`),
    weakWording: [...(original.projects ?? []).flatMap((project) => project.bullets ?? []), ...(original.experience ?? []).flatMap((item) => item.bullets ?? [])]
      .filter((bullet) => /\b(responsible for|worked on|helped|assisted|various|several)\b/i.test(bullet))
      .slice(0, 5)
      .map((bullet) => `Confirm this wording and consider replacing it with a precise description of your own contribution: “${bullet}”`),
    warnings: [
      ...(!original.linkedin ? ["No LinkedIn URL was detected in the original resume."] : []),
      ...(!original.github ? ["No GitHub URL was detected in the original resume."] : []),
      ...(!original.phone && !original.email ? ["No phone number or email was detected; check contact details before exporting."] : []),
      ...(!(original.experience?.length || original.projects?.length) ? ["No clearly labeled experience or project section was detected; review the parsed resume and add source-backed details."] : []),
    ],
  };
}

export function generateResumeLocally(original, jd, options) {
  const sourceSkills = Object.values(original.skills ?? {}).flatMap((items) => Array.isArray(items) ? items : []);
  const skills = groupSkills(sourceSkills, jd);
  const relevantTerms = [...(jd.required_skills ?? jd.mustHaveSkills ?? []), ...(jd.preferred_skills ?? jd.niceToHaveSkills ?? []), ...(jd.tools ?? [])];
  const phraseScore = (text) => relevantTerms.reduce((count, term) => count + Number(hasTerm(text, term)), 0);
  const educationText = original.education?.map((item) => item.degree ?? "").find(Boolean) ?? "";
  const discipline = (educationText.match(/\bin\s+(.+)$/i)?.[1] ?? educationText.match(/\bof\s+(.+)$/i)?.[1]
    ?? educationText.replace(/^(?:(?:bachelor|master|doctor|associate)(?:\s+of\s+\w+)?|b\.?\s?(?:e|tech|sc|s|com)|m\.?\s?(?:e|tech|sc|s|com))\.?\s*/i, ""))
    .replace(/\s*\([^)]*\)/g, "").trim();
  const areaLabels = [];
  for (const project of original.projects ?? []) {
    const technologies = (project.technologies ?? []).join(" ").toLowerCase();
    if (/\bjava\b/.test(technologies) && !areaLabels.includes("Java application development")) areaLabels.push("Java application development");
    if (/\b(html|html5|css|css3|javascript)\b/.test(technologies) && !areaLabels.includes("web development")) areaLabels.push("web development");
    if (/\b(tableau|data visualization)\b/.test(technologies) && !areaLabels.includes("data visualization")) areaLabels.push("data visualization");
  }
  if (!areaLabels.length && original.projects?.length) areaLabels.push("software development");
  const formatList = (items) => items.length < 2 ? (items[0] ?? "")
    : items.length === 2 ? `${items[0]} and ${items[1]}`
      : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
  const areas = formatList(areaLabels.slice(0, 3));
  const skillPhrase = formatList(sourceSkills.slice(0, 5));
  const projectSummary = original.projects?.length ? "academic projects" : "documented work";
  const summaryOpening = `${discipline ? `${discipline} background` : "Technology background"} with hands-on project experience${areas ? ` in ${areas}` : ""}.`;
  const summaryDetail = skillPhrase
    ? `Applied ${skillPhrase} across ${projectSummary}.`
    : `Brings practical experience across ${projectSummary}.`;
  const tailoredSummary = [summaryOpening, summaryDetail].join(" ");
  let projects = (original.projects ?? []).map((project) => ({
    ...project,
    bullets: [...(project.bullets ?? [])].map((text, index) => ({ text, index, score: phraseScore(text) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 3).map(({ text }) => text),
  })).sort((left, right) => phraseScore([right.name, ...(right.bullets ?? []), ...(right.technologies ?? [])].join(" "))
    - phraseScore([left.name, ...(left.bullets ?? []), ...(left.technologies ?? [])].join(" ")));
  if (/full.?stack/.test(normalized(jd.job_title ?? jd.role))) {
    const priority = ["Banking Management System", "Student Management System", "Responsive E-Commerce Web Application", "Sales Dashboard"];
    const rank = (project) => {
      const index = priority.findIndex((name) => normalized(project.name) === normalized(name));
      return index < 0 ? priority.length : index;
    };
    projects = [...projects].sort((left, right) => rank(left) - rank(right));
  }
  let resume = {
    ...original,
    summary: tailoredSummary,
    skills,
    projects,
    sections_present: [
      ...(tailoredSummary ? ["Summary"] : []),
      ...(Object.values(skills).some((items) => items.length) ? ["Skills"] : []),
      ...(projects.length ? ["Projects"] : []),
      ...(original.education?.length ? ["Education"] : []),
      ...(original.certifications?.length ? ["Certifications"] : []),
    ],
    formatting: { singleColumn: true, standardHeadings: true, noTables: true, noIcons: true, parseableContact: Boolean(original.name && (original.email || original.phone)) },
  };
  delete resume._sourceText;
  const scoreOptions = { ...options, original };
  let score = scoreResume(resume, jd, scoreOptions);
  const optimizationPasses = 0;
  return {
    original: Object.fromEntries(Object.entries(original).filter(([key]) => key !== "_sourceText")),
    resume,
    jd,
    suggestions: suggestionsFor(original, jd),
    extraction: buildScoringExtraction(original, jd),
    scores: { before: scoreResume(original, jd, scoreOptions), after: score },
    optimizationPasses,
    qualityNotes: ["Free local mode uses conservative text heuristics instead of a paid AI API. Review section parsing and every suggested edit before exporting."],
    mode: "local",
  };
}

export function regenerateLocally(section, original, currentResume, projectIndex = 0) {
  if (section === "summary") return currentResume.summary || original.summary || "";
  if (section === "skills") return currentResume.skills;
  if (section === "project") return currentResume.projects?.[projectIndex] ?? null;
  return null;
}

export function validateLocalResume(resume, jd, options = {}) {
  return scoreResume(resume, jd, options);
}
