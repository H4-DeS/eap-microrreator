import React, { useMemo, useState, useRef, useEffect } from "react";
import { Tree, TreeNode } from "react-organizational-chart";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  PageOrientation,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";

/**
 * EAP – Microrreator Nuclear – VERSÃO POR DISCIPLINAS (Sidebar overlay + atalhos + reset)
 * --------------------------------------------------------------------------------------
 * ✓ Sidebar overlay (oculta conteúdo por cima, não "espreme" a área)
 * ✓ Remoção do título superior para eliminar área branca
 * ✓ Fundo escuro na área da EAP para melhor contraste
 * ✓ Atalhos de teclado (E/X/C/Del/+Filho/↑/↓/Ctrl+S/Ctrl+O/P/G/D)
 * ✓ Botão "Resetar" para limpar localStorage e restaurar padrão
 */

const STORAGE_KEY = "eap_mrn_disciplinas_v3";

const COLORS = {
  appBg: "#0B0F19", // fundo escuro da área útil
  rootBg: "#1E3A8A",
  rootFg: "#FFFFFF",
  ucBg: "#C7D2FE",
  udt2Bg: "#BBF7D0",
  udt3Bg: "#FEF9C3",
  spcBg: "#FCA5A5",
  mrBg: "#DDD6FE",
  matBg: "#FED7AA",
  susBg: "#A7F3D0",
  qmsBg: "#E5E7EB",
  border: "#1E293B",
  text: "#111827",
};

const boxBase: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  padding: "10px 14px",
  display: "inline-block",
  maxWidth: 560,
  textAlign: "left",
  fontFamily: "system-ui, Arial, sans-serif",
  fontSize: 14,
  lineHeight: 1.45,
  cursor: "pointer",
  userSelect: "none",
  color: COLORS.text,
  boxShadow: "0 2px 6px rgba(0,0,0,.3)",
  background: "#F9FAFB",
};

const wrap: React.CSSProperties = {
  background: COLORS.appBg,
  fontFamily: "system-ui, Arial, sans-serif",
  height: "100vh",
  overflow: "hidden",
};

const topbar: React.CSSProperties = {
  height: 44,
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderBottom: "1px solid #111827",
  padding: "0 12px",
  background: COLORS.appBg,
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1100,
  justifyContent: "flex-start",
};

const btn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #94A3B8",
  background: "#E2E8F0",
  cursor: "pointer",
  fontWeight: 600,
  color: COLORS.text,
};

const hamburgerBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  padding: 0,
};

// Sidebar overlay: cobre a área útil ao abrir; fechada desaparece
const sidebarOverlay: React.CSSProperties = {
  position: "fixed",
  left: 0,
  top: 44,
  bottom: 0,
  width: 300,
  background: "#0f172a",
  borderRight: "1px solid #1f2937",
  padding: 12,
  overflowY: "auto",
  color: "#e5e7eb",
  boxShadow: "4px 0 24px rgba(0,0,0,.45)",
  zIndex: 1150,
};

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  left: 0,
  top: 44,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,.45)",
  backdropFilter: "blur(1px)",
  zIndex: 1100,
};

const sidebarTitle: React.CSSProperties = { fontWeight: 700, fontSize: 12, opacity: 0.9, margin: "10px 0 6px" };
const sidebarGroup: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

// Pequena ajuda para datas no DOCX
const fmtDate = () => new Date().toLocaleDateString();

/** Tipos **/
type NodeKey = string;

type NodeDef = {
  key: NodeKey;
  label: string;
  bg?: string;
  fg?: string;
  children?: NodeDef[];
  docs?: string[];
};

/** Helpers gerais **/
const waitNextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const walkTree = (n: NodeDef, fn: (node: NodeDef, parent?: NodeDef) => void, parent?: NodeDef) => { fn(n, parent); n.children?.forEach((c) => walkTree(c, fn, n)); };
const cloneTree = (n: NodeDef): NodeDef => ({ ...n, children: n.children?.map(cloneTree), docs: n.docs ? [...n.docs] : undefined });

const findPath = (root: NodeDef, key: NodeKey): NodeKey[] | null => {
  const path: NodeKey[] = []; let found = false;
  const dfs = (node: NodeDef, acc: NodeKey[]) => { if (found) return; const next = [...acc, node.key]; if (node.key === key) { path.push(...next); found = true; return; } node.children?.forEach((c) => dfs(c, next)); };
  dfs(root, []); return found ? path : null;
};


const getByPath = (root: NodeDef, path: NodeKey[]): { node: NodeDef; parent?: NodeDef; index?: number } => {
  let cur = root; let parent: NodeDef | undefined; let idx: number | undefined;
  for (let i = 1; i < path.length; i++) { parent = cur; const k = path[i]; idx = cur.children?.findIndex((c) => c.key === k); if (idx == null || idx < 0 || !cur.children) break; cur = cur.children[idx]; }
  return { node: cur, parent, index: idx };
};

//Define a árvore inicial a ser gerada ao clicar no botão
const initialTree = (): NodeDef => {
  return {
    key: "root",
    label: "PROJETO: Microrreator Nuclear",
    bg: COLORS.rootBg,
    fg: COLORS.rootFg,
    children: [
      // ... seu conteúdo
    ],
  };
};

// Normaliza #hex (aceita 3 ou 6 dígitos). Retorna undefined se vazio/ inválido.
function normalizeHexColor(v?: string): string | undefined {
  if (!v) return undefined;
  let s = v.trim();
  if (!s) return undefined;
  if (s[0] !== '#') s = '#' + s;
  const ok = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
  return ok ? s : undefined;
};


/** Monta as 6 disciplinas padrão **/
const disciplinas = (prefix: string, children: NodeDef[]): NodeDef[] => [
  { key: `${prefix}.A`, label: `${prefix}.A Aquisição`, children: children.filter(c => c.key.startsWith(`${prefix}.A.`)) },
  { key: `${prefix}.P`, label: `${prefix}.P Projeto`, children: children.filter(c => c.key.startsWith(`${prefix}.P.`)) },
  { key: `${prefix}.C`, label: `${prefix}.C Construção`, children: children.filter(c => c.key.startsWith(`${prefix}.C.`)) },
  { key: `${prefix}.L`, label: `${prefix}.L Licenciamento`, children: children.filter(c => c.key.startsWith(`${prefix}.L.`)) },
  { key: `${prefix}.M`, label: `${prefix}.M Montagem`, children: children.filter(c => c.key.startsWith(`${prefix}.M.`)) },
  { key: `${prefix}.K`, label: `${prefix}.K Comissionamento`, children: children.filter(c => c.key.startsWith(`${prefix}.K.`)) },
];

/** Utilitários de cor */
function hexToRgb(hex?: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let s = hex.trim();
  if (!s) return null;
  if (s[0] !== '#') s = '#' + s;
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return null;

  if (s.length === 4) {
    const r = parseInt(s[1] + s[1], 16);
    const g = parseInt(s[2] + s[2], 16);
    const b = parseInt(s[3] + s[3], 16);
    return { r, g, b };
  } else {
    const r = parseInt(s.slice(1, 3), 16);
    const g = parseInt(s.slice(3, 5), 16);
    const b = parseInt(s.slice(5, 7), 16);
    return { r, g, b };
  }
}

function relLuminance(hex?: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const toLin = (c: number) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  const R = toLin(rgb.r), G = toLin(rgb.g), B = toLin(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function isDark(hex?: string): boolean {
  return relLuminance(hex) < 0.45;
}

/** Componentes de nó com suporte a edição **/
function NodeLabel({
  node,
  hasChildren,
  isCollapsed,
  onToggle,
  onEditClick,
  editMode,
  selected,
}: {
  node: NodeDef;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onEditClick: () => void;
  editMode: boolean;
  selected: boolean;
}) {
  const [isHover, setIsHover] = React.useState(false);

  const bg = node.bg ?? (boxBase.background as string);
  const textColor = isDark(bg) ? '#f8fafc' : COLORS.text;

  // separa o primeiro termo do restante do label
  const [codePart, ...descParts] = (node.label ?? '').split(' ');
  const desc = descParts.join(' ');

  return (
    <div
      style={{
        ...boxBase,
        textAlign: 'left',
        background: bg,
        outline: selected ? '2px solid #2563EB' : undefined,
        position: 'relative',
        cursor: hasChildren ? 'pointer' : 'default',
        color: textColor,
        transition: 'transform .06s ease-out, box-shadow .12s ease-out',
        minWidth: 240,
      }}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (hasChildren) onToggle();
      }}
    >
      {/* Cabeçalho: código + ícone de expansão */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ opacity: 0.8 }}>
          {hasChildren ? (isCollapsed ? '▶' : '▼') : '•'}
        </span>
        <span
          style={{
            fontWeight: 700,
            background: isDark(bg) ? 'rgba(255,255,255,.1)' : '#E2E8F0',
            borderRadius: 6,
            padding: '2px 8px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {codePart}
        </span>
      </div>

      {/* Linha divisória */}
      <div
        style={{
          height: 1,
          background: isDark(bg) ? 'rgba(255,255,255,.15)' : '#CBD5E1',
          margin: '6px 0 6px',
        }}
      />

      {/* Descrição */}
      <div style={{ whiteSpace: 'pre-wrap' }}>{desc}</div>

      {/* Botão Editar (visível só no hover) */}
      {editMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEditClick();
          }}
          style={{
            position: 'absolute',
            right: 8,
            top: 6,
            display: isHover ? 'inline-flex' : 'none',
            alignItems: 'center',
            gap: 6,
            border: '1px solid #2563eb',
            background: '#3b82f6',
            color: '#fff',
            borderRadius: 8,
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="currentColor"
            />
            <path
              d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              fill="currentColor"
            />
          </svg>
          <span>Editar</span>
        </button>
      )}
    </div>
  );
}



function CollapsibleNode({ node, collapsed, toggle, onSelect, editMode, selectedKey }: { node: NodeDef; collapsed: Record<NodeKey, boolean>; toggle: (key: NodeKey) => void; onSelect: (key: NodeKey) => void; editMode: boolean; selectedKey?: NodeKey; }) {
  const hasChildren = (node.children?.length ?? 0) > 0; const isCollapsed = collapsed[node.key] ?? false;
  const label = (<NodeLabel node={node} hasChildren={hasChildren} isCollapsed={isCollapsed} onToggle={() => toggle(node.key)} onEditClick={() => onSelect(node.key)} editMode={editMode} selected={selectedKey === node.key} />);
  if (!hasChildren) return <TreeNode label={label} />; if (isCollapsed) return <TreeNode label={label} />;
  return (
    <TreeNode label={label}>
      {node.children!.map((child) => (<CollapsibleNode key={child.key} node={child} collapsed={collapsed} toggle={toggle} onSelect={onSelect} editMode={editMode} selectedKey={selectedKey} />))}
    </TreeNode>
  );
}

function VerticalNode({ node, level, collapsed, toggle, onSelect, editMode, selectedKey }: { node: NodeDef; level: number; collapsed: Record<NodeKey, boolean>; toggle: (key: NodeKey) => void; onSelect: (key: NodeKey) => void; editMode: boolean; selectedKey?: NodeKey; }) {
  const hasChildren = (node.children?.length ?? 0) > 0; const isCollapsed = collapsed[node.key] ?? false;
  return (
    <div style={{ marginLeft: level * 18, position: "relative" }}>
      {level > 0 && (<div style={{ position: "absolute", left: -10, top: 0, bottom: 0, borderLeft: "2px solid #334155" }} />)}
      <NodeLabel node={node} hasChildren={hasChildren} isCollapsed={isCollapsed} onToggle={() => toggle(node.key)} onEditClick={() => onSelect(node.key)} editMode={editMode} selected={selectedKey === node.key} />
      {!isCollapsed && hasChildren && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {node.children!.map((c) => (<VerticalNode key={c.key} node={c} level={level + 1} collapsed={collapsed} toggle={toggle} onSelect={onSelect} editMode={editMode} selectedKey={selectedKey} />))}
        </div>
      )}
    </div>
  );
}

function LeftRightNode({ node, level, collapsed, toggle, onSelect, editMode, selectedKey }: { node: NodeDef; level: number; collapsed: Record<NodeKey, boolean>; toggle: (key: NodeKey) => void; onSelect: (key: NodeKey) => void; editMode: boolean; selectedKey?: NodeKey; }) {
  const COLUMN_GAP = 28; const hasChildren = (node.children?.length ?? 0) > 0; const isCollapsed = collapsed[node.key] ?? false;
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <NodeLabel node={node} hasChildren={hasChildren} isCollapsed={isCollapsed} onToggle={() => toggle(node.key)} onEditClick={() => onSelect(node.key)} editMode={editMode} selected={selectedKey === node.key} />
      {!isCollapsed && hasChildren && (
        <div style={{ display: "flex", marginLeft: COLUMN_GAP, position: "relative" }}>
          <div style={{ position: "absolute", left: -Math.floor(COLUMN_GAP / 2), top: 14, bottom: 14, borderLeft: "2px solid #334155" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {node.children!.map((child) => (
              <div key={child.key} style={{ display: "flex", alignItems: "flex-start" }}>
                <div style={{ width: Math.floor(COLUMN_GAP / 2), borderTop: "2px solid #334155", marginTop: 14, marginRight: Math.floor(COLUMN_GAP / 2) }} />
                <LeftRightNode node={child} level={level + 1} collapsed={collapsed} toggle={toggle} onSelect={onSelect} editMode={editMode} selectedKey={selectedKey} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// ===== IA local: tipos, parser, executor e painel =====
type AIOp =
  | { op: 'rename'; key: string; label: string }
  | { op: 'add'; parent: string; label: string }
  | { op: 'remove'; key: string }
  | { op: 'move'; key: string; newParent: string }
  | { op: 'addDoc'; key: string; doc: string }
  | { op: 'generateTree'; description?: string };

//type ChatMsg = { role: 'user' | 'assistant' | 'system'; content: string };
type ChatMsg = { role: "user" | "assistant"; content: string };

//const [messages, setMessages] = useState<ChatMsg[]>([]);

function summarizeOps(ops: AIOp[]) {
  return ops.map((o, i) => {
    switch (o.op) {
      case 'rename': return (i+1) + '. Renomear ' + o.key + ' → "' + o.label + '"';
      case 'add': return (i+1) + '. Adicionar filho em ' + o.parent + ': "' + o.label + '"';
      case 'remove': return (i+1) + '. Remover ' + o.key;
      case 'move': return (i+1) + '. Mover ' + o.key + ' para ' + o.newParent;
      case 'addDoc': return (i+1) + '. Vincular doc em ' + o.key + ': ' + o.doc;
      case 'generateTree': return (i+1) + '. Gerar nova EAP' + (o.description ? (' ("' + o.description + '")') : '');
    }
  }).join('\n');
}

// Comandos aceitos (um por linha):
// renomear 3.P.1 para Projeto I&C revisado
// mover 2.K.1 para 2.M
// adicionar filho em 4.L: Relatório de segurança
// remover 1.C.1
// documento 1.P.1 https://minha.url/doc.pdf
// gerar eap Microrreator de pesquisa 50kW
function parseToOps(input: string): AIOp[] {
  const ops: AIOp[] = [];
  const lines = input.split(/\n|;+/).map(s => s.trim()).filter(Boolean);
  for (const line of lines) {
    const low = line.toLowerCase();
    let m = line.match(/^renome(ar|ia|ie)?\s+([\w\.]+)\s+para\s+(.+)$/i);
    if (m) { ops.push({ op: 'rename', key: m[2], label: m[3] }); continue; }
    m = line.match(/^mover\s+([\w\.]+)\s+para\s+([\w\.]+)$/i);
    if (m) { ops.push({ op: 'move', key: m[1], newParent: m[2] }); continue; }
    m = line.match(/^adicion(ar|e)?\s+filho\s+em\s+([\w\.]+)\s*[:\-]\s*(.+)$/i);
    if (m) { ops.push({ op: 'add', parent: m[2], label: m[3] }); continue; }
    m = line.match(/^remover\s+([\w\.]+)$/i);
    if (m) { ops.push({ op: 'remove', key: m[1] }); continue; }
    m = line.match(/^documento\s+([\w\.]+)\s+(.+)$/i);
    if (m) { ops.push({ op: 'addDoc', key: m[1], doc: m[2] }); continue; }
    if (/^gerar\s+eap/.test(low)) {
      const desc = line.replace(/^gerar\s+eap\s*/i, '').trim();
      ops.push({ op: 'generateTree', description: desc || undefined });
      continue;
    }
  }
  return ops;
}

function applyOpsToTree(root: NodeDef, ops: AIOp[]): NodeDef {
  let t = cloneTree(root);

  const doAdd = (parentKey: string, label: string) => {
    const path = findPath(t, parentKey); if (!path) return;
    const { node } = getByPath(t, path); node.children = node.children ?? [];
    const seq = (node.children?.length ?? 0) + 1;
    const newKey = parentKey === 'root' ? String(seq) : (parentKey + '.' + seq);
    node.children.push({ key: newKey, label: label, docs: [] });
  };
  const doRemove = (key: string) => {
    if (key === 'root') return; const path = findPath(t, key); if (!path) return;
    const parentPath = path.slice(0, -1);
    const { node: parent } = getByPath(t, parentPath);
    if (!parent.children) return;
    parent.children = parent.children.filter(c => c.key !== key);
  };
  const doRename = (key: string, label: string) => { walkTree(t, (n) => { if (n.key === key) n.label = label; }); };
  const doMove = (key: string, newParent: string) => {
    if (key === 'root') return;
    const srcPath = findPath(t, key); const dstPath = findPath(t, newParent);
    if (!srcPath || !dstPath) return;
    const parentPath = srcPath.slice(0, -1);
    const parent = getByPath(t, parentPath).node;
    const idx = parent.children?.findIndex(c => c.key === key) ?? -1;
    if (!parent.children || idx < 0) return;
    const [item] = parent.children.splice(idx, 1);
    const dst = getByPath(t, dstPath).node; dst.children = dst.children ?? []; dst.children.push(item);
  };
  const doAddDoc = (key: string, doc: string) => { walkTree(t, (n) => { if (n.key === key) { n.docs = n.docs ?? []; n.docs.push(doc); } }); };
  const doGenerate = (description?: string) => {
    const title = description ? ('PROJETO: ' + description) : 'PROJETO: Microrreator Nuclear';
    t = initialTree();
    t.label = title;
  };

  for (const op of ops) {
    switch (op.op) {
      case 'add': doAdd(op.parent, op.label); break;
      case 'remove': doRemove(op.key); break;
      case 'rename': doRename(op.key, op.label); break;
      case 'move': doMove(op.key, op.newParent); break;
      case 'addDoc': doAddDoc(op.key, op.doc); break;
      case 'generateTree': doGenerate(op.description); break;
    }
  }
  return t;
}

function makeHeuristicTips(root: NodeDef): string[] {
  const tips: string[] = [];
  (root.children ?? []).forEach(sec => {
    const levelKeys = new Set((sec.children ?? []).map(c => c.key.split('.').slice(0,2).join('.')));
    const expected = ['A','P','C','L','M','K'].map(ch => sec.key + '.' + ch);
    const missing = expected.filter(k => !levelKeys.has(k));
    if (missing.length) tips.push('Bloco ' + sec.key + ' parece sem as disciplinas: ' + missing.map(k=>k.split('.').pop()).join(', '));
  });
  walkTree(root, (n) => {
    if (!n.children?.length && (n.docs?.length ?? 0) === 0 && n.key !== 'root') {
      tips.push('Considere anexar "Documentos associados" ao item ' + n.key + ' – "' + n.label + '"');
    }
  });
  return tips.slice(0, 8);
}

// === Helper para IA online (server) ===
async function runOnline(
  prompt: string,
  tree: NodeDef
): Promise<{ ops?: AIOp[]; tips?: string[]; message?: string }> {
  const url =
    (import.meta as any).env?.VITE_AI_ENDPOINT || "http://localhost:8787/ai/ops";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, tree }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}


function AssistantPanel({
  open,
  onClose,
  messages,
  //setMessages,
  onAsk,
}: {
  open: boolean;
  onClose: () => void;
  messages: ChatMsg[];
  setMessages: (m: ChatMsg[]) => void;
  onAsk: (text: string) => void;
}) {
  const [input, setInput] = React.useState("");

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    right: 12,
    bottom: 12,
    width: 420,
    maxHeight: "70vh",
    display: open ? "flex" : "none",
    flexDirection: "column",
    border: "1px solid #334155",
    borderRadius: 12,
    background: "#0b1220",
    color: "#e5e7eb",
    zIndex: 1200,
  };
  const headerStyle: React.CSSProperties = {
    padding: 10,
    borderBottom: "1px solid #334155",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };
  const bodyStyle: React.CSSProperties = {
    padding: 10,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };
  const footerStyle: React.CSSProperties = { padding: 10, display: "flex", gap: 6 };

  function send() {
    const text = input.trim();
    if (!text) return;
    //setMessages((m) => m.concat([{ role: "user", content: text }]));
    //setAiMessages((prev) => prev.concat([{ role: "user", content: text }]));
    onAsk(text);
    setInput("");
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <strong>Assistente IA</strong>
        <button style={{ ...btn, padding: "4px 8px" }} onClick={onClose}>
          Fechar
        </button>
      </div>
      <div style={bodyStyle}>
        {messages.length === 0 && (
          <div style={{ opacity: 0.85, fontSize: 13 }}>
            Exemplos:
            <br />
            • <code>renomear 3.P.1 para Projeto I&amp;C revisado</code>
            <br />
            • <code>mover 2.K.1 para 2.M</code>
            <br />
            • <code>adicionar filho em 4.L: Relatório de segurança</code>
            <br />
            • <code>remover 1.C.1</code>
            <br />
            • <code>documento 1.P.1 https://minha.url/doc.pdf</code>
            <br />
            • <code>gerar eap Microrreator de pesquisa 50kW</code>
            <br />
            • <code>/online reorganize a EAP para foco em licenciamento</code>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              background: m.role === "user" ? "#1f2937" : "#111827",
              border: "1px solid #334155",
              borderRadius: 8,
              padding: 8,
              maxWidth: "90%",
            }}
          >
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              {m.role === "user" ? "Você" : "Assistente"}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
          </div>
        ))}
      </div>
      <div style={footerStyle}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && !ev.shiftKey) {
              ev.preventDefault();
              send();
            }
          }}
          placeholder="Digite um comando… (/online para IA online)"
          style={{
            flex: 1,
            padding: 8,
            border: "1px solid #475569",
            borderRadius: 8,
            background: "#0f172a",
            color: "#e5e7eb",
          }}
        />
        <button style={btn} onClick={send}>
          Enviar
        </button>
      </div>
    </div>
  );
}

/*** COMPONENTE PRINCIPAL ***/

export default function EAPMicroReatorDisciplinas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState<"horizontal" | "vertical" | "leftRight" | "topDown">("leftRight");
  const [filterTopLevelKey, setFilterTopLevelKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<NodeKey, boolean>>({});
  const [slidesMode, setSlidesMode] = useState<"leftRight" | "vertical">("leftRight");
  const [editMode, setEditMode] = useState<boolean>(false);
  const [selectedKey, setSelectedKey] = useState<NodeKey | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [tree, setTree] = useState<NodeDef>(() => loadFromStorage() ?? initialTree());
  const [aiOpen, setAiOpen] = useState<boolean>(false);
  const [aiMessages, setAiMessages] = useState<ChatMsg[]>([]);
  const [aiMode, setAiMode] = useState<'offline' | 'online'>('offline');
  // --- Histórico (Desfazer/Refazer) ---
  const MAX_HISTORY = 50;
  const [past, setPast] = useState<NodeDef[]>([]);
  const [future, setFuture] = useState<NodeDef[]>([]);

  // Sempre use este helper quando a árvore mudar por uma ação do usuário/IA
  function commitTree(next: NodeDef) {
    setPast(p => {
      const np = [...p, cloneTree(tree)];
      if (np.length > MAX_HISTORY) np.shift();
      return np;
    });
    setFuture([]);                 // nova ação invalida o "refazer"
    setTree(cloneTree(next));      // guarda snapshot imutável
  }

  function undo() {
    setPast(p => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture(f => [cloneTree(tree), ...f]);
      setTree(cloneTree(prev));
      return p.slice(0, -1);
    });
  }

  function redo() {
    setFuture(f => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast(p => [...p, cloneTree(tree)]);
      setTree(cloneTree(next));
      return f.slice(1);
    });
  }

 
  // --- Handler unificado para a IA (comandos locais -> fallback online)
  const handleAiAsk = async (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;

    // 0) exibe a pergunta do usuário
    setAiMessages((m) => m.concat([{ role: "user", content: prompt }]));

    // 1) tenta interpretar como comandos locais
    const ops = parseToOps(prompt);
    if (ops.length) {
      const ack = "Vou aplicar:\n" + summarizeOps(ops);
      setAiMessages((m) => m.concat([{ role: "assistant", content: ack }]));

      const newTree = applyOpsToTree(tree, ops);
      commitTree(newTree);
      

      const tips = makeHeuristicTips(newTree);
      if (tips.length) {
        setAiMessages((m) =>
          m.concat([
            {
              role: "assistant",
              content: "Sugestões após alterações:\n- " + tips.join("\n- "),
            },
          ])
        );
      }
      return;
    }

    // 2) se não for comando, consulta a IA online
    setAiMessages((m) =>
      m.concat([{ role: "assistant", content: "Pensando… (assistente online)" }])
    );
    try {
      //const { reply, ops: remoteOps, tips } = await runOnline(prompt, tree);
      const { message: reply, ops: remoteOps, tips } = await runOnline(prompt, tree);
      if (reply && reply.trim()) {
        setAiMessages(m => m.concat([{ role: 'assistant', content: reply }]));
      }
    
      if (remoteOps?.length) {
        const ack = "Aplicando alterações do assistente:\n" + summarizeOps(remoteOps);
        setAiMessages(m => m.concat([{ role: "assistant", content: ack }]));
    
        const newTree = applyOpsToTree(tree, remoteOps);
        commitTree(newTree);

    
        const autoTips = makeHeuristicTips(newTree);
        const allTips = (tips ?? []).concat(autoTips);
        if (allTips.length) {
          setAiMessages(m =>
            m.concat([{ role: "assistant", content: "Dicas:\n- " + allTips.join("\n- ") }])
          );
        }
      } else if (!reply?.trim()) {
        setAiMessages(m =>
          m.concat([{ role: "assistant", content: "Não recebi operações válidas. Tente detalhar melhor o pedido." }])
        );
      }
    } catch (err: any) {
      setAiMessages(m =>
        m.concat([{ role: "assistant", content: `Falha na IA online: ${err?.message || String(err)}` }])
      );
    }    
  };


  /** Persistência automática */
  useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    // Evita atalhos globais enquanto digita em campos de texto ou no painel de edição
    const ae = (document.activeElement as HTMLElement) || (e.target as HTMLElement | null);
    const typing = !!ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (typeof ae.closest === 'function' && !!ae.closest('[data-edit-panel="true"]')));
    if (typing) return;

        // Desfazer / Refazer
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault(); undo(); return;
    }
    if ((e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault(); redo(); return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveJson(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") { e.preventDefault(); triggerLoadJson(); return; }
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const k = e.key;
      if (k.toLowerCase() === "p") { e.preventDefault(); exportPdf(); return; }
      if (k.toLowerCase() === "g") { e.preventDefault(); exportPng(); return; }
      if (k.toLowerCase() === "d") { e.preventDefault(); exportDocx(); return; }
      if (k.toLowerCase() === "e") { e.preventDefault(); setEditMode((v) => !v); return; }
      if (k.toLowerCase() === "x") { e.preventDefault(); expandAll(); return; }
      if (k.toLowerCase() === "c") { e.preventDefault(); collapseAll(); return; }
      if (k === "Escape") { e.preventDefault(); setSidebarOpen(false); return; }
      // Remoção de nó: apenas com Delete; Backspace nunca remove
      if (k === "Delete") { if (selectedKey) { e.preventDefault(); removeNode(selectedKey); } return; }
      if (k === "Backspace") { return; }
      if (k.toLowerCase() === "a") { if (selectedKey) { e.preventDefault(); addChild(selectedKey); } return; }
      if (k === "ArrowUp") { if (selectedKey) { e.preventDefault(); moveNode(selectedKey, -1); } return; }
      if (k === "ArrowDown") { if (selectedKey) { e.preventDefault(); moveNode(selectedKey, 1); } return; }
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [selectedKey, tree]);

  function loadFromStorage(): NodeDef | null { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return null; return JSON.parse(raw); } catch { return null; } }

  function initialTree(): NodeDef {
    const t: NodeDef = {
      key: "root",
      label: "PROJETO: Microrreator Nuclear",
      bg: COLORS.rootBg, fg: COLORS.rootFg,
      children: [
        { key: "1", label: "1 Unidade Crítica (UCRI) — (UDT-1)", bg: COLORS.ucBg, children: disciplinas("1", [
          { key: "1.A.1", label: "1.A.1 Aquisições da UCri (equipamentos, instrumentos, serviços)", docs: [] },
          { key: "1.P.1", label: "1.P.1 Projetos: neutrônico, mecânico, vareta combustível, I&C", docs: [] },
          { key: "1.P.2", label: "1.P.2 Planejamento e especificação das rotinas experimentais da UCri", docs: [] },
          { key: "1.C.1", label: "1.C.1 Adequações físicas mínimas / infraestrutura de apoio à UCri (se aplicável)", docs: [] },
          { key: "1.L.1", label: "1.L.1 Submissão e aprovação das rotinas experimentais junto à Autoridade Nuclear (AN)", docs: [] },
          { key: "1.M.1", label: "1.M.1 Montagem/instalação de instrumentos e arranjos de ensaio da UCri", docs: [] },
          { key: "1.K.1", label: "1.K.1 Execução das rotinas experimentais e registros de comissionamento da UCri", docs: [] },
        ])},
        { key: "2", label: "2 Bancadas Experimentais da UDT-2 (Efeito Separado) — (UDT-2)", bg: COLORS.udt2Bg, children: disciplinas("2", [
          { key: "2.A.1", label: "2.A.1 Aquisição de equipamentos, instrumentos, componentes e materiais (UDT-2)", docs: [] },
          { key: "2.P.1", label: "2.P.1 Projetos: mecânico, I&C, proteção das bancadas de efeito separado", docs: [] },
          { key: "2.P.2", label: "2.P.2 Preparação/planejamento de rotinas experimentais (UDT-2)", docs: [] },
          { key: "2.C.1", label: "2.C.1 Construção das bancadas de efeito separado (UDT-2)", docs: [] },
          { key: "2.L.1", label: "2.L.1 Submissão e aprovação das rotinas junto à AN (UDT-2)", docs: [] },
          { key: "2.M.1", label: "2.M.1 Montagem e integração dos sistemas das bancadas (UDT-2)", docs: [] },
          { key: "2.K.1", label: "2.K.1 Comissionamento e execução dos experimentos de efeito separado (UDT-2)", docs: [] },
        ])},
        { key: "3", label: "3 Bancadas Experimentais da UDT-3 (Efeito Integrado) — (UDT-3)", bg: COLORS.udt3Bg, children: disciplinas("3", [
          { key: "3.A.1", label: "3.A.1 Aquisição de equipamentos/instrumentos para efeito integrado (UDT-3) e itens conjuntos UDT-2/UDT-3", docs: [] },
          { key: "3.P.1", label: "3.P.1 Projetos da bancada de transferência de calor (efeito integrado): mecânico, I&C, proteção", docs: [] },
          { key: "3.P.2", label: "3.P.2 Planejamento/roteiros experimentais (UDT-3)", docs: [] },
          { key: "3.C.1", label: "3.C.1 Construção das bancadas de efeito integrado (UDT-3)", docs: [] },
          { key: "3.L.1", label: "3.L.1 Submissão e aprovação das rotinas junto à AN (UDT-3)", docs: [] },
          { key: "3.M.1", label: "3.M.1 Montagem e integração dos sistemas das bancadas (UDT-3)", docs: [] },
          { key: "3.K.1", label: "3.K.1 Comissionamento e execução dos experimentos de efeito integrado (UDT-3)", docs: [] },
        ])},
        { key: "4", label: "4 Sistema de Proteção e Controle e Supervisão Remota — (UDT-4)", bg: COLORS.spcBg, children: disciplinas("4", [
          { key: "4.A.1", label: "4.A.1 Aquisições para o sistema de proteção/controle e supervisão remota", docs: [] },
          { key: "4.P.1", label: "4.P.1 Projeto do sistema de proteção e controle da UCri", docs: [] },
          { key: "4.P.2", label: "4.P.2 Concepção do sistema de supervisão remota para atuação com fontes renováveis em micro-redes", docs: [] },
          { key: "4.C.1", label: "4.C.1 Desenvolvimento/integração de hardware e software de proteção/controle", docs: [] },
          { key: "4.L.1", label: "4.L.1 Evidências/relatórios para licenciamento dos sistemas de proteção/controle (se aplicável)", docs: [] },
          { key: "4.M.1", label: "4.M.1 Montagem/instalação e integração do sistema à mesa de controle do Argonauta", docs: [] },
          { key: "4.K.1", label: "4.K.1 Testes e comissionamento do sistema de proteção/controle e supervisão remota", docs: [] },
        ])},
        { key: "5", label: "5 Microrreator e Análises Estruturais — (DRBC)", bg: COLORS.mrBg, children: disciplinas("5", [
          { key: "5.A.1", label: "5.A.1 Aquisições para blindagem/contensão e ensaios", docs: [] },
          { key: "5.P.1", label: "5.P.1 Projeto de blindagem (gama/nêutrons) do microrreator", docs: [] },
          { key: "5.P.2", label: "5.P.2 Projeto mecânico & instrumentação da contenção com funções de blindagem/contensão", docs: [] },
          { key: "5.P.3", label: "5.P.3 Análise termo-estrutural do microrreator em cenários operacionais", docs: [] },
          { key: "5.C.1", label: "5.C.1 Protótipos/maquetes e preparações para ensaios estruturais", docs: [] },
          { key: "5.L.1", label: "5.L.1 Evidências técnicas de segurança para licenciamento (blindagem/contensão)", docs: [] },
          { key: "5.M.1", label: "5.M.1 Montagem de arranjos e instrumentação para validações", docs: [] },
          { key: "5.K.1", label: "5.K.1 Testes de aceitação/validação termo-estrutural", docs: [] },
        ])},
        { key: "6", label: "6 Desenvolvimento dos Processos de Materiais — (DMAT)", bg: COLORS.matBg, children: disciplinas("6", [
          { key: "6.A.1", label: "6.A.1 Aquisição de equipamentos/serviços/consumíveis para desenvolvimento de heat pipes", docs: [] },
          { key: "6.P.1", label: "6.P.1 Desenvolvimento de materiais: BeO, grafita e B4C nuclearmente puro", docs: [] },
          { key: "6.P.2", label: "6.P.2 Desenvolvimento para obtenção de heat pipes aplicáveis a microrreatores", docs: [] },
          { key: "6.P.3", label: "6.P.3 Desenvolvimento para obtenção de pastilhas de UO₂ até 20 mm", docs: [] },
          { key: "6.C.1", label: "6.C.1 Montagem de linhas piloto e dispositivos de processo para DMAT", docs: [] },
          { key: "6.L.1", label: "6.L.1 Autorizações e controles regulatórios para materiais nucleares (quando aplicável)", docs: [] },
          { key: "6.M.1", label: "6.M.1 Montagem/integração de equipamentos de processo (DMAT)", docs: [] },
          { key: "6.K.1", label: "6.K.1 Comissionamento/qualificação de processo de materiais (DMAT)", docs: [] },
        ])},
        { key: "7", label: "7 Inserção e Sustentabilidade Socioambiental — (SUST)", bg: COLORS.susBg, children: disciplinas("7", [
          { key: "7.A.1", label: "7.A.1 Aquisições para estudos/dados de inserção e sustentabilidade", docs: [] },
          { key: "7.P.1", label: "7.P.1 Inserção na rede elétrica e em cidades < 20 mil hab.; planejamento de RDEE", docs: [] },
          { key: "7.P.2", label: "7.P.2 Inserção em indústrias/serviços intensivos em eletricidade e estações de recarga", docs: [] },
          { key: "7.P.3", label: "7.P.3 Interação com fontes renováveis e qualidade de energia", docs: [] },
          { key: "7.P.4", label: "7.P.4 Avaliação de sustentabilidade socioambiental/econômica; locais; cenários regulatórios/políticas públicas", docs: [] },
          { key: "7.P.5", label: "7.P.5 Contribuição dos microrreatores para redução de rejeitos de longa duração", docs: [] },
          { key: "7.C.1", label: "7.C.1 Infraestruturas mínimas para pilotos/demonstrações (se aplicável)", docs: [] },
          { key: "7.L.1", label: "7.L.1 Estudos/relatórios para interfaces regulatórias e socioambientais", docs: [] },
          { key: "7.M.1", label: "7.M.1 Preparação logística/instalação de pilotos (se aplicável)", docs: [] },
          { key: "7.K.1", label: "7.K.1 Comissionamento/validação de pilotos (se aplicável)", docs: [] },
        ])},
        { key: "8", label: "8 Sistema de Garantia da Qualidade (SGG)", bg: COLORS.qmsBg, children: disciplinas("8", [
          { key: "8.A.1", label: "8.A.1 Aquisição/contratação de ferramentas/serviços de gestão documental (GED)", docs: [] },
          { key: "8.P.1", label: "8.P.1 Implementação do Sistema de Qualidade (PGQ, planos e procedimentos)", docs: [] },
          { key: "8.P.2", label: "8.P.2 Estruturação do arquivo técnico (proponente, coexecutoras, ICTs, contratadas)", docs: [] },
          { key: "8.C.1", label: "8.C.1 Implantação de rotinas de controle, registros e indicadores", docs: [] },
          { key: "8.L.1", label: "8.L.1 Relatórios CNEN, auditorias e verificações de conformidade", docs: [] },
          { key: "8.M.1", label: "8.M.1 Montagem/organização inicial do repositório e taxonomia documental", docs: [] },
          { key: "8.K.1", label: "8.K.1 Encerramento documental e lições aprendidas", docs: [] },
        ])},
      ],
    };
    return t;
  }

  function blankTree(): NodeDef {
    return {
      key: "root",
      label: "PROJETO: (sem título)",
      bg: COLORS.rootBg,
      fg: COLORS.rootFg,
      children: [],
    };
  }


  /** Operações de Edição **/
  const updateLabel = (key: NodeKey, newLabel: string) => {
    const next = cloneTree(tree);
    walkTree(next, (n) => { if (n.key === key) n.label = newLabel; });
    commitTree(next);
  };
  
  const updateBg = (key: NodeKey, newBg?: string) => {
    const next = cloneTree(tree);
    const normalized = normalizeHexColor(newBg);
    walkTree(next, (n) => { if (n.key === key) n.bg = normalized; });
    commitTree(next);
  };
  

  const addChild = (parentKey: NodeKey) => {
    const next = cloneTree(tree);
    const path = findPath(next, parentKey);
    if (!path) return;
    const { node } = getByPath(next, path);
    node.children = node.children ?? [];
    const seq = (node.children?.length ?? 0) + 1;
    const newKey = `${parentKey}.${seq}` as NodeKey;
    node.children.push({ key: newKey, label: `${newKey} Novo item`, docs: [] });
    commitTree(next);
  };
  
  const removeNode = (key: NodeKey) => {
    if (key === "root") return;
    const next = cloneTree(tree);
    const path = findPath(next, key);
    if (!path) return;
    const parentPath = path.slice(0, -1);
    const { node: parent } = getByPath(next, parentPath);
    if (!parent.children) return;
    parent.children = parent.children.filter((c) => c.key !== key);
    commitTree(next);
  };
  
  const moveNode = (key: NodeKey, dir: -1 | 1) => {
    if (key === "root") return;
    const next = cloneTree(tree);
    const path = findPath(next, key);
    if (!path) return;
    const parentPath = path.slice(0, -1);
    const { node: _parent, index } = getByPath(next, path);
    const p = getByPath(next, parentPath).node;
    if (!p.children || index == null || index < 0) return;
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= p.children.length) return;
    const [item] = p.children.splice(index, 1);
    p.children.splice(newIdx, 0, item);
    commitTree(next);
  };
  

  /** Documentos associados **/
  const addDoc = (key: NodeKey, doc: string) => {
    if (!doc.trim()) return;
    const next = cloneTree(tree);
    walkTree(next, (n) => {
      if (n.key === key) { n.docs = n.docs ?? []; n.docs.push(doc.trim()); }
    });
    commitTree(next);
  };
  
  const removeDoc = (key: NodeKey, idx: number) => {
    const next = cloneTree(tree);
    walkTree(next, (n) => {
      if (n.key === key && n.docs) n.docs.splice(idx, 1);
    });
    commitTree(next);
  };
  

  /** Salvar / Carregar JSON **/
  const saveJson = () => { const blob = new Blob([JSON.stringify(tree, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `EAP_Microrreator_disciplinas_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); };
  const triggerLoadJson = () => { fileInputRef.current?.click(); };
  const onLoadJsonFile = (ev: React.ChangeEvent<HTMLInputElement>) => { const file = ev.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const obj = JSON.parse(String(reader.result)); setTree(obj); setCollapsed({}); } catch { alert("JSON inválido"); } }; reader.readAsText(file); ev.target.value = ""; };
  const resetStorage = () => { try { localStorage.removeItem(STORAGE_KEY); setTree(initialTree()); setCollapsed({}); setSelectedKey(undefined); } catch {} };
  const newEap = () => {
  const ok = confirm("Criar uma nova EAP vazia? Isso não apaga arquivos salvos no seu disco, apenas substitui a EAP atual na tela.");
  if (!ok) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  setTree(blankTree());
  setCollapsed({});
  setSelectedKey(undefined);
};


  /** Expand/Collapse **/
  const toggle = (key: NodeKey) => setCollapsed((s) => ({ ...s, [key]: !(s[key] ?? false) }));
  const expandAll = () => { const all: Record<NodeKey, boolean> = {}; const w = (n: NodeDef) => { all[n.key] = false; n.children?.forEach(w); }; w(tree); setCollapsed(all); };
  const collapseAll = () => { const all: Record<NodeKey, boolean> = {}; const w = (n: NodeDef) => { all[n.key] = true; n.children?.forEach(w); }; w(tree); all[tree.key] = false; setCollapsed(all); };

// Gera um PNG da EAP em "visão geral" (layout fixo, sem filtro, tudo expandido)
// sem alterar permanentemente o estado que o usuário está vendo.
const exportSnapshotPng = async (): Promise<string | null> => {
  if (!containerRef.current) return null;

  // 1) Guardar estado atual da UI
  const prevLayout = layout;
  const prevFilter = filterTopLevelKey;
  const prevCollapsed = { ...collapsed };

  try {
    // 2) Forçar visão geral: layout padrão, sem filtro, tudo expandido
    setLayout("leftRight");          // ou o layout que você considerar "geral"
    setFilterTopLevelKey(null);

    const all: Record<NodeKey, boolean> = {};
    const w = (n: NodeDef) => {
      all[n.key] = false;            // false = não colapsado
      n.children?.forEach(w);
    };
    w(tree);
    setCollapsed(all);

    // 3) Esperar a renderização
    await waitNextFrame();

    // 4) Capturar com fundo branco pra não ficar preto em lugar nenhum
    const dataUrl = await toPng(containerRef.current, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#ffffff",
    });

    return dataUrl;
  } finally {
    // 5) Restaurar a tela exatamente como estava
    setLayout(prevLayout);
    setFilterTopLevelKey(prevFilter);
    setCollapsed(prevCollapsed);
    await waitNextFrame();
  }
};


  /** Export PNG/PDF/PPTX **/
  const exportPng = async () => {
    const dataUrl = await exportSnapshotPng();
    if (!dataUrl) return;
  
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "EAP_Microrreator_disciplinas.png";
    link.click();
  };
  
  const exportPdf = async () => {
    const dataUrl = await exportSnapshotPng();
    if (!dataUrl) return;
  
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });
  
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
  
    const img = new Image();
    img.src = dataUrl;
    await new Promise((res) => (img.onload = res));
  
    const pxToMm = (px: number) => (px * 25.4) / 96;
    const w = pxToMm((img as any).naturalWidth);
    const h = pxToMm((img as any).naturalHeight);
  
    const margin = 10;
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin * 2;
    const scale = Math.min(maxW / w, maxH / h);
  
    const renderW = w * scale;
    const renderH = h * scale;
    const x = (pageWidth - renderW) / 2;
    const y = (pageHeight - renderH) / 2;
  
    pdf.addImage(dataUrl, "PNG", x, y, renderW, renderH);
    pdf.save("EAP_Microrreator_disciplinas.pdf");
  };
  
  const exportSlidesPptx = async () => {
    const pptx = new PptxGenJS();
  
    // Layout PPTX (igual ao que você já usava)
    let slideW = 10;
    let slideH = 5.625;
    if (slidesMode === "vertical") {
      pptx.defineLayout({ name: "A4P", width: 8.27, height: 11.69 });
      pptx.layout = "A4P";
      slideW = 8.27;
      slideH = 11.69;
    } else {
      pptx.layout = "LAYOUT_16x9";
    }
  
    const marginX = 0.4;
    const marginTop = 0.9;
    const marginBottom = 0.4;
    const boxW = slideW - marginX * 2;
    const boxH = slideH - marginTop - marginBottom;
  
    const addTitle = (slide: any, text: string) => {
      slide.addText(text, {
        x: marginX,
        y: 0.3,
        w: slideW - marginX * 2,
        fontSize: slidesMode === "vertical" ? 22 : 24,
        bold: true,
        color: "20252b",
      });
    };
  
    const addBreadcrumb = (slide: any, breadcrumb: string) => {
      if (!breadcrumb) return;
      slide.addText(breadcrumb, {
        x: marginX,
        y: 0.7,
        w: slideW - marginX * 2,
        fontSize: 12,
        color: "6b7280",
      });
    };
  
    const addContainedImage = async (slide: any, dataUrl: string) => {
      const pxToIn = (px: number) => px / 96;
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res) => (img.onload = res));
      const imgW = pxToIn((img as any).naturalWidth);
      const imgH = pxToIn((img as any).naturalHeight);
      const scale = Math.min(boxW / imgW, boxH / imgH);
      const renderW = imgW * scale;
      const renderH = imgH * scale;
      const x = marginX + (boxW - renderW) / 2;
      const y = marginTop + (boxH - renderH) / 2;
      slide.addImage({ data: dataUrl, x, y, w: renderW, h: renderH });
    };
  
    // 🔹 Helper para capturar o PNG com tempo suficiente de renderização
    const renderCurrentPng = async (): Promise<string | null> => {
      // espera o React aplicar os setState
      await waitNextFrame();
      // mais um pequeno delay para garantir layout/zoom/collapse aplicados
      await new Promise((r) => setTimeout(r, 80));
  
      if (!containerRef.current) return null;
  
      return await toPng(containerRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff", // fundo claro para o PPTX
      });
    };
  
    // Helpers para os slides de foco
    const buildBreadcrumb = (root: NodeDef, targetKey: string): string => {
      const path = findPath(root, targetKey);
      if (!path) return "";
      const labels: string[] = [];
      let cur: NodeDef = root;
      labels.push(cur.label); // root
  
      for (let i = 1; i < path.length; i++) {
        const k = path[i];
        const child = cur.children?.find((c) => c.key === k);
        if (!child) break;
        labels.push(child.label);
        cur = child;
      }
  
      return labels.join(" → ");
    };
  
    const buildFocusTree = (root: NodeDef, parentKey: string): NodeDef => {
      const path = findPath(root, parentKey);
      if (!path) return cloneTree(root);
  
      const cloneAlongPath = (node: NodeDef, depth: number): NodeDef => {
        const isParent = depth === path.length - 1;
  
        if (isParent) {
          // No nó pai: mantemos todos os filhos (último nível expandido)
          const clonedChildren = (node.children ?? []).map((c) => cloneTree(c));
          return { ...node, children: clonedChildren };
        }
  
        const nextKey = path[depth + 1];
        const child = node.children?.find((c) => c.key === nextKey);
        const clonedChild = child ? cloneAlongPath(child, depth + 1) : undefined;
        return {
          ...node,
          children: clonedChild ? [clonedChild] : [],
        };
      };
  
      // Se o pai for o próprio root
      if (path.length === 1) {
        return cloneAlongPath(root, 0);
      }
  
      const topKey = path[1]; // filho direto do root
      const topChild = root.children?.find((c) => c.key === topKey);
      if (!topChild) return cloneTree(root);
  
      const rootClone: NodeDef = { ...root, children: [] };
      const focusTop = cloneAlongPath(topChild, 1);
      rootClone.children = [focusTop];
  
      return rootClone;
    };
  
    const collectParentGroups = (root: NodeDef): { parentKey: string; label: string }[] => {
      const groups: { parentKey: string; label: string }[] = [];
      walkTree(root, (n) => {
        if (n.children && n.children.length) {
          const hasLeafChild = n.children.some(
            (c) => !c.children || c.children.length === 0
          );
          if (hasLeafChild) {
            groups.push({ parentKey: n.key, label: n.label });
          }
        }
      });
      return groups;
    };
  
    // --- Salva estado atual da UI para restaurar depois ---
    const prevLayout = layout;
    const prevCollapsed = { ...collapsed };
    const prevFilter = filterTopLevelKey;
    const prevTree = tree;
  
    try {
      // 1) Slide de capa com a EAP completa
      setLayout(slidesMode === "vertical" ? "vertical" : "leftRight");
      setFilterTopLevelKey(null);
      expandAll();
  
      const cover = await renderCurrentPng();
      if (cover) {
        const slide = pptx.addSlide();
        addTitle(slide, "EAP – Microrreator Nuclear (Disciplinas)");
        addBreadcrumb(slide, "Visão geral da estrutura completa");
        await addContainedImage(slide, cover);
      }
  
      // 2) Slides de foco por "pai de folhas"
      const groups = collectParentGroups(prevTree);
  
      for (const group of groups) {
        const focusTree = buildFocusTree(prevTree, group.parentKey);
        const breadcrumb = buildBreadcrumb(prevTree, group.parentKey);
  
        // coloca o focusTree temporariamente na tela apenas para capturar a imagem
        setTree(focusTree);
        setFilterTopLevelKey(null);
  
        // expandir tudo no focusTree
        const all: Record<NodeKey, boolean> = {};
        const w = (n: NodeDef) => {
          all[n.key] = false;
          n.children?.forEach(w);
        };
        w(focusTree);
        setCollapsed(all);
  
        const img = await renderCurrentPng();
        if (!img) continue;
  
        const slide = pptx.addSlide();
        addTitle(slide, group.label);
        addBreadcrumb(slide, breadcrumb);
        await addContainedImage(slide, img);
      }
    } finally {
      // 3) Restaura o estado original da tela
      setTree(prevTree);
      setLayout(prevLayout);
      setFilterTopLevelKey(prevFilter);
      setCollapsed(prevCollapsed);
      await waitNextFrame();
    }
  
    await pptx.writeFile({
      fileName: `EAP_Microrreator_disciplinas_slides_${slidesMode}.pptx`,
    });
  };
  

  /** Export DOCX **/
  const exportDocx = async () => {
    const docChildren: (Paragraph | Table)[] = [];
  
    // Capa
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "EAP – Microrreator Nuclear (Disciplinas)",
            bold: true,
            size: 48,
          }),
        ],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      })
    );
  
    docChildren.push(
      new Paragraph({
        text: `Gerado em ${fmtDate()}`,
        alignment: AlignmentType.CENTER,
      })
    );
  
    docChildren.push(
      new Paragraph({
        text: " ",
        spacing: { after: 400 },
      })
    );
  
    // Mapa de nível -> estilo de título
    const headingByLevel = [
      HeadingLevel.HEADING_1, // nível 0 (root: PROJETO)
      HeadingLevel.HEADING_2, // nível 1 (1, 2, 3...)
      HeadingLevel.HEADING_3, // nível 2 (1.A, 1.P...)
      HeadingLevel.HEADING_4, // nível 3 (1.A.1...)
      HeadingLevel.HEADING_5, // nível 4
      HeadingLevel.HEADING_6, // nível 5+
    ];
  
    const addNode = (n: NodeDef, level: number) => {
      const heading =
        headingByLevel[level] ??
        headingByLevel[headingByLevel.length - 1]; // níveis muito fundos usam Heading 6
  
      docChildren.push(
        new Paragraph({
          text: n.label,
          heading,
          spacing: {
            // um pouco mais de espaço quanto mais fundo
            before: level === 0 ? 240 : 200,
            after: 80,
          },
        })
      );
  
      // Tabela de documentos associados (se houver)
      if (n.docs && n.docs.length) {
        const rows: TableRow[] = [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 15, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ text: "#" })],
              }),
              new TableCell({
                width: { size: 85, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ text: "Documento / Link" })],
              }),
            ],
          }),
          ...n.docs.map(
            (d, i) =>
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph(String(i + 1))],
                  }),
                  new TableCell({
                    children: [new Paragraph(d)],
                  }),
                ],
              })
          ),
        ];
  
        docChildren.push(new Table({ rows }));
      }
  
      // Recursão para filhos
      n.children?.forEach((c) => addNode(c, level + 1));
    };
  
    // Começa do root como nível 0
    addNode(tree, 0);
  
    const doc = new DocxDocument({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 720,
                right: 720,
                bottom: 720,
                left: 720,
              },
              size: {
                orientation: PageOrientation.LANDSCAPE,
              },
            },
          },
          children: docChildren,
        },
      ],
    });
  
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EAP_Microrreator_disciplinas_${new Date()
      .toISOString()
      .slice(0, 10)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };
  

    /** Export CSV (para planilha) **/
    const exportCsv = () => {
      const rows: string[] = [];
  
      // Cabeçalho (pode trocar ; por , se preferir)
      rows.push('key;label;parent;path;level;bg;docs');
  
      const visit = (
        node: NodeDef,
        parentKey: string | null,
        path: string[],
        level: number
      ) => {
        const thisPath = [...path, node.key];
        const docsStr =
          node.docs && node.docs.length
            ? node.docs.join(' | ')
            : '';
  
        // Escapa aspas e garante string
        const safe = (v: unknown) =>
          String(v ?? '').replace(/"/g, '""');
  
        const cells = [
          node.key,
          node.label,
          parentKey ?? '',
          thisPath.join(' > '),
          String(level),
          node.bg ?? '',
          docsStr,
        ].map((v) => `"${safe(v)}"`);
  
        rows.push(cells.join(';'));
  
        node.children?.forEach((c) =>
          visit(c, node.key, thisPath, level + 1)
        );
      };
  
      visit(tree, null, [], 0);
  
      const blob = new Blob([rows.join('\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EAP_Microrreator_disciplinas_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };
  

//const AI_BASE_URL = import.meta.env.VITE_AI_URL ?? "http://localhost:8787";


  /** Listas & seleção */
  const topChildren = useMemo(() => (filterTopLevelKey ? tree.children?.filter((c) => c.key === filterTopLevelKey) ?? [] : (tree.children ?? [])), [tree, filterTopLevelKey]);
  const selectedNodePath = selectedKey ? findPath(tree, selectedKey) : null; const selectedNode = selectedNodePath ? getByPath(tree, selectedNodePath).node : undefined;

  return (
    <div style={wrap}>
      {/* Topbar apenas com o ícone */}
      <div style={topbar}>
  <button aria-label="Abrir menu" style={hamburgerBtn} onClick={() => setSidebarOpen((v) => !v)}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="7" x2="20" y2="7" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4" y1="12" x2="20" y2="12" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4" y1="17" x2="20" y2="17" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </button>
</div>

      {/* Sidebar overlay */}
      {sidebarOpen && (
  <>
    <div style={backdropStyle} onClick={() => setSidebarOpen(false)} />
    <aside style={sidebarOverlay}>
      {/* Grupo: Visualização */}
      <div style={sidebarTitle}>Visualização</div>
      <div style={sidebarGroup}>
        <button style={btn} onClick={expandAll}>Expandir tudo (X)</button>
        <button style={btn} onClick={collapseAll}>Colapsar tudo (C)</button>
        <label style={{ fontSize: 12, opacity: 0.9 }}>Layout</label>
        <select value={layout} onChange={(e) => setLayout(e.target.value as any)} style={{ padding: 6, borderRadius: 8, border: "1px solid #94A3B8", background: "#FFFFFF", color: "#0b0f19" }}>
          <option value="leftRight">Esquerda → Direita</option>
          <option value="horizontal">Horizontal (Topo ↓)</option>
          <option value="vertical">Vertical (Lista)</option>
          <option value="topDown">Top→Down (PROJETO acima)</option>
        </select>
        <label style={{ fontSize: 12, opacity: 0.9 }}>Slides</label>
        <select value={slidesMode} onChange={(e) => setSlidesMode(e.target.value as any)} style={{ padding: 6, borderRadius: 8, border: "1px solid #94A3B8", background: "#FFFFFF", color: "#0b0f19" }}>
          <option value="leftRight">Esquerda → Direita (16:9)</option>
          <option value="vertical">Vertical (A4 retrato)</option>
        </select>
        <label style={{ fontSize: 12, opacity: 0.9 }}>Edição</label>
        <button style={{ ...btn, background: editMode ? "#3b82f6" : "#E2E8F0", color: editMode ? "white" : COLORS.text }} onClick={() => setEditMode((v) => !v)}>{editMode ? "Modo edição ON (E)" : "Modo edição OFF (E)"}</button>
      </div>

      {/* Grupo: Versões */}
      <div style={sidebarTitle}>Versões</div>
      <div style={sidebarGroup}>
         <button style={{ ...btn, background: "#DCFCE7", borderColor: "#16A34A" }} onClick={newEap}>Novo</button>
	<button style={btn} onClick={saveJson}>Salvar JSON (Ctrl+S)</button>
        <button style={btn} onClick={triggerLoadJson}>Carregar JSON (Ctrl+O)</button>
        <button style={btn} onClick={undo} disabled={past.length === 0}>Desfazer (Ctrl+Z)</button>
        <button style={btn} onClick={redo} disabled={future.length === 0}>Refazer (Ctrl+Y)</button>

        <button style={{ ...btn, background: "#FEE2E2", borderColor: "#EF4444", color: "#7F1D1D" }} onClick={resetStorage}>Resetar (limpar localStorage)</button>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={onLoadJsonFile} style={{ display: "none" }} />
      </div>

      {/* Grupo: Exportações */}
      <div style={sidebarTitle}>Exportar</div>
      <div style={sidebarGroup}>
        <button style={btn} onClick={exportPng}>PNG (G)</button>
        <button style={btn} onClick={exportPdf}>PDF (P)</button>
        <button style={btn} onClick={exportSlidesPptx}>PPTX</button>
        <button style={btn} onClick={exportDocx}>DOCX (D)</button>
        <button style={btn} onClick={exportCsv}>CSV</button>
        {/* Grupo: IA */}
{/* Grupo: IA */}
<div style={sidebarTitle}>Assistente IA</div>
<div style={sidebarGroup}>
  <label style={{ fontSize: 12, opacity: 0.9 }}>Modo</label>
  <select
    value={aiMode}
    onChange={(e) => setAiMode(e.target.value as 'offline' | 'online')}
    style={{ padding: 6, borderRadius: 8, border: "1px solid #94A3B8", background: "#FFFFFF", color: "#0b0f19" }}
  >
    <option value="offline">Offline (parser local)</option>
    <option value="online">Online (modelo)</option>
  </select>

  <button
    style={{ ...btn, background: aiOpen ? '#3b82f6' : '#E2E8F0', color: aiOpen ? 'white' : COLORS.text }}
    onClick={() => setAiOpen(true)}
  >
    Abrir chat
  </button>

  <button
    style={btn}
    onClick={() => {
      const tips = makeHeuristicTips(tree).join('\n');
      const msg = tips || 'Sem sugestões no momento. A estrutura parece consistente com as disciplinas.';
      setAiMessages(aiMessages.concat([{ role: 'assistant', content: msg }]));
      setAiOpen(true);
    }}
  >
    Gerar dicas
  </button>
</div>
      </div>
    </aside>
  </>
)}

      {/* Área de trabalho com fundo escuro e zoom livre */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 44, bottom: 0, overflow: "hidden", background: COLORS.appBg }}>
        <TransformWrapper
          minScale={0.25}
          initialScale={0.9}
          wheel={{ step: 0.15 }}
          centerOnInit
          centerZoomedOut
          limitToBounds={false}
          doubleClick={{ disabled: true }}
          panning={{ velocityDisabled: true }}
        >
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%", overflow: "auto" }} contentStyle={{ overflow: "visible" }}>
            <div ref={containerRef} style={{ padding: 16, display: "inline-block", minWidth: "max-content" }}>
              {/* Caixa do root */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <div style={{ ...boxBase, background: COLORS.rootBg, color: COLORS.rootFg, cursor: "default", textAlign: "center" }}>
		{tree.label}
		{editMode && (
      		<button 
			onClick={(e) => { e.stopPropagation(); setSelectedKey("root"); }}
        		style={{ position: "absolute", right: 8, top: 6, border: "1px solid #94A3B8", background: "#fff", borderRadius: 6, padding: "2px 6px", cursor: "pointer", fontSize: 12 }}
      		>
        		Editar
      		</button>
   		 )}	
		</div>
              </div>

              {/* Renderização conforme layout */}
              {layout === "horizontal" && (
                <Tree label={<div style={{ height: 0 }} />}>
                  {topChildren.map((child) => (
                    <CollapsibleNode key={child.key} node={child} collapsed={collapsed} toggle={toggle} onSelect={setSelectedKey} editMode={editMode} selectedKey={selectedKey} />
                  ))}
                </Tree>
              )}

              {layout === "vertical" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {topChildren.map((child) => (
                    <VerticalNode key={child.key} node={child} level={1} collapsed={collapsed} toggle={toggle} onSelect={setSelectedKey} editMode={editMode} selectedKey={selectedKey} />
                  ))}
                </div>
              )}

              {layout === "topDown" && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Tree label={<div style={{ height: 0 }} />}>
                    {topChildren.map((child) => (
                      <CollapsibleNode key={child.key} node={child} collapsed={collapsed} toggle={toggle} onSelect={setSelectedKey} editMode={editMode} selectedKey={selectedKey} />
                    ))}
                  </Tree>
                </div>
              )}

              {layout === "leftRight" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {topChildren.map((child) => (
                    <LeftRightNode key={child.key} node={child} level={0} collapsed={collapsed} toggle={toggle} onSelect={setSelectedKey} editMode={editMode} selectedKey={selectedKey} />
                  ))}
                </div>
              )}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* Painel de edição flutuante (só no modo edição) */}
      {editMode && (
        <aside style={{ position: "fixed", right: 12, top: 56, width: 340, maxHeight: "calc(100vh - 72px)", overflow: "auto", border: "1px solid #334155", borderRadius: 10, padding: 12, background: "#0b1220", color: "#e5e7eb" }} data-edit-panel="true">
          <h3 style={{ marginTop: 0 }}>Edição do nó</h3>
          {!selectedNode ? (
            <p style={{ opacity: 0.85 }}>Selecione um nó e clique em <b>Editar</b> na caixa.</p>
          ) : (
            <EditPanel selectedKey={selectedKey!} node={selectedNode} updateLabel={updateLabel} updateBg={updateBg} addChild={addChild} moveNode={moveNode} removeNode={removeNode} addDoc={addDoc} removeDoc={removeDoc} />
          )}
        </aside>
      )}
          {/* Painel de IA */}
          
<AssistantPanel
  open={aiOpen}
  onClose={() => setAiOpen(false)}
  messages={aiMessages}
  setMessages={setAiMessages}
  onAsk={handleAiAsk}
/>
     
 </div>
  );
}



/* Painel de edição (com Documentos associados) */

function EditPanel({
  selectedKey,
  node,
  updateLabel,
  updateBg,
  addChild,
  moveNode,
  removeNode,
  addDoc,
  removeDoc,
}: {
  selectedKey: string;
  node: NodeDef;
  updateLabel: (k: string, v: string) => void;
  updateBg: (k: string, v?: string) => void;
  addChild: (k: string) => void;
  moveNode: (k: string, d: -1 | 1) => void;
  removeNode: (k: string) => void;
  addDoc: (k: string, d: string) => void;
  removeDoc: (k: string, i: number) => void;
}) {
  const [value, setValue] = useState("");

  // Normaliza #hex (aceita 3 ou 6 dígitos). Retorna undefined se vazio/ inválido.
  function normalizeHexColor(v?: string): string | undefined {
    if (!v) return undefined;
    let s = v.trim();
    if (!s) return undefined;
    if (s[0] !== "#") s = "#" + s;
    const ok = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
    return ok ? s : undefined;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <label style={{ display: "block", fontSize: 12, opacity: 0.85 }}>
          Chave
        </label>
        <input
          value={selectedKey}
          readOnly
          style={{
            width: "100%",
            padding: 8,
            border: "1px solid #475569",
            borderRadius: 8,
            background: "#0f172a",
            color: "#e5e7eb",
          }}
        />
      </div>

      <div>
        <label style={{ display: "block", fontSize: 12, opacity: 0.85 }}>
          Rótulo
        </label>
        <textarea
          value={node.label}
          onKeyDown={(ev) => {
            ev.stopPropagation();
          }}
          onChange={(e) => updateLabel(selectedKey, e.target.value)}
          style={{
            width: "100%",
            padding: 8,
            border: "1px solid #475569",
            borderRadius: 8,
            minHeight: 72,
            background: "#0f172a",
            color: "#e5e7eb",
          }}
        />
      </div>

      <div>
        <label style={{ display: "block", fontSize: 12, opacity: 0.85 }}>
          Cor de fundo
        </label>

        {/* O input color precisa SEMPRE de um valor válido (#rrggbb).
            Usamos normalizeHexColor para não quebrar quando a cor ainda não existe. */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="color"
            value={normalizeHexColor(node.bg) ?? "#ffffff"}
            onChange={(e) => updateBg(selectedKey, e.target.value)}
            style={{
              width: 40,
              height: 32,
              padding: 0,
              border: "1px solid #475569",
              borderRadius: 8,
              background: "#0f172a",
              cursor: "pointer",
            }}
            onKeyDown={(ev) => {
              ev.stopPropagation();
            }}
            title="Selecionar cor"
          />

          <input
            value={node.bg ?? ""}
            onChange={(e) => updateBg(selectedKey, e.target.value)}
            onKeyDown={(ev) => {
              ev.stopPropagation();
            }}
            placeholder="#RRGGBB ou RRGGBB"
            style={{
              flex: 1,
              padding: 8,
              border: "1px solid #475569",
              borderRadius: 8,
              background: "#0f172a",
              color: "#e5e7eb",
            }}
          />

          <button
            style={{ ...btn, padding: "6px 10px" }}
            onClick={() => updateBg(selectedKey, undefined)}
            title="Remover cor"
          >
            Limpar
          </button>
        </div>

        <small style={{ opacity: 0.7 }}>
          Dica: pode digitar “fff” ou “#fff”/“#ffffff”. Se o valor for inválido,
          a cor é removida.
        </small>
      </div>

      <div>
        <label style={{ display: "block", fontSize: 12, opacity: 0.85 }}>
          Documentos associados
        </label>
        {(node.docs?.length ?? 0) === 0 ? (
          <p style={{ margin: 0, opacity: 0.8 }}>Nenhum documento associado.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {node.docs!.map((d, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                }}
              >
                <a
                  href={d}
                  target="_blank"
                  rel="noreferrer"
                  style={{ wordBreak: "break-all", color: "#93c5fd" }}
                >
                  {d}
                </a>
                <button
                  style={{ ...btn, padding: "4px 8px" }}
                  onClick={() => removeDoc(selectedKey, i)}
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            value={value}
            onKeyDown={(ev) => {
              ev.stopPropagation();
            }}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Cole URL, caminho de arquivo, ID no GED..."
            style={{
              flex: 1,
              padding: 8,
              border: "1px solid #475569",
              borderRadius: 8,
              background: "#0f172a",
              color: "#e5e7eb",
            }}
          />
          <button
            style={btn}
            onClick={() => {
              if (value.trim()) {
                addDoc(selectedKey, value.trim());
                setValue("");
              }
            }}
          >
            Adicionar
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button style={btn} onClick={() => addChild(selectedKey)}>
          + Filho (A)
        </button>
        <button style={btn} onClick={() => moveNode(selectedKey, -1)}>
          ↑ Subir (↑)
        </button>
        <button style={btn} onClick={() => moveNode(selectedKey, 1)}>
          ↓ Descer (↓)
        </button>
      </div>

      <button
        style={{
          ...btn,
          background: "#FEE2E2",
          borderColor: "#EF4444",
          color: "#7F1D1D",
        }}
        onClick={() => removeNode(selectedKey)}
      >
        Remover nó (Del)
      </button>
    </div>
  );
  }
