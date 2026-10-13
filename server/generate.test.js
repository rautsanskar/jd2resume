import test from "node:test";
import assert from "node:assert/strict";
import { generateResume } from "./generate.js";

function queuedClient(responses) {
  const queue = [...responses];
  return {
    messages: {
      async create() {
        const content = queue.shift();
        if (!content) throw new Error("Unexpected model call.");
        return { content: [{ type: "text", text: JSON.stringify(content) }] };
      },
    },
  };
}

test("preserves immutable facts, removes unsupported skills, and limits source sections", async () => {
  const original = {
    name: "Alex Original",
    phone: "555-0100",
    email: "alex@example.com",
    linkedin: "linkedin.com/in/alex",
    github: "",
    portfolio: "",
    location: "Austin, TX",
    summary: "JavaScript developer.",
    education: [{ degree: "BSc", institution: "State University", dates: "2024" }],
    skills: { technical: ["JavaScript"], tools: ["Git"], soft: [] },
    projects: [{ name: "Weather App", technologies: ["JavaScript"], bullets: ["Built a weather app in JavaScript."] }],
    experience: [{ title: "Developer", company: "Original Co", location: "Austin", dates: "2022–2024", bullets: ["Built a website."] }],
    certifications: [{ name: "Original Certificate", issuer: "Org", date: "2023" }],
    achievements: [],
  };
  const tailored = {
    ...original,
    name: "Invented Name",
    phone: "000",
    location: "Elsewhere",
    summary: "Experienced in Kubernetes.",
    education: [{ degree: "Invented Degree" }],
    certifications: [{ name: "Invented Certificate" }],
    skills: { technical: ["JavaScript", "Kubernetes"], tools: ["Git"], soft: [] },
    projects: [{ ...original.projects[0], bullets: ["Deployed a Kubernetes application."] }, { name: "Fake project", technologies: ["Kubernetes"], bullets: [] }],
    experience: [{ ...original.experience[0], bullets: ["Built a Kubernetes platform."] }, { title: "Fake role", company: "Fake Co", dates: "2020–2021", bullets: [] }],
  };
  const client = queuedClient([
    { resume: tailored, suggestions: {} },
    { qualityNotes: [], safeOptimizations: [] },
    { resume: tailored, suggestions: {} },
  ]);

  const result = await generateResume(client, "test-model", original, {
    mustHaveSkills: ["Kubernetes"],
    niceToHaveSkills: [],
    tools: [],
  }, { experienceLevel: "experienced", confirmedSkills: [] });

  assert.equal(result.resume.name, original.name);
  assert.equal(result.resume.phone, original.phone);
  assert.equal(result.resume.location, original.location);
  assert.deepEqual(result.resume.education, original.education);
  assert.deepEqual(result.resume.certifications, original.certifications);
  assert.equal(result.resume.experience.length, 1);
  assert.equal(result.resume.experience[0].company, "Original Co");
  assert.equal(result.resume.experience[0].dates, "2022–2024");
  assert.equal(result.resume.projects.length, 1);
  assert.deepEqual(result.resume.skills.technical, ["JavaScript"]);
  assert.equal(result.resume.summary, original.summary);
  assert.deepEqual(result.resume.experience[0].bullets, original.experience[0].bullets);
  assert.deepEqual(result.resume.projects[0].bullets, original.projects[0].bullets);
  assert.equal(result.optimizationPasses, 1);
});
