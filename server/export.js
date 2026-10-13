import { existsSync } from "node:fs";
import { join } from "node:path";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TabStopType, TextRun } from "docx";
import PDFDocument from "pdfkit";

const safe = (value) => String(value ?? "").trim();
const cleanItems = (items) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).map(safe).filter((item) => {
    const key = item.toLowerCase().replace(/[^a-z0-9+#.]/g, " ").replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const singleYear = (value) => [...safe(value).matchAll(/\b(?:19|20)\d{2}\b/g)].at(-1)?.[0] ?? "";
const withoutYears = (value) => safe(value).replace(/\b(?:19|20)\d{2}\b/g, "").replace(/\s*[|·,-]\s*/g, " ").replace(/\s+/g, " ").trim();

const SKILL_GROUPS = [
  ["Programming Languages", ["programmingLanguages", "languages", "sql"]],
  ["Frontend", ["frontend", "web"]],
  ["Backend & Database", ["backendFrameworks", "backend", "databases"]],
  ["Tools", ["tools"]],
  ["Core Concepts", ["coreConcepts", "concepts"]],
  ["Soft Skills", ["softSkills", "soft"]],
];

const valuesFor = (skills, keys) => cleanItems(keys.flatMap((key) => Array.isArray(skills[key]) ? skills[key] : []));

export function resumeLines(resume) {
  const lines = [];
  const addSection = (heading, records) => {
    const content = records.filter((record) => record.kind === "technologies" || record.text || record.left || record.right || record.items?.length || record.title);
    if (content.length) lines.push({ kind: "heading", text: heading }, ...content);
  };
  const contact = [resume.phone, resume.email, resume.linkedin, resume.github, resume.location, resume.portfolio].map(safe).filter(Boolean).join(" | ");
  if (safe(resume.name)) lines.push({ kind: "name", text: safe(resume.name) });
  if (contact) lines.push({ kind: "contact", text: contact });
  addSection("Summary", [{ kind: "body", text: safe(resume.summary) }]);
  const skills = resume.skills ?? {};
  addSection("Skills", SKILL_GROUPS.map(([label, keys]) => {
    let items = valuesFor(skills, keys);
    if (label === "Programming Languages") items = cleanItems([...items, ...(skills.databases ?? []).filter((item) => /^sql$/i.test(item))]);
    if (label === "Backend & Database") items = items.filter((item) => !/^sql$/i.test(item));
    return { kind: "body", text: items.length ? `${label}: ${items.join(", ")}` : "" };
  }));
  addSection("Experience", (resume.experience ?? []).flatMap((item) => [
    { kind: "entryTitle", text: [item.title, item.company, item.location, item.dates].filter(Boolean).map(safe).join(" | ") },
    ...cleanItems(item.bullets).map((text) => ({ kind: "bullet", text })),
  ]));
  addSection("Projects", (resume.projects ?? []).flatMap((project) => {
    const bullets = cleanItems(project.bullets).slice(0, 3);
    const technologies = cleanItems(project.technologies);
    return [
      { kind: "projectTitle", text: safe(project.title ?? project.name) },
      ...bullets.map((text) => ({ kind: "bullet", text })),
      ...(technologies.length ? [{ kind: "technologies", text: technologies.join(", ") }] : []),
      { kind: "projectSpace", text: "" },
    ];
  }));
  addSection("Education", (resume.education ?? []).flatMap((education) => {
    const degree = withoutYears(education.degree);
    const year = singleYear(education.year || education.dates);
    const institution = [withoutYears(education.institute ?? education.institution), withoutYears(education.location)].filter(Boolean).join(", ");
    const cgpa = safe(education.cgpa) || (education.details ?? []).find((detail) => /^(?:CGPA|GPA)\s*[:\-]?/i.test(detail)) || "";
    return [
      { kind: "educationDegree", left: degree, right: year },
      { kind: "educationInstitute", left: institution, right: cgpa },
      ...cleanItems((education.details ?? []).filter((detail) => !/^(?:CGPA|GPA)\s*[:\-]?/i.test(detail))).map((text) => ({ kind: "body", text })),
    ];
  }));
  addSection("Certifications", (resume.certifications ?? []).map((certification) => ({
    kind: "bullet",
    text: typeof certification === "string" ? safe(certification) : [certification.name, certification.issuer, certification.date].filter(Boolean).map(safe).join(" | "),
  })));
  addSection("Achievements", cleanItems(resume.achievements).map((text) => ({ kind: "bullet", text })));
  return lines;
}

const fontDir = join(process.env.WINDIR || "C:\\Windows", "Fonts");
const regularFontPath = join(fontDir, "times.ttf");
const boldFontPath = join(fontDir, "timesbd.ttf");

function docxEducationParagraph(record, bold, italic = false) {
  return new Paragraph({
    alignment: "left",
    tabStops: [{ type: TabStopType.RIGHT, position: 10080 }],
    indent: { left: 0 },
    spacing: { before: 0, after: 40, line: 276 },
    children: [
      new TextRun({ text: record.left, bold, italics: italic, font: "Times New Roman", size: 22 }),
      new TextRun({ text: "\t", font: "Times New Roman", size: 22 }),
      new TextRun({ text: record.right, bold, italics: italic, font: "Times New Roman", size: 22 }),
    ],
  });
}

export async function createDocx(resume) {
  const children = [];
  for (const record of resumeLines(resume)) {
    if (record.kind === "name") {
      children.push(new Paragraph({
        alignment: "center",
        spacing: { after: 25 },
        children: [new TextRun({ text: record.text, bold: true, font: "Times New Roman", size: 34 })],
      }));
    } else if (record.kind === "contact") {
      children.push(new Paragraph({
        alignment: "center",
        spacing: { after: 150 },
        children: [new TextRun({ text: record.text, font: "Times New Roman", size: 20 })],
      }));
    } else if (record.kind === "heading") {
      children.push(new Paragraph({
        text: record.text.toUpperCase(),
        heading: HeadingLevel.HEADING_2,
        border: { bottom: { color: "AEB7C2", space: 1, size: 4, style: "single" } },
        spacing: { before: 240, after: 80 },
        keepNext: true,
      }));
    } else if (record.kind === "educationDegree") {
      children.push(docxEducationParagraph(record, true));
    } else if (record.kind === "educationInstitute") {
      children.push(docxEducationParagraph(record, false, true));
    } else if (record.kind === "projectSpace") {
      children.push(new Paragraph({ text: "",       spacing: { after: 200 } }));
    } else if (record.kind === "projectTitle" || record.kind === "entryTitle") {
      children.push(new Paragraph({
        alignment: "left",
        keepNext: true,
        spacing: { before: 40, after: 35, line: 276 },
        children: [new TextRun({ text: record.text, bold: true, font: "Times New Roman", size: 22 })],
      }));
    } else if (record.kind === "technologies") {
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 360 },
        spacing: { after: 0, line: 276 },
        children: [
          new TextRun({ text: "Technologies: ", bold: true, font: "Times New Roman", size: 20 }),
          new TextRun({ text: record.text, font: "Times New Roman", size: 20 }),
        ],
      }));
    } else {
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        bullet: record.kind === "bullet" ? { level: 0 } : undefined,
        indent: record.kind === "bullet" ? { left: 360, hanging: 288 } : undefined,
        spacing: { after: 35, line: 276 },
        children: [new TextRun({ text: record.text, font: "Times New Roman", size: 22 })],
      }));
    }
  }
  const document = new Document({
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 22 }, paragraph: { spacing: { line: 276 } } },
      },
      paragraphStyles: [{
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        run: { font: "Times New Roman", size: 24, bold: true, color: "26384B" },
        paragraph: { outlineLevel: 1, spacing: { before: 240, after: 80 } },
      }],
    },
    sections: [{ properties: { page: { margin: { top: 540, right: 1080, bottom: 1080, left: 1080 } } }, children }],
  });
  return Packer.toBuffer(document);
}

function setPdfFont(doc, bold) {
  const fontPath = bold ? boldFontPath : regularFontPath;
  if (existsSync(fontPath)) doc.font(fontPath);
  else doc.font(bold ? "Times-Bold" : "Times-Roman");
}

export function createPdf(resume) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 27, right: 54, bottom: 54, left: 54 }, info: { Title: "JD2Resume" } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    for (const record of resumeLines(resume)) {
      doc.x = left;
      if (record.kind === "name") {
        setPdfFont(doc, true);
        doc.fontSize(17).text(record.text, left, doc.y, { width, align: "center", lineGap: 1 });
      } else if (record.kind === "contact") {
        setPdfFont(doc, false);
        doc.fontSize(10).text(record.text, left, doc.y, { width, align: "center", lineGap: 1 });
        doc.moveDown(0.45);
      } else if (record.kind === "heading") {
        doc.moveDown(0.45);
        setPdfFont(doc, true);
        doc.fontSize(12).text(record.text.toUpperCase(), { width });
        const y = doc.y + 2;
        doc.moveTo(left, y).lineTo(left + width, y).strokeColor("#AEB7C2").lineWidth(0.5).stroke();
        doc.moveDown(0.35);
      } else if (record.kind === "projectSpace") {
        doc.moveDown(0.65);
      } else if (record.kind === "projectTitle" || record.kind === "entryTitle") {
        setPdfFont(doc, true);
        doc.fontSize(11).text(record.text, left, doc.y, { width, align: "left", lineGap: 1, paragraphGap: 2 });
      } else if (record.kind === "educationDegree" || record.kind === "educationInstitute") {
        setPdfFont(doc, record.kind === "educationDegree");
        doc.fontSize(11);
        const y = doc.y;
        doc.text(record.left, left, y, { width: width * 0.76, align: "left", lineGap: 1 });
        doc.text(record.right, left, y, { width, align: "right", lineGap: 1 });
        doc.y = Math.max(doc.y, y + doc.currentLineHeight(true));
      } else if (record.kind === "technologies") {
        setPdfFont(doc, true);
        doc.fontSize(10).text("Technologies: ", left + 18, doc.y, { continued: true, lineGap: 1 });
        setPdfFont(doc, false);
        doc.text(record.text, { width: width - 18, align: "justify", lineGap: 1 });
      } else if (record.kind === "bullet") {
        setPdfFont(doc, false);
        doc.fontSize(11).text(`• ${record.text}`, left + 12, doc.y, { width: width - 12, align: "justify", lineGap: 2, paragraphGap: 1 });
      } else {
        setPdfFont(doc, false);
        doc.fontSize(11).text(record.text, left, doc.y, { width, align: "justify", lineGap: 2, paragraphGap: 1 });
      }
    }
    doc.end();
  });
}
