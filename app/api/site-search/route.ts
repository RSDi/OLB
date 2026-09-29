import { streamText } from "ai";
import type { NextRequest } from "next/server";
import { getSiteIndex } from "@/lib/site-search";
import { answerContext, search } from "@/lib/site-search/text";

// The /search page's one endpoint. POST { q } streams back newline-delimited
// JSON: first the matching pages ({ type: "results" }), then the AI summary a
// piece at a time ({ type: "text" }), then { type: "done" }. The summary is
// written only from the site's own pages and cites them by number.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "anthropic/claude-haiku-4-5";
const MAX_QUERY = 200;

// A public page that calls a model: cap each visitor at a handful of AI
// summaries a minute (per server instance). Past that they still get results.
const WINDOW_MS = 60_000;
const PER_WINDOW = 12;
const recent = new Map<string, number[]>();

function allowAnswer(ip: string): boolean {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= PER_WINDOW) return false;
  times.push(now);
  recent.set(ip, times);
  if (recent.size > 5000) recent.clear();
  return true;
}

const SYSTEM = `You are the search assistant on the Omaha Lightning Basketball website, a volunteer-run, Christian homeschool basketball program in Omaha, Nebraska. Parents and players ask you questions.

Answer ONLY from the website pages provided below. Every fact you state must come from them.
- Cite the page each fact comes from with its number in square brackets, like [1] or [2][3], right after the sentence.
- Be brief and direct: lead with the answer in one or two sentences, then add a short bulleted list only if it helps (dates, times, prices, steps).
- Quote dates, times, places and prices exactly as the pages give them.
- If the pages don't answer the question, say plainly that you couldn't find that on the website and suggest the Contact page. Never guess or use outside knowledge.
- Plain Markdown only: no headings, no tables, no links (the citations are the links).`;

export async function POST(request: NextRequest) {
  let q = "";
  try {
    const body = (await request.json()) as { q?: unknown };
    q = typeof body.q === "string" ? body.q.trim().slice(0, MAX_QUERY) : "";
  } catch {
    // fall through to the empty-question response
  }
  if (!q) return Response.json({ error: "Ask a question or enter a search." }, { status: 400 });

  const pages = await getSiteIndex(request.nextUrl.origin, request.cookies.get("_vercel_jwt")?.value);
  const results = search(pages, q);
  const { sources, context } = answerContext(pages, q);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const answer = pages.length > 0 && allowAnswer(ip);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The visitor may have moved on to another search and closed the stream.
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // closed
        }
      };
      send({ type: "results", results, sources, answering: answer });
      if (answer) {
        try {
          const result = streamText({
            model: MODEL,
            system: SYSTEM,
            prompt: `Website pages:\n\n${context}\n\nQuestion: ${q}`,
            maxOutputTokens: 600,
            abortSignal: request.signal,
            onError: ({ error }) => console.error("site-search answer failed:", error),
          });
          for await (const delta of result.textStream) send({ type: "text", delta });
        } catch (err) {
          console.error("site-search answer failed:", err);
        }
      }
      send({ type: "done" });
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
