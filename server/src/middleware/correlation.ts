import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      cid: string;
    }
  }
}

/** Attach a correlation id to every request and echo it back in the response header. */
export function correlation(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-correlation-id");
  const cid = incoming && incoming.length <= 100 ? incoming : randomUUID();
  req.cid = cid;
  res.setHeader("x-correlation-id", cid);
  next();
}
