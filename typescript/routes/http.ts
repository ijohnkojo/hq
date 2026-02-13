import type { BunRequest } from "bun";

export function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

export function notFound(message = "Not found"): Response {
  return Response.json({ message }, { status: 404 });
}
