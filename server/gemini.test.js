import test from "node:test";
import assert from "node:assert/strict";
import { generateResumeWithGemini } from "./gemini.js";
import { parseJobDescriptionLocally, parseResumeLocally } from "./local.js";

test("Gemini uses separate schema-constrained JD and resume extraction requests; score remains local", async () => {
  const original = parseResumeLocally(`Alex Rivera
alex@example.com
Skills
Java, React
Projects
Web App
- Built a React app with Java.
Technologies: React, Java`);
  const jdText = "Full Stack Java Developer\nRequired Skills: Java, Spring Boot, Hibernate, JavaScript, MySQL\nPreferred Skills: Docker";
  const jd = parseJobDescriptionLocally(jdText);
  const requests = [];
  const modelResponses = [
    {
      required_skills: ["Java", "Spring Boot", "Hibernate", "JavaScript", "MySQL"],
      preferred_skills: ["Docker"],
      tools: [],
      responsibilities: ["Build services"],
      experience_level: "experienced",
      keywords: ["Java", "Spring Boot", "Hibernate", "JavaScript", "MySQL", "Docker"],
    },
    {
      skills: ["Java", "React", "Kotlin"],
      tools: ["Docker"],
      projects: [{ title: "Web App", technologies: ["React", "Java"], summary: "Built a React app with Java." }],
      education: [],
      certifications: [],
    },
    {
      name: "Invented Name",
      contact: { phone: "", email: "", linkedin: "", github: "", location: "" },
      summary: "Invented experience and metrics.",
      skills: { languages: [], databases: [], web: [], tools: [], soft: [] },
      projects: [],
      education: [],
      certifications: [],
      experience: [],
      ats_score: 100,
      suggestions: [],
    },
  ];
  const fetchImpl = async (_url, request) => {
    const body = JSON.parse(request.body);
    requests.push(body);
    const content = JSON.stringify(modelResponses[requests.length - 1]);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: content }] } }] }), { status: 200 });
  };
  const result = await generateResumeWithGemini({
    apiKey: "test-key",
    original,
    jd,
    jdText,
    resumeText: original._sourceText,
    options: {},
    fetchImpl,
  });

  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => request.generationConfig.responseMimeType === "application/json" && request.generationConfig.responseSchema));
  assert.ok(Object.hasOwn(requests[0].generationConfig.responseSchema.properties, "required_skills"));
  assert.ok(Object.hasOwn(requests[1].generationConfig.responseSchema.properties, "skills"));
  assert.ok(Object.hasOwn(requests[2].generationConfig.responseSchema.properties, "ats_score"));
  assert.equal(result.mode, "gemini");
  assert.equal(result.resume.name, "Alex Rivera");
  assert.ok(!Object.values(result.resume.skills).flat().includes("Kotlin"));
  assert.ok(result.scores.after.total < 100);
  assert.deepEqual(result.extraction.jd.required_skills, ["JavaScript", "Java", "Spring Boot", "Hibernate", "MySQL"]);
  assert.ok(result.extraction.resume.skills.includes("React"));
});
