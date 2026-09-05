import { pathToFileURL } from "node:url";

const BASE_URL = "https://api.experientiallabs.ai/v1";
const MODEL = "gpt-6-astra";

export async function experientialChat(messages, options = {}) {
  const apiKey = process.env.EXPERIENTIAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "EXPERIENTIAL_API_KEY is not set. Create a key under Settings -> API keys and export it."
    );
  }
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? MODEL,
      messages,
      ...(options.stream ? { stream: true } : {}),
      ...(options.tools ? { tools: options.tools, tool_choice: options.tool_choice } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Experiential gateway error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = await experientialChat([
    { role: "user", content: "Hello from my product" },
  ]);
  console.log("reply:", data.choices[0].message.content);
  console.log("usage:", JSON.stringify(data.usage));
}
