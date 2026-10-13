# JD2Resume

JD2Resume turns a job description and a user's original resume into an editable, ATS-friendly draft. **The default mode is free and requires no API key, account, subscription, or paid service.** Resume files stay in server memory only; there is no database or server-side resume storage.

## Requirements

- Node.js 20, 21, or 22

## Setup

1. Install dependencies with `npm install`.
2. (Optional, for local AI) Install [Ollama](https://ollama.com/download), run `ollama pull llama3.2`, copy `.env.example` to `.env`, and set `OLLAMA_MODEL=llama3.2`.
3. (Optional, for Gemini structured JSON) Configure `GEMINI_API_KEY` and `GEMINI_MODEL` in `.env`. This sends the resume and JD to the Google Gemini API; check Google's current quota and pricing before enabling it. If both Gemini and Ollama are configured, Gemini is used first. Leave both unset for fully local, no-key processing.
4. Start the development frontend and API with `npm run dev`.
5. Open the Vite URL printed in the terminal (usually `http://localhost:5173`).

The API uses port `3001` by default. If neither Gemini nor Ollama is configured, the app uses built-in text heuristics and does not connect to an AI provider. With `OLLAMA_MODEL` set, it uses the Ollama server at `OLLAMA_BASE_URL` (default `http://localhost:11434`). When `GEMINI_API_KEY` is configured, resume text is sent to Google's Gemini API; set this only if that transfer is disclosed to users. The score remains local JavaScript. Configure `PORT`, `MAX_UPLOAD_MB` (1–10), and `TRUST_PROXY` in `.env` as needed. `TRUST_PROXY=1` is only for deployment behind exactly one trusted reverse proxy.

## Public deployment (free-tier option)

The repository includes a Render Blueprint in [`render.yaml`](./render.yaml) for one free Node web service. Push this project to a GitHub repository, then create a new Blueprint in Render and select that repository. Render will build the Vite app and serve it from the Express server at one HTTPS origin; no separate static-site proxy or paid AI key is required. The free host's availability, sleep behavior, resource limits, and terms can change; check Render's current plan details before publishing.

The deployed app sets `GEMINI_API_KEY` and `OLLAMA_MODEL` to blank, enables proxy-aware IP rate limits, serves the frontend and API from the same origin, and writes no resume files or database records. Uploads are held in memory, limited to 8 MB, and extracted text is capped at 100,000 characters. API rate limits are per client IP and held in process memory, so they reduce abuse on a single instance but are not a replacement for a managed WAF or shared rate-limit store at larger scale.

Before inviting the public, review the in-app privacy notice and publish a privacy policy/contact method appropriate for your jurisdiction. The resume must reach the hosting service to be processed; JD2Resume does not intentionally save it, but the hosting provider may retain ordinary operational metadata such as IP addresses and request timing. Do not configure a third-party AI provider unless users are clearly informed.

## Included

- PDF and DOCX text extraction, plus a paste-text option.
- Local heuristic parsing and resume tailoring work out of the box. Optional Ollama adds local-model processing; optional Gemini adds schema-constrained JSON generation.
- Click-to-edit live resume preview with A4-sized page, skill-group editing, manual skill additions, and PDF/DOCX export. Empty fields are omitted and editor controls are never included in exports.
- Deterministic original-resume ATS score with category breakdown and matched/missing terms, followed by the tailored preview, a single before/after comparison, and suggestions.
- Extraction details and scoring diagnostics are hidden in a closed-by-default Debug panel; raw JSON and formulas are not shown in the normal results view.
- JDs with fewer than five extracted required skills are marked thin and use role/level-specific assumed requirements until a fuller JD is pasted.
- Resume exports use Times New Roman, single-column text, right-aligned education details, and one technologies line per project. PDF text remains selectable.
- Separate suggestions panel for skill gaps, evidence-backed “Add if accurate” actions, practice-project ideas, courses, resume-specific sample interview questions, and warnings.
- Three sample test scenarios in [`samples/test-cases.json`](./samples/test-cases.json).
- Exact local-AI prompts are in [`server/prompts.js`](./server/prompts.js); Gemini's two extraction prompts and tailoring prompt are named in [`server/gemini.js`](./server/gemini.js).

## Architecture

```text
.
├── index.html
├── src/
│   ├── App.jsx                 # Inputs, editor, preview, scores, suggestions, exports
│   ├── main.jsx
│   └── styles.css
├── server/
│   ├── index.js                # Express API and in-memory uploads
│   ├── parse.js                # PDF/DOCX extraction and structured parsing
│   ├── prompts.js              # Exact local-AI prompts and JSON schemas
│   ├── local.js                # No-provider parser, tailorer, and suggestions
│   ├── ollama.js               # Optional local Ollama adapter
│   ├── gemini.js               # Optional Gemini response-schema generation and source checks
│   ├── generate.js             # Tailoring, immutable-field protection, optimization
│   ├── scoring.js              # Deterministic ATS scoring
│   ├── export.js               # Selectable-text PDF and DOCX
│   ├── local.test.js
│   ├── generate.test.js
│   └── scoring.test.js
├── samples/
│   └── test-cases.json
├── vite.config.js
└── package.json
```

## ATS scoring formula

Each category is calculated locally on a 0–1 scale and multiplied by its published weight:

| Category | Weight | Calculation |
|---|---:|---|
| Required skills | 50 | matched required phrases / total required phrases |
| Preferred skills and tools | 20 | matched preferred phrases and tools / total of those phrases |
| Section completeness | 15 | populated Summary, Skills, Projects, Education, and Certifications sections / five sections |
| ATS formatting safety | 10 | 2 points each for verified single-column structure, standard headings, no tables, no icons, and parseable contact |
| JD keywords in summary | 5 | matched JD keywords in the summary / total JD keywords |

The score is calculated in JavaScript; it is never accepted from an LLM. FOUND earns full keyword credit, PARTIAL earns half, and MISSING earns none. Empty required/preferred/summary-keyword categories are excluded and remaining weights are normalized to 100. Matching normalizes common equivalents such as Spring Boot/SpringBoot, REST API/RESTful services, JS/JavaScript, Postgres/PostgreSQL, Node/Node.js, HTML/HTML5, and CSS/CSS3. Formatting is evaluated from known source-layout metadata and the generated resume structure using the same checks. The score is a transparent heuristic, not a hiring prediction. The original score uses the parsed original; the tailored score updates as the user edits.

The score review prompt is used only when the first tailored score is under 80. Any additional pass remains grounded in source content, and the app displays the resulting score without inflating it.

## Truthfulness and data handling

- In free built-in mode, parsers use local text heuristics; they do not send resume text to a provider.
- With Ollama enabled, prompt rules request only explicit resume facts and the local model runs on the user's machine.
- With Gemini enabled, the server sends the resume and JD to Google's API in separate schema-constrained extraction requests, followed by a schema-constrained tailoring request. Gemini output uses `responseMimeType` and `responseSchema`; the score is still computed locally in JavaScript, and resume extraction terms are checked against source text before they are used. Review current Google API quota/pricing before enabling.
- The generation prompt explicitly prohibits unsupported skills, employers, credentials, and metrics. The server also restores contact information, education, certifications, and employer/title/location/date fields from the original and filters tailored skills against original evidence or user-confirmed skills.
- Unsupported skills and hypothetical project ideas remain suggestions. Users can add a suggested skill only when the resume contains related evidence, or manually add a skill they confirm is accurate; all such draft edits are reflected in the score and exports.
- Files are uploaded to Express memory storage, parsed, and not written to disk or retained between requests. On a public deployment, resume data is sent to that site's server; HTTPS protects transport, but it is not client-side-only processing. Ollama mode sends data only to the configured Ollama endpoint.
- Use selectable-text PDFs. Scanned image-only PDFs are not OCR'd; paste the resume text or use a text-based source.

## Validate

```bash
npm test
npm run build
npm audit --omit=dev
```

`npm test` checks the deterministic scoring formula, parser behavior, schema-constrained Gemini request flow, and that exported PDF content is selectable text.
