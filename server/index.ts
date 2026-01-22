import express from "express";
import cors from "cors";
import { z } from "zod";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const AIOpSchema = z.union([
  z.object({ op: z.literal("rename"), key: z.string(), label: z.string() }),
  z.object({ op: z.literal("add"), parent: z.string(), label: z.string() }),
  z.object({ op: z.literal("remove"), key: z.string() }),
  z.object({ op: z.literal("move"), key: z.string(), newParent: z.string() }),
  z.object({ op: z.literal("addDoc"), key: z.string(), doc: z.string() }),
  z.object({ op: z.literal("generateTree"), description: z.string().optional() }),
]);

const PayloadSchema = z.object({
  tree: z.any(),
  prompt: z.string().min(1),
});

app.post("/ai/ops", async (req, res) => {
  const parse = PayloadSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "bad_request", issues: parse.error.issues });

  const { tree, prompt } = parse.data;

  const system = [
    "Você é um planejador WBS. Recebe uma EAP (JSON) e um pedido.",
    "Responda APENAS chamando a função `apply_ops` com uma lista `ops` (AIOp[]) e, opcionalmente, `tips` (curtas).",
    "Mantenha chaves existentes (ex.: 4.P.1). Para novos nós, numere sequencialmente no pai.",
    "Não escreva texto fora da tool; nada de comentários fora de JSON."
  ].join(" ");

  const tools = [
    {
      type: "function",
      function: {
        name: "apply_ops",
        description: "Retorne as operações para transformar a EAP.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            ops: {
              type: "array",
              items: {
                type: "object",
                oneOf: [
                  { type: "object", properties: { op: { const: "rename" }, key: { type: "string" }, label: { type: "string" } }, required: ["op","key","label"] },
                  { type: "object", properties: { op: { const: "add" }, parent: { type: "string" }, label: { type: "string" } }, required: ["op","parent","label"] },
                  { type: "object", properties: { op: { const: "remove" }, key: { type: "string" } }, required: ["op","key"] },
                  { type: "object", properties: { op: { const: "move" }, key: { type: "string" }, newParent: { type: "string" } }, required: ["op","key","newParent"] },
                  { type: "object", properties: { op: { const: "addDoc" }, key: { type: "string" }, doc: { type: "string" } }, required: ["op","key","doc"] },
                  { type: "object", properties: { op: { const: "generateTree" }, description: { type: "string" } }, required: ["op"] }
                ]
              }
            },
            tips: { type: "array", items: { type: "string", maxLength: 280 } }
          },
          required: ["ops"]
        }
      }
    }
  ];

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: "EAP atual (JSON):" },
      { role: "user", content: JSON.stringify(tree) },
      { role: "user", content: "Instrução:" },
      { role: "user", content: prompt }
    ],
    tools
  });

  const toolCall: any = response.output?.find?.((c: any) => c.type === "tool_call" && c.tool_name === "apply_ops");
  const args = toolCall?.arguments || {};
  const rawOps = Array.isArray(args.ops) ? args.ops : [];
  const tips = Array.isArray(args.tips) ? args.tips : [];

  const ops: any[] = [];
  for (const item of rawOps) {
    const p = AIOpSchema.safeParse(item);
    if (p.success) ops.push(p.data);
  }

  if (ops.length > 200) return res.status(400).json({ error: "too_many_ops", count: ops.length });
  res.json({ ops, tips });
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`AI server on http://localhost:${PORT}`));
