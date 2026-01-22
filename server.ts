// server.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// --------- Config OpenAI ----------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// --------- Schemas (validação da resposta do LLM) ----------
const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('rename'), key: z.string(), label: z.string() }),
  z.object({ op: z.literal('add'), parent: z.string(), label: z.string() }),
  z.object({ op: z.literal('remove'), key: z.string() }),
  z.object({ op: z.literal('move'), key: z.string(), newParent: z.string() }),
  z.object({ op: z.literal('addDoc'), key: z.string(), doc: z.string() }),
  z.object({
    op: z.literal('generateTree'),
    description: z.string().optional(),
  }),
]);

const llmRespSchema = z.object({
  reply: z.string().default(''),
  ops: z.array(opSchema).default([]),
  tips: z.array(z.string()).default([]),
});

// --------- Util: reduzir árvore para caber no prompt ----------
type NodeDef = {
  key: string;
  label: string;
  bg?: string;
  fg?: string;
  docs?: string[];
  children?: NodeDef[];
};

function summarizeTreeForPrompt(root: NodeDef, maxNodes = 250): NodeDef {
  let count = 0;
  const cloneLimited = (n: NodeDef): NodeDef | null => {
    if (count >= maxNodes) return null;
    count++;
    const kids: NodeDef[] = [];
    for (const c of n.children ?? []) {
      if (count >= maxNodes) break;
      const k = cloneLimited(c);
      if (k) kids.push(k);
    }
    return { key: n.key, label: n.label, children: kids };
  };
  return cloneLimited(root) ?? { key: root.key, label: root.label, children: [] };
}

// --------- Prompt builder ----------
function buildMessages(prompt: string, tree: NodeDef) {
  const mini = summarizeTreeForPrompt(tree);
  const system = `
Você é um planejador de EAP/WBS. Recebe uma árvore JSON (nós com {key,label,children})
e um pedido do usuário. Sua tarefa é responder **APENAS** com JSON estrito no formato:

{
  "reply": "texto curto explicando o que fará (pt-BR)",
  "ops": [ ...lista de operações... ],
  "tips": [ "...", "..." ]
}

Operações permitidas:
- {"op":"rename","key":"X","label":"Novo rótulo"}
- {"op":"add","parent":"X","label":"Novo filho"}
- {"op":"remove","key":"X"}
- {"op":"move","key":"X","newParent":"Y"}
- {"op":"addDoc","key":"X","doc":"URL ou id"}
- {"op":"generateTree","description":"opcional"}

Regras:
- Nunca invente keys que não existam, exceto filhos novos (use parent + ".n").
- Evite mudanças aleatórias; respeite a intenção do pedido.
- Se o pedido for ambíguo, tente uma transformação conservadora (ops mínimas).
- Inclua "tips" curtas e úteis (máx. 6).
- Sem texto fora do JSON. Sem comentários. Sem markdown.
`;
  const user = `
Pedido do usuário:
${prompt}

Árvore atual (recortada para o contexto):
${JSON.stringify(mini, null, 2)}
`;
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

// --------- Rota principal ----------
app.post(['/ai', '/ai/ops'], async (req, res) => {
  try {
    const { prompt, tree } = req.body as { prompt?: string; tree?: NodeDef };
    if (!prompt || !tree) {
      return res.status(400).json({ error: 'Body deve conter {prompt, tree}' });
    }

    const messages = buildMessages(prompt, tree);

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages,
    });

    const raw = completion.choices?.[0]?.message?.content ?? '{}';

    // valida e normaliza
    const parsed = llmRespSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return res.status(502).json({
        error: 'Resposta do modelo fora do formato.',
        issues: parsed.error.issues,
        raw,
      });
    }

    const { reply, ops, tips } = parsed.data;
    return res.json({ reply, ops, tips });
  } catch (err: any) {
    console.error('AI error:', err);
    return res
      .status(500)
      .json({ error: err?.message || 'Erro interno do servidor' });
  }
});

// --------- health ----------
app.get('/health', (_req, res) => res.json({ ok: true, model: MODEL }));

const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => {
  console.log(`AI server listening on http://localhost:${PORT}`);
});
