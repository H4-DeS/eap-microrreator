import React, { useMemo, useState, useRef } from "react";
import { Tree, TreeNode } from "react-organizational-chart";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";

const COLORS = {
  rootBg: "#1E3A8A",
  rootFg: "#FFFFFF",
  ucBg: "#C7D2FE",
  udt2Bg: "#BBF7D0",
  udt3Bg: "#FEF9C3",
  spcBg: "#FCA5A5",
  mrBg: "#DDD6FE",
  matBg: "#FED7AA",
  susBg: "#A7F3D0",
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
  boxShadow: "0 2px 6px rgba(0,0,0,.06)",
};

const wrap: React.CSSProperties = {
  padding: 16,
  background: "#FFFFFF",
  fontFamily: "system-ui, Arial, sans-serif",
};

const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  marginBottom: 12,
  textAlign: "center",
  color: COLORS.rootBg,
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "center",
  marginBottom: 8,
  flexWrap: "wrap",
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

type NodeKey = string;

type NodeDef = {
  key: NodeKey;
  label: string;
  bg?: string;
  fg?: string;
  children?: NodeDef[];
};

/** Nó colapsável (organograma) */
function CollapsibleNode({
  node,
  collapsed,
  toggle,
}: {
  node: NodeDef;
  collapsed: Record<NodeKey, boolean>;
  toggle: (key: NodeKey) => void;
}) {
  const style: React.CSSProperties = {
    ...boxBase,
    textAlign: "center",
    background: node.bg ?? "#F9FAFB",
  };

  const hasChildren = (node.children?.length ?? 0) > 0;
  const isCollapsed = collapsed[node.key] ?? false;

  const label = (
    <div
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        if (hasChildren) toggle(node.key);
      }}
      title={hasChildren ? (isCollapsed ? "Clique para expandir" : "Clique para colapsar") : "Nó terminal"}
    >
      {hasChildren ? (isCollapsed ? "▶ " : "▼ ") : "• "}
      {node.label}
    </div>
  );

  if (!hasChildren) return <TreeNode label={label} />;
  if (isCollapsed) return <TreeNode label={label} />;

  return (
    <TreeNode label={label}>
      {node.children!.map((child) => (
        <CollapsibleNode key={child.key} node={child} collapsed={collapsed} toggle={toggle} />
      ))}
    </TreeNode>
  );
}

/** Lista hierárquica top→down */
function VerticalNode({
  node,
  level,
  collapsed,
  toggle,
}: {
  node: NodeDef;
  level: number;
  collapsed: Record<NodeKey, boolean>;
  toggle: (key: NodeKey) => void;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isCollapsed = collapsed[node.key] ?? false;

  const style: React.CSSProperties = {
    ...boxBase,
    background: node.bg ?? "#F9FAFB",
    width: "100%",
  };

  return (
    <div style={{ marginLeft: level * 18, position: "relative" }}>
      {level > 0 && (
        <div style={{ position: "absolute", left: -10, top: 0, bottom: 0, borderLeft: "2px solid #CBD5E1" }} />
      )}
      <div
        style={style}
        onClick={() => hasChildren && toggle(node.key)}
        title={hasChildren ? (isCollapsed ? "Clique para expandir" : "Clique para colapsar") : "Nó terminal"}
      >
        {hasChildren ? (isCollapsed ? "▶ " : "▼ ") : "• "}
        {node.label}
      </div>
      {!isCollapsed && hasChildren && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {node.children!.map((c) => (
            <VerticalNode key={c.key} node={c} level={level + 1} collapsed={collapsed} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Esquerda→Direita com colunas alinhadas */
function LeftRightNode({
  node,
  level,
  collapsed,
  toggle,
}: {
  node: NodeDef;
  level: number;
  collapsed: Record<NodeKey, boolean>;
  toggle: (key: NodeKey) => void;
}) {
  const COLUMN_WIDTH = 320;
  const COLUMN_GAP = 28;
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isCollapsed = collapsed[node.key] ?? false;

  const nodeBox: React.CSSProperties = {
    ...boxBase,
    background: node.bg ?? "#F9FAFB",
    width: COLUMN_WIDTH,
    textAlign: "left",
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <div
        style={nodeBox}
        onClick={() => hasChildren && toggle(node.key)}
        title={hasChildren ? (isCollapsed ? "Clique para expandir" : "Clique para colapsar") : "Nó terminal"}
      >
        {hasChildren ? (isCollapsed ? "▶ " : "▼ ") : "• "}
        {node.label}
      </div>

      {!isCollapsed && hasChildren && (
        <div style={{ display: "flex", marginLeft: COLUMN_GAP, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: -Math.floor(COLUMN_GAP / 2),
              top: 14,
              bottom: 14,
              borderLeft: "2px solid #CBD5E1",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {node.children!.map((child) => (
              <div key={child.key} style={{ display: "flex", alignItems: "flex-start" }}>
                <div
                  style={{
                    width: Math.floor(COLUMN_GAP / 2),
                    borderTop: "2px solid #CBD5E1",
                    marginTop: 14,
                    marginRight: Math.floor(COLUMN_GAP / 2),
                  }}
                />
                <LeftRightNode node={child} level={level + 1} collapsed={collapsed} toggle={toggle} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helpers
const waitNextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const walkTree = (n: NodeDef, fn: (node: NodeDef) => void) => { fn(n); n.children?.forEach((c) => walkTree(c, fn)); };
const getSubtreeKeys = (n: NodeDef): string[] => { const keys: string[] = []; walkTree(n, (x) => keys.push(x.key)); return keys; };

export default function EAPMicroReator() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<"horizontal" | "vertical" | "leftRight" | "topDown">("leftRight");
  const [filterTopLevelKey, setFilterTopLevelKey] = useState<string | null>(null);

  const tree = useMemo<NodeDef>(() => ({
    key: "root",
    label: "PROJETO: Microrreator Nuclear",
    bg: COLORS.rootBg,
    fg: COLORS.rootFg,
    children: [
      {
        key: "1",
        label: "1 Unidade Crítica (UCRI) — (UDT-1)",
        bg: COLORS.ucBg,
        children: [
          {
            key: "1.1",
            label: "1.1 Unidade Crítica (UCri) de Microrreator Nuclear Sólido",
            children: [
              { key: "1.1.1", label: "1.1.1 Projetos: neutrônico, mecânico, vareta combustível, I&C" },
              { key: "1.1.2", label: "1.1.2 Aquisições da UCri" },
            ],
          },
          {
            key: "1.2",
            label: "1.2 Preparação de rotinas experimentais da UCri, aprovação junto à Autoridade Nuclear (AN) e realização de experimentos",
            children: [
              { key: "1.2.1", label: "1.2.1 Preparação das rotinas experimentais da UCri, realização dos experimentos e aprovação junto à AN" },
            ],
          },
        ],
      },
      {
        key: "2",
        label: "2 Bancadas Experimentais da UDT-2 (Efeito Separado) — (UDT-2)",
        bg: COLORS.udt2Bg,
        children: [
          {
            key: "2.1",
            label: "2.1 Bancadas Experimentais da UDT-2 de heat pipes (Efeito Separado)",
            children: [
              { key: "2.1.1", label: "2.1.1 Projetos: mecânico, I&C, incluindo sistema de proteção" },
              { key: "2.1.2", label: "2.1.2 Construção, montagem e comissionamento das bancadas de efeito separado da UDT-2" },
            ],
          },
          {
            key: "2.2",
            label: "2.2 Preparação de rotinas experimentais da UDT-2 e realização de experimentos de efeitos separados de heat pipes",
            children: [
              { key: "2.2.1", label: "2.2.1 Preparação das rotinas experimentais da UDT-2 de heat pipes, realização dos experimentos e aprovação junto à Autoridade Nuclear" },
            ],
          },
        ],
      },
      {
        key: "3",
        label: "3 Bancadas Experimentais da UDT-3 (Efeito Integrado) — (UDT-3)",
        bg: COLORS.udt3Bg,
        children: [
          {
            key: "3.1",
            label: "3.1 Bancadas Experimentais da UDT-3 de heat pipes (Efeito Integrado)",
            children: [
              { key: "3.1.1", label: "3.1.1 Projetos da bancada de transferência de calor de efeito integrado de heat pipes UDT-3: mecânico, I&C, incluindo sistemas de proteção" },
              { key: "3.1.2", label: "3.1.2 Aquisição de equipamentos, instrumentos, componentes e materiais de aplicação das bancadas de efeito separado e integrado (UDT-2 e UDT-3)" },
              { key: "3.1.3", label: "3.1.3 Construção, montagem e comissionamento das bancadas de efeito integrado da UDT-3" },
            ],
          },
          {
            key: "3.2",
            label: "3.2 Preparação de rotinas experimentais da UDT-3 de heat pipes e realização de experimentos de efeitos integrados",
            children: [
              { key: "3.2.1", label: "3.2.1 Preparação das rotinas experimentais da UDT-3 de heat pipes, realização dos experimentos e aprovação junto à Autoridade Nuclear" },
            ],
          },
        ],
      },
      {
        key: "4",
        label: "4 Sistema de Proteção e Controle e Supervisão Remota — (UDT-4)",
        bg: COLORS.spcBg,
        children: [
          {
            key: "4.1",
            label: "4.1 Desenvolvimento do sistema de proteção e controle da UCri e do sistema de supervisão remota do microrreator para atuar em micro-redes",
            children: [
              { key: "4.1.1", label: "4.1.1 Projetos do sistema de proteção e controle da Unidade Crítica do microrreator" },
              { key: "4.1.2", label: "4.1.2 Montagem e comissionamento do sistema de proteção e controle da UCri e integração do sistema à mesa de controle do reator Argonauta" },
              { key: "4.1.3", label: "4.1.3 Desenvolvimento da concepção do sistema de supervisão remota para atuação sincronizada com fontes renováveis (FV e eólica) em micro-redes" },
            ],
          },
        ],
      },
      {
        key: "5",
        label: "5 Microrreator e Análises Estruturais — (DRBC)",
        bg: COLORS.mrBg,
        children: [
          {
            key: "5.1",
            label: "5.1 Microrreator: projeto da blindagem (gama e nêutrons), projeto da contenção do microrreator e análise termo-estrutural",
            children: [
              { key: "5.1.1", label: "5.1.1 Projetos da blindagem (gama e nêutrons) do microrreator; projeto mecânico & instrumentação da contenção considerando funções de blindagem e contenção" },
              { key: "5.1.2", label: "5.1.2 Análise termo-estrutural do microrreator nuclear operando em diversas situações operacionais" },
            ],
          },
        ],
      },
      {
        key: "6",
        label: "6 Desenvolvimento dos Processos de Materiais — (DMAT)",
        bg: COLORS.matBg,
        children: [
          {
            key: "6.1",
            label: "6.1 Desenvolvimento dos processos de obtenção de materiais da cadeia de suprimentos de MRN: BeO, Grafita e B4C nuclearmente puro; heat pipes para microrreatores; desenvolvimento e obtenção de UO₂ LEU e varetas de combustível até 20 mm",
            children: [
              { key: "6.1.1", label: "6.1.1 Desenvolvimento de materiais: BeO, Grafita e B4C nuclearmente puro" },
              { key: "6.1.2", label: "6.1.2 Desenvolvimento para obtenção de heat pipes para aplicação em microrreatores nucleares" },
              { key: "6.1.3", label: "6.1.3 Aquisição de equipamentos, serviços, materiais de aplicação e consumíveis para o desenvolvimento de heat pipes" },
              { key: "6.1.4", label: "6.1.4 Desenvolvimento para obtenção de pastilhas de UO₂ com até 20 mm" },
            ],
          },
        ],
      },
      {
        key: "7",
        label: "7 Inserção e Sustentabilidade Socioambiental — (SUST)",
        bg: COLORS.susBg,
        children: [
          {
            key: "7.1",
            label: "7.1 Inserção de microrreatores em aplicações/situações de geração elétrica e uso sustentável sob a ótica socioambiental",
            children: [
              { key: "7.1.1", label: "7.1.1 Inserção na rede elétrica e em cidades < 20 mil hab.; planejamento de RDEE" },
              { key: "7.1.2", label: "7.1.2 Inserção em indústrias e serviços intensivos em eletricidade e em estações de recarga de veículos elétricos" },
              { key: "7.1.3", label: "7.1.3 Interação com fontes renováveis e melhora da qualidade de energia" },
              { key: "7.1.4", label: "7.1.4 Avaliação de sustentabilidade socioambiental e econômica; locais de instalação; cenários regulatórios, normas e políticas públicas" },
              { key: "7.1.5", label: "7.1.5 Avaliação da contribuição dos microrreatores para redução de rejeitos radioativos de longa duração no Brasil" },
            ],
          },
        ],
      },
      {
        key: "8",
        label: "8 Sistema de Garantia da Qualidade (SGG)",
        bg: "#E5E7EB",
        children: [
          { key: "8.1", label: "8.1 Implementação do Sistema de Qualidade" },
          {
            key: "8.2",
            label: "8.2 Documentação e Arquivo Técnico",
            children: [
              { key: "8.2.1", label: "8.2.1 Manter o arquivo técnico do projeto (proponente, coexecutoras, ICTs, contratadas e demais documentos)" },
            ],
          },
        ],
      },
    ],
  }), []);

  const [collapsed, setCollapsed] = useState<Record<NodeKey, boolean>>({});
  const [slidesMode, setSlidesMode] = useState<"leftRight" | "vertical">("leftRight");

  const toggle = (key: NodeKey) => setCollapsed((s) => ({ ...s, [key]: !(s[key] ?? false) }));

  const expandAll = () => {
    const all: Record<NodeKey, boolean> = {};
    const w = (n: NodeDef) => { all[n.key] = false; n.children?.forEach(w); };
    w(tree);
    setCollapsed(all);
  };

  const collapseAll = () => {
    const all: Record<NodeKey, boolean> = {};
    const w = (n: NodeDef) => { all[n.key] = true; n.children?.forEach(w); };
    w(tree);
    all[tree.key] = false;
    setCollapsed(all);
  };

  const exportPng = async () => {
    if (!containerRef.current) return;
    const dataUrl = await toPng(containerRef.current, { backgroundColor: "#FFFFFF", pixelRatio: 2 });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "EAP_Microrreator.png";
    link.click();
  };

  const exportPdf = async () => {
    if (!containerRef.current) return;
    const dataUrl = await toPng(containerRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: "#FFFFFF" });
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const img = new Image();
    img.src = dataUrl;
    await new Promise((res) => (img.onload = res));
    const pxToMm = (px: number) => (px * 25.4) / 96;
    const w = pxToMm(img.naturalWidth);
    const h = pxToMm(img.naturalHeight);
    const margin = 10;
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin * 2;
    const scale = Math.min(maxW / w, maxH / h);
    const renderW = w * scale;
    const renderH = h * scale;
    const x = (pageWidth - renderW) / 2;
    const y = (pageHeight - renderH) / 2;
    pdf.addImage(dataUrl, "PNG", x, y, renderW, renderH);
    pdf.save("EAP_Microrreator.pdf");
  };

  // Exportação Slides (PPTX) com proporção preservada + filtro de ramo
  const exportSlidesPptx = async () => {
    const pptx = new PptxGenJS();
    let slideW = 10, slideH = 5.625; // 16:9
    if (slidesMode === "vertical") {
      pptx.defineLayout({ name: "A4P", width: 8.27, height: 11.69 });
      pptx.layout = "A4P";
      slideW = 8.27; slideH = 11.69;
    } else {
      pptx.layout = "LAYOUT_16x9";
    }

    const marginX = 0.4, marginTop = 0.9, marginBottom = 0.4;
    const boxW = slideW - marginX * 2;
    const boxH = slideH - marginTop - marginBottom;

    const addTitle = (slide: any, text: string) => {
      slide.addText(text, {
        x: marginX, y: 0.3, w: slideW - marginX * 2,
        fontSize: slidesMode === "vertical" ? 22 : 24, bold: true, color: "36393f",
      });
    };

    const addContainedImage = async (slide: any, dataUrl: string) => {
      const pxToIn = (px: number) => px / 96;
      const img = new Image(); img.src = dataUrl;
      await new Promise((res) => (img.onload = res));
      const imgW = pxToIn(img.naturalWidth), imgH = pxToIn(img.naturalHeight);
      const scale = Math.min(boxW / imgW, boxH / imgH);
      const renderW = imgW * scale, renderH = imgH * scale;
      const x = marginX + (boxW - renderW) / 2;
      const y = marginTop + (boxH - renderH) / 2;
      slide.addImage({ data: dataUrl, x, y, w: renderW, h: renderH });
    };

    const prevLayout = layout;
    const prevCollapsed = { ...collapsed };
    const prevFilter = filterTopLevelKey;

    setLayout(slidesMode === "vertical" ? "vertical" : "leftRight");
    setFilterTopLevelKey(null);
    expandAll();
    await waitNextFrame();

    if (containerRef.current) {
      const cover = await toPng(containerRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#FFFFFF" });
      const slide = pptx.addSlide();
      addTitle(slide, "EAP – Microrreator Nuclear");
      await addContainedImage(slide, cover);
    }

    for (const child of tree.children ?? []) {
      setFilterTopLevelKey(child.key);
      const allCollapsed: Record<string, boolean> = {};
      walkTree(tree, (n) => { allCollapsed[n.key] = true; });
      for (const k of [tree.key, ...getSubtreeKeys(child)]) allCollapsed[k] = false;
      setCollapsed(allCollapsed);
      await waitNextFrame();

      if (containerRef.current) {
        const img = await toPng(containerRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#FFFFFF" });
        const slide = pptx.addSlide();
        addTitle(slide, child.label);
        await addContainedImage(slide, img);
      }
    }

    setFilterTopLevelKey(prevFilter);
    setCollapsed(prevCollapsed);
    setLayout(prevLayout);

    await pptx.writeFile({ fileName: `EAP_Microrreator_slides_${slidesMode}.pptx` });
  };

  const topChildren = useMemo(() => {
    if (!tree.children) return [];
    return filterTopLevelKey ? tree.children.filter((c) => c.key === filterTopLevelKey) : tree.children;
  }, [tree, filterTopLevelKey]);

  return (
    <div style={wrap}>
      <h1 style={title}>
        EAP – Desenvolvimento e Testes de Tecnologias Críticas Aplicáveis a Microrreatores Nucleares
      </h1>

      <div style={toolbar}>
        <button style={btn} onClick={expandAll}>Expandir tudo</button>
        <button style={btn} onClick={collapseAll}>Colapsar tudo</button>
        <button style={btn} onClick={exportPng}>Exportar PNG</button>
        <button style={btn} onClick={exportPdf}>Exportar PDF</button>
        <button style={btn} onClick={exportSlidesPptx}>Exportar Slides (PPTX)</button>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ opacity: 0.8 }}>Layout:</span>
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as any)}
            style={{ padding: 6, borderRadius: 8, border: "1px solid #94A3B8", background: "#FFFFFF" }}
          >
            <option value="leftRight">Esquerda → Direita</option>
            <option value="horizontal">Horizontal (Topo ↓)</option>
            <option value="vertical">Vertical (Lista)</option>
            <option value="topDown">Top→Down (PROJETO acima)</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ opacity: 0.8 }}>Slides:</span>
          <select
            value={slidesMode}
            onChange={(e) => setSlidesMode(e.target.value as "leftRight" | "vertical")}
            style={{ padding: 6, borderRadius: 8, border: "1px solid #94A3B8", background: "#FFFFFF" }}
          >
            <option value="leftRight">Esquerda → Direita (16:9)</option>
            <option value="vertical">Vertical (A4 retrato)</option>
          </select>
        </div>
      </div>

      {layout === "horizontal" ? (
        <TransformWrapper minScale={0.3} initialScale={0.8} wheel={{ step: 0.15 }}>
          <TransformComponent>
            <div ref={containerRef} style={{ minWidth: 900, paddingBottom: 16 }}>
              <Tree
                label={
                  <div style={{ ...boxBase, background: COLORS.rootBg, color: COLORS.rootFg, cursor: "default", textAlign: "center" }}>
                    {tree.label}
                  </div>
                }
              >
                {topChildren.map((child) => (
                  <CollapsibleNode key={child.key} node={child} collapsed={collapsed} toggle={toggle} />
                ))}
              </Tree>
            </div>
          </TransformComponent>
        </TransformWrapper>
      ) : layout === "vertical" ? (
        <div ref={containerRef} style={{ padding: 8 }}>
          <div style={{ ...boxBase, background: COLORS.rootBg, color: COLORS.rootFg, cursor: "default", textAlign: "center" }}>
            {tree.label}
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {topChildren.map((child) => (
              <VerticalNode key={child.key} node={child} level={1} collapsed={collapsed} toggle={toggle} />
            ))}
          </div>
        </div>
      ) : layout === "topDown" ? (
        <TransformWrapper minScale={0.3} initialScale={0.9} wheel={{ step: 0.15 }}>
          <TransformComponent>
            <div ref={containerRef} style={{ minWidth: 900, padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <div style={{ ...boxBase, background: COLORS.rootBg, color: COLORS.rootFg, cursor: "default" }}>
                  {tree.label}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Tree label={<div style={{ height: 0 }} />}>
                  {topChildren.map((child) => (
                    <CollapsibleNode key={child.key} node={child} collapsed={collapsed} toggle={toggle} />
                  ))}
                </Tree>
              </div>
            </div>
          </TransformComponent>
        </TransformWrapper>
      ) : (
        <TransformWrapper minScale={0.3} initialScale={0.8} wheel={{ step: 0.15 }}>
          <TransformComponent>
            <div ref={containerRef} style={{ padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <div style={{ ...boxBase, background: COLORS.rootBg, color: COLORS.rootFg, cursor: "default", textAlign: "center" }}>
                  {tree.label}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {topChildren.map((child) => (
                  <LeftRightNode key={child.key} node={child} level={0} collapsed={collapsed} toggle={toggle} />
                ))}
              </div>
            </div>
          </TransformComponent>
        </TransformWrapper>
      )}
    </div>
  );
}
