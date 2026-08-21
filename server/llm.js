const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
// flash-lite: same 1M context as flash, no extended internal "thinking" tokens
// burned per call, and a far higher free-tier daily request quota — plain
// flash's free tier caps at only 20 requests/day, nowhere near enough for
// real use (each analysis costs 2-4 calls).
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export async function llmComplete(prompt, { system, format, signal, apiKey } = {}) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set. Add it to server/.env.");
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (format === "json") body.generationConfig = { responseMimeType: "application/json" };

  const res = await fetch(`${GEMINI_API}/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("rate_limited");
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  if (!text) throw new Error("Gemini returned no text (check finishReason / safety block).");
  return text;
}

// Cheap auth check (lists models, no generation cost) so a user pasting
// their own key gets immediate "this doesn't work" feedback at save time
// rather than discovering it mid-analysis.
export async function validateGeminiKey(apiKey) {
  try {
    const res = await fetch(`${GEMINI_API}/models?pageSize=1`, {
      headers: { "x-goog-api-key": apiKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}
