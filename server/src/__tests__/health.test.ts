import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createApp } from "../app.js";

function buildTestApp(llmReady = true) {
  return createApp({ apiRouter: express.Router(), llmReady: () => llmReady });
}

describe("Phase 0 — app foundations", () => {
  it("GET /health returns ok", async () => {
    const res = await request(buildTestApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, service: "lakeside-dental-agent" });
  });

  it("GET /ready reflects LLM availability", async () => {
    const ok = await request(buildTestApp(true)).get("/ready");
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ready: true });

    const notReady = await request(buildTestApp(false)).get("/ready");
    expect(notReady.status).toBe(503);
    expect(notReady.body).toEqual({ ready: false });
  });

  it("attaches a correlation id header", async () => {
    const res = await request(buildTestApp()).get("/health");
    expect(res.headers["x-correlation-id"]).toBeTruthy();
  });

  it("echoes a provided correlation id", async () => {
    const res = await request(buildTestApp()).get("/health").set("x-correlation-id", "cid-123");
    expect(res.headers["x-correlation-id"]).toBe("cid-123");
  });

  it("unknown routes return a 404 envelope", async () => {
    const res = await request(buildTestApp()).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});
