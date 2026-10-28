// HTTP client for Google's Gemini API (generateContent). No database access.
// Used by the analyses module (analysis.ai.js) and by the users module to
// check a key before it is saved.
import { geminiModel, serverGeminiKey } from "../config/env.js";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Sends one prompt and returns the model's text.
 * @param {string} prompt
 * @param {{ system?: string, format?: "json", signal?: AbortSignal, apiKey?: string|null }} options
 *   apiKey: the signed-in user's own key; falls back to the server key (anonymous use).
 * @returns {Promise<string>}
 * @throws Error("rate_limited") on HTTP 429, or a generic error
 */
export async function llmComplete(prompt, { system, format, signal, apiKey } = {}) {
  const key = apiKey || serverGeminiKey();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set. Add it to server/.env.");
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (format === "json") body.generationConfig = { responseMimeType: "application/json" };

  const res = await fetch(`${GEMINI_API}/models/${geminiModel()}:generateContent`, {
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
