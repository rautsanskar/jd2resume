import test from "node:test";
import assert from "node:assert/strict";
import { scoreResume } from "./scoring.js";
import { createDocx, createPdf, resumeLines } from "./export.js";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { Document, Packer, Paragraph } from "docx";
import mammoth from "mammoth";
import { extractResumeText } from "./parse.js";

const sampleResume = {
  name: "Alex Rivera",
  summary: "Software developer with experience building REST APIs.",
  skills: { technical: ["JavaScript", "REST APIs"], tools: ["Git"], soft: ["Collaboration"] },
  experience: [{ title: "Developer", company: "Northstar", dates: "2022–2024", bullets: ["Built REST APIs with JavaScript for internal tools."] }],
  projects: [{ name: "Task Board", technologies: ["React"], bullets: ["Created a task board using React."] }],
  education: [{ degree: "BSc Computer Science", institution: "City University", dates: "2022" }],
  certifications: [],
};

test("scores keyword categories and exposes missing keywords", () => {
  const result = scoreResume(sampleResume, {
    mustHaveSkills: ["JavaScript", "Python"],
    niceToHaveSkills: ["React"],
    tools: ["Git", "Docker"],
  });

  assert.equal(result.components.required, 25);
  assert.equal(result.components.preferred, 13.3);
  assert.deepEqual(result.matchedKeywords, ["JavaScript", "React", "Git"]);
  assert.deepEqual(result.missingKeywords.map((item) => item.keyword), ["Python", "Docker"]);
  assert.equal(result.weights.required, 50);
  assert.equal(result.weights.preferred, 20);
  assert.equal(result.weights.completeness, 15);
  assert.equal(result.weights.formatting, 10);
  assert.equal(result.weights.summaryKeywords, 5);
  assert.ok(result.total >= 0 && result.total <= 100);
});

test("does not award keyword points when a JD keyword category is empty", () => {
  const result = scoreResume(sampleResume, { mustHaveSkills: [], niceToHaveSkills: [], tools: [] });
  assert.equal(result.components.required, 0);
  assert.equal(result.components.preferred, 0);
  assert.equal(result.weights.required, 0);
  assert.equal(result.weights.preferred, 0);
  assert.equal(Object.values(result.weights).reduce((sum, weight) => sum + weight, 0), 100);
  assert.equal(result.breakdown.some((row) => row.category === "Required skills"), false);
  assert.equal(result.formatting.singleColumn, true);
});

test("normalizes the requested skill synonyms and matches project text", () => {
  const resume = {
    ...sampleResume,
    summary: "JavaScript developer.",
    skills: { languages: ["JavaScript"], databases: ["PostgreSQL"], web: [], tools: [], soft: [] },
    projects: [{ title: "Service", technologies: ["SpringBoot"], bullets: ["Implemented RESTful services."] }],
  };
  const score = scoreResume(resume, {
    required_skills: ["JS", "Spring Boot", "REST APIs", "Postgres"],
    preferred_skills: [],
    tools: [],
    keywords: ["JS"],
  });

  assert.deepEqual(score.requiredMatch.items.filter((item) => item.status === "FOUND").map((item) => item.keyword), ["JS", "Spring Boot", "REST APIs", "Postgres"]);
  assert.equal(score.components.required, 62.5);
  assert.equal(score.components.summaryKeywords, 6.3);
});

test("scores FOUND, PARTIAL, and MISSING deterministically with the requested weights", () => {
  const resume = {
    name: "Taylor",
    summary: "Java developer.",
    skills: { programmingLanguages: ["Java", "Spring"], databases: ["MySQL"], frontend: [], backendFrameworks: [], tools: ["Docker"], coreConcepts: [], softSkills: [] },
    projects: [{ title: "API", technologies: ["Java"], bullets: ["Built a REST API."] }],
    education: [{ degree: "BSc", institution: "City University" }],
    certifications: [{ name: "Java Basics" }],
    sections_present: ["Summary", "Skills", "Projects", "Education", "Certifications"],
    formatting: { singleColumn: true, standardHeadings: true, noTables: true, noIcons: true, parseableContact: true },
  };
  const jd = {
    required_skills: ["Java", "Spring Boot", "React"],
    preferred_skills: ["Docker", "AWS"],
    tools: [],
    keywords: ["Java", "Spring Boot"],
  };
  const score = scoreResume(resume, jd, { original: resume });

  assert.equal(score.components.required, 25);
  assert.equal(score.components.preferred, 10);
  assert.equal(score.components.completeness, 15);
  assert.equal(score.components.formatting, 10);
  assert.equal(score.components.summaryKeywords, 2.5);
  assert.equal(score.rawTotal, 62.5);
  assert.equal(score.total, 63);
  assert.deepEqual(score.requiredMatch.items.map((item) => item.status), ["FOUND", "PARTIAL", "MISSING"]);
  assert.equal(score.missingKeywords.find((item) => item.keyword === "React").recommendation, "Learn / build this");
  assert.match(score.missingKeywords.find((item) => item.keyword === "React").miniProjectIdea, /React/);
  assert.equal(score.missingKeywords.find((item) => item.keyword === "AWS").recommendation, "Learn / build this");
});

test("suggests adding a missing term only when the original source text supports it", () => {
  const score = scoreResume({
    summary: "Developer",
    skills: { languages: ["Java"], tools: [] },
    projects: [],
    education: [],
    certifications: [],
    _sourceText: "Skills mentioned in source: Java and React.",
  }, { required_skills: ["React"], preferred_skills: [], tools: [] });

  assert.equal(score.missingKeywords[0].recommendation, "Add to resume");
});

test("uses source formatting metadata and renormalizes active score weights", () => {
  const report = scoreResume({
    summary: "Java developer",
    skills: { programmingLanguages: ["Java"] },
    projects: [{ title: "App", bullets: ["Built an app."] }],
    education: [{ degree: "BSc" }],
    certifications: [{ name: "Java" }],
    sections_present: ["Summary", "Skills", "Projects", "Education", "Certifications"],
    formatting: { singleColumn: false, standardHeadings: true, noTables: false, noIcons: false, parseableContact: false },
  }, { required_skills: [], preferred_skills: [], tools: [], keywords: [] });
  assert.equal(report.components.formatting, 8);
  assert.equal(report.formatting.singleColumn, false);
  assert.match(report.breakdown.find((row) => row.category === "ATS formatting").reason, /singleColumn/);
  assert.match(report.breakdown.find((row) => row.category === "ATS formatting").reason, /noTables/);
});

test("creates a PDF with selectable text content", async () => {
  const buffer = await createPdf(sampleResume);
  const parsed = await pdf(buffer);
  assert.match(parsed.text, /Alex Rivera/);
  assert.match(parsed.text, /REST APIs/);
  assert.match(parsed.text, /Northstar/);
});

test("keeps PDF project headings, bullets, and technologies separated in order", async () => {
  const buffer = await createPdf({
    name: "Alex Rivera",
    projects: [
      { name: "Project One", bullets: ["Built the first project using Java."], technologies: ["Java"] },
      { name: "Project Two", bullets: ["Designed the second project using SQL."], technologies: ["SQL"] },
      { name: "Project Three", bullets: ["Created the third project using Tableau."], technologies: ["Tableau"] },
    ],
  });
  const { text } = await pdf(buffer);
  const first = text.indexOf("Project One");
  const second = text.indexOf("Project Two");
  const third = text.indexOf("Project Three");

  assert.ok(first >= 0 && first < second && second < third);
  assert.ok(text.indexOf("Built the first project using Java.") < second);
  assert.ok(text.indexOf("Designed the second project using SQL.") < third);
  assert.match(text, /Technologies: Java/);
  assert.match(text, /Technologies: SQL/);
  assert.match(text, /Technologies: Tableau/);
});

test("creates a DOCX that can be reopened and parsed", async () => {
  const buffer = await createDocx({
    ...sampleResume,
    projects: [
      { name: "Project One", bullets: ["Built the first project using Java."], technologies: ["Java"] },
      { name: "Project Two", bullets: ["Designed the second project using SQL."], technologies: ["SQL"] },
    ],
  });
  const { value } = await mammoth.extractRawText({ buffer });

  assert.match(value, /Alex Rivera/);
  assert.ok(value.indexOf("Project One") < value.indexOf("Project Two"));
  assert.match(value, /Built the first project using Java/);
  assert.match(value, /Designed the second project using SQL/);
});

test("resume render model keeps one technology line per project and two education rows", () => {
  const lines = resumeLines({
    name: "Jordan",
    skills: { programmingLanguages: ["Java"], frontend: ["HTML5"], backendFrameworks: ["JDBC"], databases: ["MySQL"], tools: ["Docker"], coreConcepts: ["OOP"], softSkills: ["Teamwork"] },
    projects: [
      { name: "Portal", bullets: ["Built portal."], technologies: ["Java", "MySQL", "MySQL"] },
      { name: "Dashboard", bullets: ["Created dashboard."], technologies: [] },
    ],
    education: [{ degree: "B.E. Computer Engineering | 2025 | 2026", institution: "City Institute", year: "2025 | 2026", cgpa: "CGPA: 7.7" }],
    certifications: [{ name: "Java Certificate" }],
  });
  assert.equal(lines.filter((line) => line.kind === "technologies").length, 1);
  assert.deepEqual(lines.filter((line) => line.kind === "technologies").map((line) => line.text), ["Java, MySQL"]);
  assert.equal(lines.filter((line) => line.kind === "educationDegree").length, 1);
  assert.equal(lines.filter((line) => line.kind === "educationInstitute").length, 1);
  assert.equal(lines.find((line) => line.kind === "educationDegree").right, "2026");
  assert.equal(lines.find((line) => line.kind === "educationInstitute").right, "CGPA: 7.7");
  assert.ok(lines.some((line) => line.kind === "heading" && line.text === "Certifications"));
});

test("extracts text from an uploaded DOCX buffer", async () => {
  const document = new Document({ sections: [{ children: [new Paragraph("Jordan Rivera"), new Paragraph("JavaScript and React")] }] });
  const buffer = await Packer.toBuffer(document);
  const text = await extractResumeText({
    buffer,
    originalname: "resume.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assert.match(text, /Jordan Rivera/);
  assert.match(text, /JavaScript and React/);
});
