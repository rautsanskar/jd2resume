import test from "node:test";
import assert from "node:assert/strict";
import { generateResumeLocally, groupSkills, parseJobDescriptionLocally, parseResumeLocally, regenerateLocally } from "./local.js";

test("built-in parser extracts explicit resume facts without inventing skills", () => {
  const resume = parseResumeLocally(`Maya Chen
maya@example.com
Austin, TX
Education
BSc Computer Science | Hillcrest University | 2025
Skills
JavaScript, React, Git
Projects
Campus Events
- Built a React app that lists events from a JSON file.
- Added category filters.`);

  assert.equal(resume.name, "Maya Chen");
  assert.equal(resume.email, "maya@example.com");
  assert.deepEqual(resume.skills.programmingLanguages, ["JavaScript"]);
  assert.deepEqual(resume.skills.frontend, ["React"]);
  assert.equal(resume.projects[0].name, "Campus Events");
  assert.match(resume.projects[0].bullets[0], /JSON file/);
  assert.ok(!Object.hasOwn(generateResumeLocally(resume, { mustHaveSkills: [], niceToHaveSkills: [], tools: [] }, {}).resume, "_sourceText"));
  assert.ok(!Object.values(resume.skills).flat().includes("Python"));
});

test("free resume tailoring keeps skills truthful and returns separate gap suggestions", () => {
  const original = parseResumeLocally(`Maya Chen
maya@example.com
Skills
JavaScript, React
Projects
Campus Events
- Built a React app.`);
  const jd = parseJobDescriptionLocally(`Junior Frontend Developer
Required: React, TypeScript, HTML, CSS, JavaScript, Node.js
Preferred: REST APIs`);
  const result = generateResumeLocally(original, jd, { experienceLevel: "fresher" });

  assert.ok(result.resume.skills.frontend.includes("React"));
  assert.ok(!Object.values(result.resume.skills).flat().includes("TypeScript"));
  assert.ok(result.suggestions.missingSkills.some((skill) => skill.skill === "TypeScript"));
  assert.equal(result.mode, "local");
  assert.equal(regenerateLocally("project", original, result.resume, 0).name, "Campus Events");
});

test("preserves grouped skills, clean contact fields, one education year, and one project technologies line", () => {
  const original = parseResumeLocally(`Sanskar Raut
555-123-4567 | sanskar@example.com | https://linkedin.com/in/sanskar | https://github.com/sanskar | Austin, TX
Skills
Java, HTML, CSS, DBMS, MySQL, Tableau, Eclipse, VS Code, Docker
Projects
Student Portal
- Built a portal with HTML, CSS and MySQL.
Technologies: HTML, CSS, MySQL, Docker
Technologies: HTML, CSS, MySQL, Docker
Education
B.Tech Computer Science | State University | 2025 | 2026 | CGPA: 8.2`);
  const result = generateResumeLocally(original, { required_skills: ["Java", "React"], preferred_skills: [], tools: [] }, {});
  const allSkills = Object.values(result.resume.skills).flat();

  for (const skill of ["Java", "HTML5", "CSS3", "DBMS", "MySQL", "Tableau", "Eclipse", "VS Code", "Docker"]) {
    assert.ok(allSkills.includes(skill), `Expected source skill ${skill} to be retained.`);
  }
  assert.equal(original.name, "Sanskar Raut");
  assert.equal(original.phone, "555-123-4567");
  assert.equal(original.email, "sanskar@example.com");
  assert.equal(original.linkedin, "https://linkedin.com/in/sanskar");
  assert.equal(original.github, "https://github.com/sanskar");
  assert.equal(original.location, "Austin, TX");
  assert.equal(allSkills.filter((skill) => /^(?:HTML5|CSS3)$/i.test(skill)).length, 2);
  assert.equal(original.projects.length, 1);
  assert.deepEqual(original.projects[0].technologies, ["HTML", "CSS", "MySQL", "Docker"]);
  assert.equal(original.education[0].dates, "2026");
});

test("finds a location on a symbol-separated contact line without leaking skills into contact fields", () => {
  const resume = parseResumeLocally(`Jamie Rao
555-987-6543 ⋄ Pune, Maharashtra ⋄ jamie@example.com ⋄ LinkedIn
Objective
Software graduate with Java and MySQL skills.
Skills
Java, MySQL, Eclipse, VS Code`);

  assert.equal(resume.location, "Pune, Maharashtra");
  assert.equal(resume.phone, "555-987-6543");
  assert.equal(resume.email, "jamie@example.com");
  assert.equal(resume.linkedin, "");
  assert.ok(!resume.location.includes("Eclipse"));
  assert.ok(!resume.location.includes("VS Code"));
});

test("splits an explicitly compound project fact into two source-grounded bullets", () => {
  const resume = parseResumeLocally(`Projects
Sales Dashboard
- Created an interactive dashboard to monitor key performance indicators and track business performance through filters and visual summaries.
Technologies: SQL, Tableau`);

  assert.deepEqual(resume.projects[0].bullets, [
    "Created an interactive dashboard to monitor key performance indicators.",
    "Tracked business performance through filters and visual summaries.",
  ]);
});

test("scores different role-specific requirements instead of treating unknown skills as a perfect match", () => {
  const original = parseResumeLocally(`Jordan Lee
jordan@example.com
Skills
React, JavaScript
Projects
Website
- Built a React website.`);
  const frontendJd = parseJobDescriptionLocally(`Frontend Engineer
Must have: React, JavaScript, HTML, CSS, TypeScript`);
  const marketingJd = parseJobDescriptionLocally(`SEO Specialist
Must have: search engine optimization, keyword research, SEO analytics, content optimization, web analytics`);
  const frontendResult = generateResumeLocally(original, frontendJd, {});
  const marketingResult = generateResumeLocally(original, marketingJd, {});

  assert.deepEqual(frontendJd.mustHaveSkills, ["JavaScript", "TypeScript", "React", "HTML5", "CSS3"]);
  assert.deepEqual(marketingJd.mustHaveSkills, ["search engine optimization", "keyword research", "SEO analytics", "content optimization", "web analytics"]);
  assert.ok(frontendResult.scores.after.total > marketingResult.scores.after.total);
  assert.equal(frontendResult.scores.after.matchedKeywords.length, 2);
  assert.equal(marketingResult.scores.after.matchedKeywords.length, 0);
  assert.equal(marketingResult.scores.after.missingKeywords.length, 5);
});

test("does not turn job-description prose into dozens of must-have keywords", () => {
  const jd = parseJobDescriptionLocally(`Java Full Stack Developer
Exciting opportunity for students to work on scalable applications.
Responsibilities:
- Build features with Java and Spring Boot.
- Work with frontend and backend teams.
Required Skills: Java, Spring Boot, Hibernate, React, JavaScript, REST APIs, MySQL
Preferred Skills: AWS, Docker
`);

  assert.deepEqual(jd.mustHaveSkills, ["JavaScript", "Java", "React", "Spring Boot", "Hibernate", "MySQL", "REST APIs"]);
  assert.deepEqual(jd.niceToHaveSkills, ["AWS", "Docker"]);
  assert.ok(jd.mustHaveSkills.length < 10);
});

test("ignores email signatures, company marketing, and eligibility metadata as required skills", () => {
  const jd = parseJobDescriptionLocally(`✨ Exciting Fresher Opportunity: Associate, Full Stack Developer at BlackRock
Greetings from the placement team.
Our clients are saving for retirement and buying homes.
Here's what you need to know:
Company: BlackRock
Position: Associate
Experience: Fresher
Eligibility:
Computer Science or related Technical disciplines.
Responsibilities:
Build full-stack applications with Java, Spring Boot, and React.
Skills Required: Java, Spring Boot, React, JavaScript, SQL, HTML, CSS
Location: Mumbai
Apply Here: https://example.com/job`);

  assert.ok(jd.mustHaveSkills.length <= 8);
  assert.ok(jd.mustHaveSkills.includes("Java"));
  assert.ok(jd.mustHaveSkills.includes("Spring Boot"));
  assert.ok(!jd.mustHaveSkills.some((skill) => /BlackRock|retirement|Greetings|Mumbai|placement team/i.test(skill)));
});

test("uses role-level assumptions for a thin JD and exposes clean metadata", () => {
  const jd = parseJobDescriptionLocally(`✨ Exciting Opportunity: Associate, Full Stack Developer (Java) at BlackRock
Fresher role based in Mumbai. Apply now via WhatsApp.`);

  assert.equal(jd.is_thin, true);
  assert.equal(jd.company, "BlackRock");
  assert.equal(jd.job_title, "Associate, Full Stack Developer (Java)");
  assert.equal(jd.experience_level, "fresher");
  assert.equal(jd.location, "Mumbai");
  assert.ok(jd.required_skills.length >= 5);
  assert.match(jd.assumption_source, /Assumed from role/);
  assert.ok(jd.required_skills.includes("Java"));
  assert.ok(jd.preferred_skills.includes("Spring Boot"));
});

test("orders Java full-stack projects by the requested relevance priority", () => {
  const original = {
    name: "Alex",
    summary: "",
    skills: { programmingLanguages: ["Java"] },
    projects: ["Sales Dashboard", "Responsive E-Commerce Web Application", "Student Management System", "Banking Management System"]
      .map((name) => ({ name, bullets: ["Built the project with Java."], technologies: ["Java"] })),
    education: [],
    certifications: [],
  };
  const result = generateResumeLocally(original, {
    role: "Associate, Full Stack Developer",
    job_title: "Associate, Full Stack Developer",
    experience_level: "fresher",
    required_skills: ["Java"],
    preferred_skills: [],
    keywords: ["Java"],
  }, {});
  assert.deepEqual(result.resume.projects.map((project) => project.name), [
    "Banking Management System",
    "Student Management System",
    "Responsive E-Commerce Web Application",
    "Sales Dashboard",
  ]);
});

test("suggests interview questions using each project's source details", () => {
  const original = parseResumeLocally(`Summary
Computer science graduate.
Skills
Java, MySQL
Projects
Student Portal
- Built a portal with Java and MySQL.
Technologies: Java, MySQL`);
  const result = generateResumeLocally(original, {
    job_title: "Java Full Stack Developer",
    required_skills: ["Java", "Spring Boot"],
    preferred_skills: [],
    keywords: ["Java"],
  }, {});

  assert.ok(result.suggestions.sampleQuestions.some((question) => question.includes("Student Portal")));
  assert.ok(result.suggestions.sampleQuestions.some((question) => question.includes("Java, MySQL")));
  assert.ok(result.suggestions.projectIdeas.length > 0);
});

test("emits the requested extraction schema and uses a role-specific truthful summary", () => {
  const original = parseResumeLocally(`Maya Chen
maya@example.com
Summary
Computer science graduate.
Skills
Java, MySQL
Projects
Student Portal
- Built a portal with Java and MySQL.
Education
BSc Computer Science | City University | 2025
Certifications
Java Basics`);
  const jd = parseJobDescriptionLocally(`Junior Java Developer
Required Skills: Java, MySQL`);
  const result = generateResumeLocally(original, jd, {});
  assert.equal(result.extraction.jd.job_title, "Junior Java Developer");
  assert.ok(Array.isArray(result.extraction.resume.project_technologies));
  assert.ok(result.extraction.resume.sections_present.includes("Skills"));
  assert.match(result.resume.summary, /Computer Science background with hands-on project experience/);
  assert.doesNotMatch(result.resume.summary, /Junior Java Developer|Required Skills|job description/i);
  assert.match(result.resume.summary, /Java and MySQL/);
  assert.equal(result.resume.formatting.noIcons, true);
});

test("deduplicates aliases and overlapping combined skills without dropping distinct tools", () => {
  const skills = groupSkills(["HTML5", "HTML", "CSS3", "CSS", "OOP", "Object-Oriented Programming", "Data Structures & Algorithms", "Data Structures", "Algorithms", "Docker"]);
  const all = Object.values(skills).flat();
  assert.ok(all.includes("HTML5"));
  assert.ok(all.includes("CSS3"));
  assert.ok(all.includes("OOP"));
  assert.ok(all.includes("Data Structures & Algorithms"));
  assert.ok(all.includes("Docker"));
  assert.ok(!all.includes("HTML"));
  assert.ok(!all.includes("CSS"));
  assert.ok(!all.includes("Object-Oriented Programming"));
  assert.ok(!all.includes("Data Structures"));
  assert.ok(!all.includes("Algorithms"));

  const separateDsa = Object.values(groupSkills(["Data Structures", "Algorithms"])).flat();
  assert.deepEqual(separateDsa, ["Data Structures & Algorithms"]);

  const jd = parseJobDescriptionLocally(`Java Full Stack Developer
Required Skills: Java, Data Structures, Algorithms, SQL, HTML, CSS, JavaScript, REST APIs`);
  assert.ok(jd.required_skills.includes("Data Structures & Algorithms"));
  assert.ok(!jd.required_skills.includes("Data Structures"));
  assert.ok(!jd.required_skills.includes("Algorithms"));
});
