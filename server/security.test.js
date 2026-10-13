import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./index.js";

async function withServer(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("sets security headers and prevents API responses from being cached", async () => {
  await withServer(createApp(), async (origin) => {
    const response = await fetch(`${origin}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

test("rate limits public analysis requests by client", async () => {
  await withServer(createApp({ rateLimitOverrides: { analyze: 1 } }), async (origin) => {
    const makeRequest = () => {
      const body = new FormData();
      body.set("jobDescription", "Java developer with SQL, HTML, CSS, JavaScript, and Git.");
      body.set("resumeText", "Jordan Rivera\nJava, SQL, HTML, CSS, JavaScript, Git.");
      return fetch(`${origin}/api/analyze`, { method: "POST", body });
    };

    const first = await makeRequest();
    assert.equal(first.status, 200);
    const second = await makeRequest();
    assert.equal(second.status, 429);
    assert.match((await second.json()).error, /limit reached/i);
  });
});

test("rejects overlong job descriptions before resume generation", async () => {
  await withServer(createApp(), async (origin) => {
    const body = new FormData();
    body.set("jobDescription", "x".repeat(60_001));
    body.set("resumeText", "Jordan Rivera");
    const response = await fetch(`${origin}/api/analyze`, { method: "POST", body });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /character limit/i);
  });
});

test("returns a client error for non-object JSON instead of an internal server error", async () => {
  await withServer(createApp(), async (origin) => {
    const response = await fetch(`${origin}/api/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /required to score/i);
  });
});

test("rejects fake PDF uploads based on file content", async () => {
  await withServer(createApp(), async (origin) => {
    const body = new FormData();
    body.set("jobDescription", "Java developer with SQL, HTML, CSS, JavaScript, and Git.");
    body.set("resumeFile", new Blob(["not a PDF"]), "resume.pdf");
    const response = await fetch(`${origin}/api/analyze`, { method: "POST", body });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /not a valid PDF/i);
  });
});

test("rejects uploads larger than the configured per-file cap", async () => {
  await withServer(createApp({ env: { ...process.env, MAX_UPLOAD_MB: "1" } }), async (origin) => {
    const body = new FormData();
    body.set("jobDescription", "Java developer with SQL, HTML, CSS, JavaScript, and Git.");
    body.set("resumeFile", new Blob([new Uint8Array(1024 * 1024 + 1)]), "resume.pdf");
    const response = await fetch(`${origin}/api/analyze`, { method: "POST", body });
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /1 MB limit/);
  });
});

test("serves the built app from Express in production mode", async () => {
  await withServer(createApp({ env: { ...process.env, NODE_ENV: "production" } }), async (origin) => {
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(await response.text(), /JD2Resume/);
  });
});

test("rejects invalid upload-limit configuration instead of silently disabling limits", () => {
  assert.throws(
    () => createApp({ env: { ...process.env, MAX_UPLOAD_MB: "999" } }),
    /MAX_UPLOAD_MB must be an integer from 1 to 10/,
  );
});
