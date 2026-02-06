import type { BunRequest } from "bun";

export function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

export function notFound(message = "Not found"): Response {
  return Response.json({ message }, { status: 404 });
}

export function readParam(req: BunRequest, key: string): string | Response {
  const value = req.params[key];
  if (value === undefined) {
    return badRequest(`Invalid ${key}, got ${value}`);
  }
  return value;
}

export function readPositiveIntParam(
  req: BunRequest,
  key: string,
): number | Response {
  const value = Number(req.params[key]);
  if (!Number.isInteger(value) || value < 0) {
    return badRequest(`Invalid ${key}, got ${req.params[key]}`);
  }
  return value;
}
