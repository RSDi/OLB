import { streamText } from "ai";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { churchToday } from "@/lib/dates/today";
import { answerContext, mergeHits, searchTerms, type RecordText } from "@/lib/portal-search/query";
import { loadRecordTexts, runSearches } from "@/lib/portal-search/records";

// The portal's /portal/search page's one endpoint. POST { q } streams back
// newline-delimited JSON: first the matching records ({ type: "results" }),
// then the AI answer a piece at a time ({ type: "text" }), then
// { type: "done" }. Signed-in, approved members only. Every search and every
// record the AI reads goes through the member's own session, so it sees only
// what they could open themselves.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "anthropic/claude-haiku-4-5";
const MAX_QUERY = 200;

// A handful of AI answers a minute per member (per server instance). Past
// that they still get results.
const WINDOW_MS = 60_000;
const PER_WINDOW = 12;
const recent = new Map<string, number[]>();

function allowAnswer(key: string): boolean {
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= PER_WINDOW) return false;
  times.push(now);
  recent.set(key, times);
  if (recent.size > 5000) recent.clear();
  return true;
}

const SYSTEM = `You are the search assistant inside the Omaha Lightning Basketball member portal. Omaha Lightning is a volunteer-run, Christian homeschool basketball program in Omaha, Nebraska. Parents, coaches and board members ask you questions about the club's records.

Answer ONLY from the numbered records provided below: members, external contacts, tasks, events, playbooks, preventive maintenance items and Slack messages. Every fact you state must come from them.
- Cite the record each fact comes from with its number in square brackets, like [1] or [2][3], right after the sentence.
- Be brief and direct: lead with the answer in one or two sentences, then add a short bulleted list only if it helps (dates, times, steps, people).
- Quote names, dates, times, places and amounts exactly as the records give them. For "next" or "upcoming" questions, compare against today's date.
- Give phone numbers, emails or addresses only when the question asks how to reach someone.
- If the records don't answer the question, say plainly that you couldn't find it in the portal. Never guess or use outside knowledge.
- Plain Markdown only: no headings, no tables, no links (the citations are the links).`;

export async function POST(request: Request) {
  const supabase = await createClient();
  // API routes aren't behind the portal middleware, so check the session
  // fully here, then that the member is approved.
  const { data: { user } } = await supabase.auth.getUser();
  const viewer = user ? await getViewer() : null;
  if (!user || !viewer) return Response.json({ error: "Sign in to search." }, { status: 401 });
  if (viewer.status !== "approved") return Response.json({ error: "Your account isn’t approved yet." }, { status: 403 });

  let q = "";
  try {
    const body = (await request.json()) as { q?: unknown };
    q = typeof body.q === "string" ? body.q.trim().slice(0, MAX_QUERY) : "";
  } catch {
    // fall through to the empty-question response
  }
  if (!q) return Response.json({ error: "Ask a question or enter a search." }, { status: 400 });

  const texts: RecordText = new Map();
  const terms = searchTerms(q);
  const hits = mergeHits(await runSearches(supabase, q, terms, texts));
  const answer = hits.length > 0 && allowAnswer(viewer.memberId);
  if (answer) await loadRecordTexts(supabase, hits.slice(0, 12), texts);
  const { sources, context } = answerContext(hits, texts);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The member may have moved on to another search and closed the stream.
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // closed
        }
      };
      send({ type: "results", results: hits, sources, answering: answer });
      if (answer) {
        try {
          const result = streamText({
            model: MODEL,
            system: SYSTEM,
            prompt: `Today is ${churchToday()} (Central Time).\n\nRecords:\n\n${context}\n\nQuestion: ${q}`,
            maxOutputTokens: 600,
            abortSignal: request.signal,
            onError: ({ error }) => console.error("portal-search answer failed:", error),
          });
          for await (const delta of result.textStream) send({ type: "text", delta });
        } catch (err) {
          console.error("portal-search answer failed:", err);
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
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
