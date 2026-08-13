import OpenAI from "openai";

let _client;

export function getOpenAI() {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

export const openai = new Proxy(
  {},
  {
    get(_target, prop) {
      return getOpenAI()[prop];
    },
  },
);
