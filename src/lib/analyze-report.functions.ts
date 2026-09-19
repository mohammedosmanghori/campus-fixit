import { createServerFn } from "@tanstack/react-start";

const CATS = ["wifi", "plumbing", "lights", "furniture", "hvac", "other"] as const;
type Cat = (typeof CATS)[number];

export type AnalyzeResult = {
  title: string;
  description: string;
  category: Cat;
};

export const analyzeReport = createServerFn({ method: "POST" })
  .inputValidator((d: { photoUrl: string }) => {
    if (!d?.photoUrl || typeof d.photoUrl !== "string") throw new Error("photoUrl required");
    return d;
  })
  .handler(async ({ data }): Promise<AnalyzeResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You inspect photos of broken campus facilities and identify the issue. Always respond by calling the report_issue tool. Categories: wifi, plumbing, lights, furniture, hvac, other.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify the broken facility in this photo. Write a short title (max 80 chars) and a 1-2 sentence description of the problem visible." },
              { type: "image_url", image_url: { url: data.photoUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_issue",
              description: "Submit the identified facility issue",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Short title of the broken facility" },
                  description: { type: "string", description: "1-2 sentence description of the problem" },
                  category: { type: "string", enum: [...CATS] },
                },
                required: ["title", "description", "category"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_issue" } },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("AI rate limit reached, try again shortly");
      if (res.status === 402) throw new Error("AI credits exhausted");
      throw new Error(`AI error: ${txt.slice(0, 200)}`);
    }

    const json = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("AI did not return a result");
    const args = JSON.parse(call.function.arguments);
    const category = (CATS as readonly string[]).includes(args.category) ? (args.category as Cat) : "other";
    return {
      title: String(args.title ?? "Reported issue").slice(0, 120),
      description: String(args.description ?? "").slice(0, 1000),
      category,
    };
  });
