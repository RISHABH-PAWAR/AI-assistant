import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { AppError, LlmUnavailableError, errorHandler, notFound } from "../errors.js";

function mockRes() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}
const req = { cid: "cid-test" } as Request;

describe("error middleware", () => {
  it("AppError carries status/code/message", () => {
    const e = new AppError(400, "bad", "BAD");
    expect(e.status).toBe(400);
    expect(e.code).toBe("BAD");
    expect(e.message).toBe("bad");
  });

  it("LlmUnavailableError is a 503 with a friendly message", () => {
    const e = new LlmUnavailableError();
    expect(e.status).toBe(503);
    expect(e.code).toBe("LLM_UNAVAILABLE");
  });

  it("notFound returns a 404 envelope", () => {
    const res = mockRes();
    notFound(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Not found" });
  });

  it("formats a client AppError (status < 500) without logging as error", () => {
    const res = mockRes();
    errorHandler(new AppError(422, "nope", "X"), req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: "nope" });
  });

  it("formats a server AppError (status >= 500)", () => {
    const res = mockRes();
    errorHandler(new LlmUnavailableError(), req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("hides unknown errors behind a generic 500", () => {
    const res = mockRes();
    errorHandler(new Error("secret stack detail"), req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Something went wrong. Please try again." });
  });

  it("tolerates a missing correlation id on unknown errors", () => {
    const res = mockRes();
    errorHandler("string failure", {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
