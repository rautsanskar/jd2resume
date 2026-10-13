# JD2Resume - ATS Resume Tailoring Tool

Upload your resume and paste a job description to get an ATS match score,
a tailored resume, and suggestions to improve it.

**Live demo:** https://jd2resume.onrender.com/
(Hosted on a free plan, so the first load may take about a minute.)

## Features
- Upload a resume as PDF or DOCX, or paste the text
- Extracts required and preferred skills from the job description
- ATS match score for the original resume, with a category breakdown
- Generates a resume tailored to the job description using only facts from the original
- Shows the score before and after tailoring, with matched and missing keywords
- Suggestions to close skill gaps
- Editable preview and download as PDF or DOCX
- Works without any paid API: a built-in local parser and generator
  (optional Gemini or Ollama support)

## Tech Stack
- **Frontend:** React, Vite
- **Backend:** Node.js, Express
- **File handling:** multer, pdf-parse, mammoth, docx, pdfkit
- **Security:** helmet, express-rate-limit, upload size limit
- **Hosting:** Render (free plan)

## Run Locally
```bash
git clone https://github.com/rautsanskar/jd2resume.git
cd jd2resume
npm install
cp .env.example .env
npm run dev
```
Open http://localhost:5173 (the API runs on port 3001).

## Production Build
```bash
npm run build
npm start
```

## Privacy
Resumes are processed in memory and are not stored on the server.

## Author
Sanskar Raut - [LinkedIn](https://linkedin.com/in/raut-sanskar)