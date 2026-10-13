export function createOllamaClient(baseUrl, model) {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/chat`;
  return {
    messages: {
      async create({ system, messages, max_tokens }) {
        let response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(180_000),
            body: JSON.stringify({
              model,
              stream: false,
              format: "json",
              options: { temperature: 0, num_predict: max_tokens },
              messages: [
                { role: "system", content: system },
                ...messages.map((message) => ({ role: message.role, content: message.content })),
              ],
            }),
          });
        } catch (error) {
          throw new Error(`Local Ollama is unavailable (${error.message}).`);
        }
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`Ollama returned ${response.status}: ${detail.slice(0, 300)}`);
        }
        const result = await response.json();
        if (!result.message?.content) throw new Error("Ollama returned an empty response.");
        return { content: [{ type: "text", text: result.message.content }] };
      },
    },
  };
}
