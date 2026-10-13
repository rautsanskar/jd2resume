import { useEffect, useMemo, useRef, useState } from "react";

const emptyResume = {
  name: "", phone: "", email: "", linkedin: "", github: "", portfolio: "", location: "", summary: "",
  education: [], skills: { programmingLanguages: [], frontend: [], backendFrameworks: [], databases: [], tools: [], coreConcepts: [], softSkills: [] }, projects: [], experience: [], certifications: [], achievements: [],
};

const emptySuggestions = { missingSkills: [], addToResume: [], learnBuild: [], projectIdeas: [], courses: [], interviewTopics: [], sampleQuestions: [], warnings: [], topChanges: [] };
const fieldGroups = [
  ["Programming Languages", ["programmingLanguages"]],
  ["Frontend", ["frontend"]],
  ["Backend & Database", ["backendFrameworks", "databases"]],
  ["Tools", ["tools"]],
  ["Core Concepts", ["coreConcepts"]],
  ["Soft Skills", ["softSkills"]],
];
const contactFields = ["phone", "email", "linkedin", "github", "location", "portfolio"];
const uniqueTextItems = (items) => [...new Map(items.map((item) => [String(item ?? "").trim().toLowerCase(), String(item ?? "").trim()])).values()].filter(Boolean);

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response;
}

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    sparkle: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" /></>,
    download: <><path d="M12 4v12m0 0 5-5m-5 5-5-5" /><path d="M4 20h16" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2" /></>,
    warning: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function ScoreRing({ score }) {
  const color = score >= 80 ? "#19856b" : score >= 60 ? "#d18a36" : "#cf5964";
  return <div className="score-ring" style={{ "--score": `${score * 3.6}deg`, "--score-color": color }} aria-label={`ATS score ${score} out of 100`}>
    <div className="score-ring-inner"><strong>{score}</strong><span>/ 100</span></div>
  </div>;
}

function ScoreCard({ report }) {
  if (!report) return null;
  const matched = report.matchedKeywords ?? [];
  const missing = report.missingKeywords ?? [];
  return <section className="score-breakdown">
    <div className="score-summary-line"><ScoreRing score={report.total} /><span>Original resume ATS score</span></div>
    <div className="score-components">{(report.breakdown ?? []).map((row) => <div className="score-component" key={row.category}>
      <span>{row.category}</span><strong>{row.points}<small> / {row.maximum}</small></strong><div className="component-track"><i style={{ width: `${row.maximum ? row.points / row.maximum * 100 : 0}%` }} /></div>
    </div>)}</div>
    <div className="keyword-assessment">
      <div><strong>Matched keywords</strong><div>{matched.map((keyword) => <span className="found-keyword" key={keyword}>{keyword}</span>)}</div></div>
      <div><strong>Missing keywords</strong><div>{missing.map((item) => <span className="missing-keyword" key={item.keyword}>{item.keyword}</span>)}</div></div>
    </div>
  </section>;
}

function Editable({ value, onChange, className = "", tagName = "div" }) {
  const Tag = tagName;
  if (!String(value ?? "").trim()) return null;
  return <Tag className={className} contentEditable suppressContentEditableWarning
    onBlur={(event) => onChange(event.currentTarget.textContent ?? "")}>{value}</Tag>;
}

function ResumePreview({ resume, setResume }) {
  const [newSkill, setNewSkill] = useState("");
  const [skillGroup, setSkillGroup] = useState("programmingLanguages");
  const update = (field, value) => setResume((current) => ({ ...current, [field]: value }));
  const hasExperience = (resume.experience ?? []).some((item) => [item.title, item.company, item.location, item.dates, ...(item.bullets ?? [])].some((value) => String(value ?? "").trim()));
  const hasProjects = (resume.projects ?? []).some((item) => [item.name, item.title, item.description, ...(item.bullets ?? []), ...(item.technologies ?? [])].some((value) => String(value ?? "").trim()));
  const hasEducation = (resume.education ?? []).some((item) => [item.degree, item.institution, item.institute, item.location, item.cgpa, ...(item.details ?? [])].some((value) => String(value ?? "").trim()));
  const hasCertifications = (resume.certifications ?? []).some((item) => String(typeof item === "string" ? item : [item?.name, item?.issuer, item?.date].filter(Boolean).join(" ")).trim());
  const updateProject = (index, value) => setResume((current) => ({
    ...current,
    projects: current.projects.map((project, itemIndex) => itemIndex === index ? {
      ...project,
      ...value,
      ...(value.technologies ? { technologies: uniqueTextItems(value.technologies) } : {}),
    } : project),
  }));
  const updateEducation = (index, value) => setResume((current) => ({
    ...current,
    education: current.education.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item),
  }));
  const addSkill = (event) => {
    event.preventDefault();
    const skill = newSkill.trim();
    if (!skill) return;
    setResume((current) => {
      const groups = { ...current.skills };
      const existing = Object.values(groups).flat().some((item) => item.toLowerCase() === skill.toLowerCase());
      if (!existing) groups[skillGroup] = [...(groups[skillGroup] ?? []), skill];
      return { ...current, skills: groups };
    });
    setNewSkill("");
  };
  return <div className="resume-preview-wrap">
    <form className="resume-edit-toolbar" onSubmit={addSkill}>
      <label>Skill group
        <select value={skillGroup} onChange={(event) => setSkillGroup(event.target.value)}>
          <option value="programmingLanguages">Programming Languages</option>
          <option value="frontend">Frontend</option>
          <option value="backendFrameworks">Backend &amp; Database</option>
          <option value="databases">Backend &amp; Database</option>
          <option value="tools">Tools</option>
          <option value="coreConcepts">Core Concepts</option>
          <option value="softSkills">Soft Skills</option>
        </select>
      </label>
      <label>Add a skill
        <input value={newSkill} onChange={(event) => setNewSkill(event.target.value)} placeholder="Add only if accurate" />
      </label>
      <button type="submit" disabled={!newSkill.trim()}>Add skill</button>
      <span>Edit or remove skills by clicking the text on the page.</span>
    </form>
    <article className="resume-paper" id="resume-preview">
    <div className="resume-contact">
      {resume.name && <Editable className="resume-name" value={resume.name} onChange={(value) => update("name", value)} />}
      {contactFields.filter((field) => resume[field]).length > 0 && <div className="resume-contact-line">{contactFields.filter((field) => resume[field]).map((field, index) => <span className="contact-field" key={field}>{index > 0 && " | "}<Editable tagName="span" value={resume[field]} onChange={(value) => update(field, value)} /></span>)}</div>}
    </div>
    {String(resume.summary ?? "").trim() && <section className="resume-section"><h3>SUMMARY</h3><Editable className="resume-editable" value={resume.summary} onChange={(value) => update("summary", value)} /></section>}
    {Object.values(resume.skills ?? {}).some((items) => items?.length) && <section className="resume-section"><h3>SKILLS</h3>
      <div className="resume-skills">{[
        ["Programming Languages", resume.skills?.programmingLanguages],
        ["Frontend", resume.skills?.frontend],
        ["Backend & Database", [...(resume.skills?.backendFrameworks ?? []), ...(resume.skills?.databases ?? [])]],
        ["Tools", resume.skills?.tools],
        ["Core Concepts", resume.skills?.coreConcepts],
        ["Soft Skills", resume.skills?.softSkills],
      ].map(([label, items]) => [label, uniqueTextItems(items ?? [])]).filter(([, items]) => items.length).map(([label, items]) => <p key={label}><strong>{label}:</strong> <Editable tagName="span" value={items.join(", ")} onChange={(value) => {
        const nextItems = uniqueTextItems(value.split(","));
        const keys = fieldGroups.find(([group]) => group === label)?.[1] ?? [];
        setResume((current) => {
          const nextSkills = { ...current.skills };
          keys.forEach((key, index) => { nextSkills[key] = index === 0 ? nextItems : []; });
          return { ...current, skills: nextSkills };
        });
      }} /></p>)}</div>
    </section>}
    {hasExperience && <section className="resume-section"><h3>EXPERIENCE</h3>{resume.experience.map((item, index) => <div className="resume-entry" key={`${item.company}-${index}`}>
      {([item.title, item.company, item.location, item.dates].some(Boolean)) && <div className="entry-title"><strong>{[item.title, item.company].filter(Boolean).join(" · ")}</strong><span>{[item.location, item.dates].filter(Boolean).join(" · ")}</span></div>}
      {(item.bullets ?? []).filter(Boolean).map((bullet, bulletIndex) => <div className="resume-bullet-row" key={bulletIndex}>• <Editable value={bullet} onChange={(value) => setResume((current) => ({ ...current, experience: current.experience.map((entry, entryIndex) => entryIndex === index ? { ...entry, bullets: entry.bullets.map((line, lineIndex) => lineIndex === bulletIndex ? value : line) } : entry) }))} /></div>)}
    </div>)}</section>}
    {hasProjects && <section className="resume-section"><h3>PROJECTS</h3>{resume.projects.map((item, index) => <div className="resume-entry" key={`${item.name}-${index}`}>
      <Editable className="resume-project-title" value={item.name || item.title} onChange={(value) => updateProject(index, { name: value })} />
      {item.description && <Editable className="resume-editable" value={item.description} onChange={(value) => updateProject(index, { description: value })} />}
      {(item.bullets ?? []).filter(Boolean).map((bullet, bulletIndex) => <div className="resume-bullet-row" key={bulletIndex}>• <Editable value={bullet} onChange={(value) => updateProject(index, { bullets: item.bullets.map((line, lineIndex) => lineIndex === bulletIndex ? value : line) })} /></div>)}
      {uniqueTextItems(item.technologies ?? []).length > 0 && <div className="project-technologies"><strong>Technologies:</strong> <Editable value={uniqueTextItems(item.technologies).join(", ")} onChange={(value) => updateProject(index, { technologies: uniqueTextItems(value.split(",")) })} /></div>}
    </div>)}</section>}
    {hasEducation && <section className="resume-section"><h3>EDUCATION</h3>{resume.education.map((item, index) => <div className="resume-entry" key={`${item.institution}-${index}`}>
      {(item.degree || item.dates || item.year) && <div className="education-edit-row"><Editable className="education-degree" value={(item.degree ?? "").replace(/\b(?:19|20)\d{2}\b/g, "").replace(/\s*[|·,-]\s*/g, " ").trim()} onChange={(value) => updateEducation(index, { degree: value.replace(/\b(?:19|20)\d{2}\b/g, "").trim() })} /><Editable className="education-right" value={(item.dates || item.year || "").match(/\b(?:19|20)\d{2}\b/g)?.at(-1) ?? ""} onChange={(value) => updateEducation(index, { dates: value.match(/\b(?:19|20)\d{2}\b/g)?.at(-1) ?? "" })} /></div>}
      {(item.institution || item.institute || item.location || item.cgpa) && <div className="education-edit-row"><Editable className="education-institute" value={[item.institution || item.institute, item.location].filter(Boolean).join(", ")} onChange={(value) => updateEducation(index, { institution: value, location: "" })} /><Editable className="education-right education-cgpa" value={item.cgpa} onChange={(value) => updateEducation(index, { cgpa: value })} /></div>}
      {(item.details ?? []).filter(Boolean).map((detail, detailIndex) => <Editable className="resume-editable" key={detailIndex} value={detail} onChange={(value) => updateEducation(index, { details: item.details.map((line, lineIndex) => lineIndex === detailIndex ? value : line) })} />)}
    </div>)}</section>}
    {hasCertifications && <section className="resume-section"><h3>CERTIFICATIONS</h3>{resume.certifications.map((item, index) => {
      const name = typeof item === "string" ? item : [item.name, item.issuer, item.date].filter(Boolean).join(" · ");
      return name && <div className="resume-bullet-row" key={index}>• <Editable value={name} onChange={(value) => setResume((current) => ({ ...current, certifications: current.certifications.map((cert, certIndex) => certIndex === index ? (typeof cert === "string" ? value : { ...cert, name: value, issuer: "", date: "" }) : cert) }))} /></div>;
    })}</section>}
    </article>
  </div>;
}

function Suggestions({ suggestions, setResume }) {
  const data = { ...emptySuggestions, ...suggestions };
  const addSuggestedSkill = (skill) => {
    const group = /^(java|javascript|typescript|python|sql|c\+\+|c#|kotlin)$/i.test(skill) ? "programmingLanguages"
      : /^(html5?|css3?|react|angular|vue)$/i.test(skill) ? "frontend"
        : /^(spring boot|hibernate|jpa|jdbc|microservices|node\.js)$/i.test(skill) ? "backendFrameworks"
          : /^(mysql|postgresql|sql\/rdbms|rdbms)$/i.test(skill) ? "databases"
            : /^(git|docker|maven|tableau|eclipse|vs code|jenkins|kubernetes)$/i.test(skill) ? "tools"
              : /^(communication|teamwork|problem solving|critical thinking|time management|agile|oop|data structures.*algorithms)$/i.test(skill) ? "coreConcepts" : "tools";
    setResume((current) => {
      const skills = { ...current.skills };
      const key = (value) => value.toLowerCase().replace(/html5/g, "html").replace(/css3/g, "css").replace(/object-oriented programming/g, "oop").replace(/[^a-z0-9+#]/g, "");
      if (!Object.values(skills).flat().some((item) => key(item) === key(skill))) {
        skills[group] = [...(skills[group] ?? []), skill];
      }
      return { ...current, skills };
    });
  };
  return <div className="suggestion-stack">
    <div className="suggestion-intro"><span className="eyebrow">YOUR NEXT STEPS</span><h2>Close the gap, thoughtfully.</h2><p>These recommendations stay separate from your resume. Add skills only after you’ve genuinely gained and verified them.</p></div>
    <section className="suggestion-card"><div className="card-heading"><span className="icon-tile amber"><Icon name="warning" /></span><div><h3>Add to resume</h3><p>Only where the original has related evidence</p></div></div>
      {data.addToResume.length ? <div className="gap-list">{data.addToResume.map((item) => <div className="gap-item" key={item.skill}><div><strong>{item.skill}</strong><p>{item.reason}</p><button className="suggestion-add-button" type="button" onClick={() => addSuggestedSkill(item.skill)}>Add if accurate</button></div><span className={`priority priority-${(item.priority || "medium").toLowerCase()}`}>{item.priority || "Medium"}</span></div>)}</div> : <p className="empty-note">No missing terms currently have enough related resume evidence.</p>}
    </section>
    <section className="suggestion-card"><div className="card-heading"><span className="icon-tile amber"><Icon name="warning" /></span><div><h3>Learn / build</h3><p>These skills are not claimed in the resume</p></div></div>
      {data.learnBuild.length ? <div className="gap-list">{data.learnBuild.map((item) => <div className="gap-item" key={item.skill}><div><strong>{item.skill}</strong><p>{item.reason}</p>{item.miniProjectIdea && <p className="tech-stack">{item.miniProjectIdea}</p>}</div><span className={`priority priority-${(item.priority || "medium").toLowerCase()}`}>{item.priority || "Medium"}</span></div>)}</div> : <p className="empty-note">No unsupported missing skills were identified.</p>}
    </section>
    <section className="suggestion-card"><div className="card-heading"><span className="icon-tile violet"><Icon name="sparkle" /></span><div><h3>Project ideas</h3><p>Practice first. Write about it when it’s real.</p></div></div>
      {data.projectIdeas.length ? data.projectIdeas.slice(0, 3).map((item) => <div className="idea" key={item.title}><strong>{item.title}</strong><p className="tech-stack">{(item.techStack || []).join(" · ")}</p><p>{(item.features || []).join(" • ")}</p><div className="resume-angle"><span>Future resume angle</span>{item.resumeAngle}</div></div>) : <p className="empty-note">No project suggestions available.</p>}
    </section>
    <div className="suggestion-grid">
      <section className="suggestion-card compact-card"><h3>Learn next</h3>{data.courses.length ? data.courses.map((item) => <div className="simple-item" key={item.name}><strong>{item.name}</strong><p>{item.reason}</p></div>) : <p className="empty-note">No specific courses suggested.</p>}</section>
      <section className="suggestion-card compact-card"><h3>Sample questions from your resume</h3>{data.sampleQuestions?.length ? <ul>{data.sampleQuestions.map((item) => <li key={item}>{item}</li>)}</ul> : data.interviewTopics.length ? <ul>{data.interviewTopics.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-note">No interview topics listed.</p>}</section>
    </div>
    {data.topChanges?.length > 0 && <section className="suggestion-card"><h3>Top changes that may improve the score</h3><ul>{data.topChanges.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul></section>}
    {data.weakWording?.length > 0 && <section className="suggestion-card"><h3>Wording to confirm</h3><ul>{data.weakWording.map((item) => <li key={item}>{item}</li>)}</ul></section>}
    <section className="suggestion-card"><h3>Things to review</h3>{data.warnings.length ? <ul className="warning-list">{data.warnings.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-note">No warnings from the source resume.</p>}</section>
  </div>;
}

export default function App() {
  const [jobDescription, setJobDescription] = useState("");
  const [fullJd, setFullJd] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [sourceMode, setSourceMode] = useState("upload");
  const [roleTitle, setRoleTitle] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("experienced");
  const [result, setResult] = useState(null);
  const [resume, setResume] = useState(emptyResume);
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloadState, setDownloadState] = useState("");
  const [confirmedSkills, setConfirmedSkills] = useState("");
  const thinJdAttempt = useRef("");

  const readiness = useMemo(() => [
    Boolean(jobDescription.trim()),
    Boolean(resumeFile || resumeText.trim()),
  ].filter(Boolean).length, [jobDescription, resumeFile, resumeText]);
  const jobContextChanged = Boolean(result && (
    result.sourceJobDescription !== jobDescription ||
    result.sourceRoleTitle !== roleTitle ||
    result.sourceExperienceLevel !== experienceLevel
  ));

  useEffect(() => {
    if (!result) return undefined;
    const timer = setTimeout(async () => {
      try {
        const response = await api("/api/score", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume, jd: result.jd, options: { experienceLevel, original: result.original } }),
        });
        setScore(await response.json());
      } catch (cause) {
        setError(cause.message);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [resume, result, experienceLevel]);

  const generate = async (event, description = jobDescription) => {
    event?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const form = new FormData();
      form.append("jobDescription", description);
      form.append("resumeText", sourceMode === "paste" ? resumeText : "");
      if (sourceMode === "upload" && resumeFile) form.append("resumeFile", resumeFile);
      form.append("roleTitle", roleTitle);
      form.append("yearsExperience", yearsExperience);
      form.append("experienceLevel", experienceLevel);
      form.append("confirmedSkills", JSON.stringify(confirmedSkills.split(",").map((item) => item.trim()).filter(Boolean)));
      const response = await api("/api/analyze", { method: "POST", body: form });
      const data = await response.json();
      setJobDescription(description);
      setResult({
        ...data,
        sourceJobDescription: description,
        sourceRoleTitle: roleTitle,
        sourceExperienceLevel: experienceLevel,
      });
      setResume(data.resume);
      setScore(data.scores.after);
      setFullJd("");
      thinJdAttempt.current = "";
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!result?.jd?.is_thin || loading || fullJd.trim().length < 20 || fullJd.trim() === result.sourceJobDescription?.trim()
      || fullJd.trim() === thinJdAttempt.current) return undefined;
    const timer = setTimeout(() => {
      thinJdAttempt.current = fullJd.trim();
      generate(null, fullJd);
    }, 900);
    return () => clearTimeout(timer);
  }, [fullJd, result, loading]);

  const download = async (format) => {
    setDownloadState(format);
    setError("");
    try {
      const response = await api(`/api/export/${format}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume }),
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `JD2Resume.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setDownloadState("");
    }
  };

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark"><Icon name="sparkle" size={19} /></span><span>jd<span className="brand-accent">2</span>resume</span></a><div className="topbar-center"><span className="secure-dot" /> Processed in memory <span className="topbar-divider">·</span> Not saved</div><button className="top-link" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>How it works <Icon name="arrow" size={15} /></button></header>
    <main>
      <section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="eyebrow-line" /> YOUR CAREER, IN CONTEXT</span><h1>Make your experience<br />make <span>the right impression.</span></h1><p>A sharper resume for the role you want. Grounded in your real experience, built to get through ATS.</p><div className="hero-proof"><span><Icon name="check" size={15} /> Nothing made up</span><span><Icon name="check" size={15} /> ATS-ready format</span><span><Icon name="check" size={15} /> You stay in control</span></div></div><div className="hero-visual" aria-hidden="true"><div className="orb orb-one" /><div className="orb orb-two" /><div className="visual-card visual-back"><span className="visual-bar" /><span className="visual-lines" /><span className="visual-lines short" /></div><div className="visual-card visual-front"><div className="visual-title"><span>RESUME MATCH</span><b>↗</b></div><div className="visual-score">87<span>/100</span></div><div className="visual-progress"><i /></div><div className="visual-matched"><span><Icon name="check" size={13} /></span>Experience, aligned.</div></div><div className="visual-spark"><Icon name="sparkle" size={22} /></div></div></section>
      <div className="workspace-grid">
        <form className="input-card" onSubmit={generate}>
          <div className="form-topline"><span className="step-number">01</span><span>THE INPUTS</span><span className="step-progress">{readiness}/2 ready</span></div>
          <div className="form-intro"><h2>Start with the role.</h2><p>Give us the context. We’ll help your experience meet the moment.</p></div>
          <label className="field-label" htmlFor="job-description">Job description <span className="required-star">*</span></label>
          <textarea id="job-description" className="jd-input" required value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste the full job description here — responsibilities, skills, qualifications and all…" />
          <div className="field-header"><span className="field-label">Your original resume <span className="required-star">*</span></span><div className="mode-switch"><button type="button" className={sourceMode === "upload" ? "active" : ""} onClick={() => setSourceMode("upload")}>Upload</button><button type="button" className={sourceMode === "paste" ? "active" : ""} onClick={() => setSourceMode("paste")}>Paste text</button></div></div>
          {sourceMode === "upload" ? <label className={`upload-zone ${resumeFile ? "has-file" : ""}`} htmlFor="resume-file" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) setResumeFile(file); }}><input id="resume-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setResumeFile(event.target.files?.[0] || null)} /><span className="upload-icon"><Icon name={resumeFile ? "check" : "upload"} /></span><span className="upload-copy"><strong>{resumeFile ? resumeFile.name : "Drop your resume here, or browse"}</strong><small>{resumeFile ? `${(resumeFile.size / 1024 / 1024).toFixed(2)} MB · Ready to parse` : "PDF or DOCX · Max 8 MB"}</small></span>{!resumeFile && <span className="upload-cta">Choose file</span>}</label> : <textarea className="paste-input" value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder="Paste your resume text here…" />}
          <div className="field-divider"><span>MAKE IT PERSONAL</span></div>
          <div className="optional-grid"><label><span>Target role title <small>Optional</small></span><input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} placeholder="e.g. Product Designer" /></label><label><span>Years of experience <small>Optional</small></span><input value={yearsExperience} onChange={(event) => setYearsExperience(event.target.value)} placeholder="e.g. 3 years" /></label></div>
          <fieldset className="experience-toggle"><legend>Where are you in your career?</legend><div className="toggle-options"><button type="button" className={experienceLevel === "fresher" ? "selected" : ""} onClick={() => setExperienceLevel("fresher")}>Just starting <span>Fresher</span></button><button type="button" className={experienceLevel === "experienced" ? "selected" : ""} onClick={() => setExperienceLevel("experienced")}>Some experience <span>Experienced</span></button></div></fieldset>
          <label className="confirmed-field"><span>Skills you want to explicitly confirm <small>Optional · comma separated</small></span><input value={confirmedSkills} onChange={(event) => setConfirmedSkills(event.target.value)} placeholder="Only add skills you genuinely have" /></label>
          {error && <div className="error-banner" role="alert"><Icon name="warning" size={17} />{error}</div>}
          <button className="generate-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Building your resume…</> : <><Icon name="sparkle" /> {jobContextChanged ? "Update resume for this JD" : "Build my tailored resume"} <Icon name="arrow" size={18} /></>}</button>
          <div className="privacy-note"><span className="lock-icon">◇</span> Your resume leaves your device and is sent to this site’s server for processing; JD2Resume does not save it. External AI is not used unless the site operator enables a provider.</div>
        </form>
        <section className={`results-card ${result ? "has-result" : ""}`}>
          {!result ? <div className="empty-state"><div className="empty-art"><div className="empty-sheet"><span /><span /><span /><i /><span /><span /></div><div className="empty-star"><Icon name="sparkle" size={24} /></div></div><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>A resume that feels<br />like <em>you, at your best.</em></h2><p>Once you add your job description and resume, your tailored draft, match score and smart next steps will appear right here.</p><div className="empty-checks"><span><i />Truthful by design</span><span><i />Ready for your review</span></div></div> : <>
            <section className="result-section">
              <ScoreCard report={result.scores.before} />
              {result.jd.is_thin && <div className="thin-jd-banner"><strong>This JD has no skill details.</strong> Scores use the typical requirements for a {result.jd.job_title || "this"} role. Paste the full JD for an exact score.
                {result.jd.assumption_source && <small>{result.jd.assumption_source}</small>}
                <label htmlFor="full-jd">Paste the full job description</label>
                <textarea id="full-jd" value={fullJd} onChange={(event) => setFullJd(event.target.value)} placeholder="Paste the complete job description here. Analysis reruns automatically." />
                {loading && <small>Updating scores and resume…</small>}
              </div>}
            </section>
            <section className="result-section">
              <div className="result-section-heading"><h2>Tailored resume</h2><div className="export-actions"><button className="export-secondary" aria-label="Download as DOCX" disabled={Boolean(downloadState)} onClick={() => download("docx")}><Icon name="download" size={15} /> {downloadState === "docx" ? "Preparing…" : "Download DOCX"}</button><button className="export-primary" aria-label="Download as PDF" disabled={Boolean(downloadState)} onClick={() => download("pdf")}><Icon name="download" size={15} /> {downloadState === "pdf" ? "Preparing…" : "Download PDF"}</button></div></div>
              <p className="edit-hint">Click any resume text to edit. Add or remove skills using the controls above the page. Your edits are included in PDF and DOCX exports.</p>
              <div className="preview-scroll"><ResumePreview resume={resume} setResume={setResume} /></div>
            </section>
            <section className="result-section comparison-line"><h2>Score comparison</h2><p>Before <strong>{result.scores.before.total}</strong> <span aria-hidden="true">→</span> After <strong>{score?.total ?? result.scores.after.total}</strong></p></section>
            <section className="result-section"><Suggestions suggestions={result.suggestions} setResume={setResume} /></section>
            <details className="debug-panel"><summary>Debug</summary><pre>{JSON.stringify({ extraction: result.extraction, jd: result.jd, score: score ?? result.scores.after, mode: result.mode }, null, 2)}</pre></details>
          </>}
        </section>
      </div>
      <section className="how-section" id="how-it-works"><div><span className="eyebrow"><span className="eyebrow-line" /> GOOD WORK, WELL TOLD</span><h2>Your story stays <em>your story.</em></h2></div><div className="how-steps"><article><span>01</span><h3>We read the room</h3><p>Your resume and the job description become structured details—not assumptions.</p></article><article><span>02</span><h3>We connect the dots</h3><p>Your real experience is tailored to the role. Missing skills stay suggestions, never claims.</p></article><article><span>03</span><h3>You make the call</h3><p>Edit every section, review your score, and export when it feels right.</p></article></div></section>
      <footer><a className="brand footer-brand" href="#"><span className="brand-mark"><Icon name="sparkle" size={16} /></span><span>jd<span className="brand-accent">2</span>resume</span></a><p>Good luck out there. You’ve got this.</p><span>Private by design · No accounts · No storage</span></footer>
    </main>
  </div>;
}
