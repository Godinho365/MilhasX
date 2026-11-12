"use client";
// Quadro do fluxograma: caixas (início, etapa, decisão, fim, nota) e ligações com seta, num plano que se move e
// aproxima (rolagem do mouse ou botões), com enquadrar, travar e minimapa. Quem edita arrasta as caixas, puxa a
// bolinha de baixo até outra caixa para ligar, e move a selecionada com as setas do teclado.
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Plus, Minus, Maximize2, Lock, LockOpen, Link2, User } from "lucide-react";
import { NODE_KINDS, flowBounds, pageLabel, type Flow, type FlowEdge, type FlowNode } from "@/domain/process-flow";

export type Selection = { type: "node" | "edge"; id: string } | null;
type View = { x: number; y: number; k: number };
const GRID = 10;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const clampK = (k: number) => Math.min(2, Math.max(0.25, k));

/** Caminho da ligação: de baixo da origem ao topo do destino; se o destino está acima, contorna pela direita. */
export function edgeGeometry(a: FlowNode, b: FlowNode) {
  const A = NODE_KINDS[a.kind], B = NODE_KINDS[b.kind];
  const ax = a.x + A.w / 2, ay = a.y + A.h, bx = b.x + B.w / 2, by = b.y;
  if (by >= ay + 16) {
    const dy = Math.max(28, (by - ay) / 2);
    return { d: `M${ax} ${ay}C${ax} ${ay + dy} ${bx} ${by - dy} ${bx} ${by}`, mid: [(ax + bx) / 2, (ay + by) / 2] as const };
  }
  const sx = a.x + A.w, sy = a.y + A.h / 2, tx = b.x + B.w, ty = b.y + B.h / 2;
  const off = 60 + Math.abs(sy - ty) * 0.12;
  const cx = Math.max(sx, tx) + off;
  return { d: `M${sx} ${sy}C${cx} ${sy} ${cx} ${ty} ${tx} ${ty}`, mid: [cx - off * 0.25, (sy + ty) / 2] as const };
}

export type CanvasHandle = { fit: () => void; center: () => { x: number; y: number } };

type Props = {
  flow: Flow; editable: boolean; locked: boolean; selection: Selection;
  onSelect: (s: Selection) => void; onChange: (f: Flow) => void; onConnect: (from: string, to: string) => void;
  onToggleLock: () => void; onDelete: () => void;
};

export const FlowCanvas = forwardRef<CanvasHandle, Props>(function FlowCanvas({ flow, editable, locked, selection, onSelect, onChange, onConnect, onToggleLock, onDelete }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 1 });
  const [linking, setLinking] = useState<{ from: string; x: number; y: number } | null>(null);
  const drag = useRef<{ mode: "pan" | "node" | "link"; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const canEdit = editable && !locked;

  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = flowBounds(flow);
    const k = clampK(Math.min((r.width - 80) / Math.max(b.w, 1), (r.height - 80) / Math.max(b.h, 1), 1.1));
    setView({ k, x: (r.width - b.w * k) / 2 - b.x * k, y: (r.height - b.h * k) / 2 - b.y * k });
  }, [flow]);
  // o centro da tela, em coordenadas do fluxograma (onde entra uma caixa nova)
  const center = useCallback(() => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: (r.width / 2 - view.x) / view.k, y: (r.height / 2 - view.y) / view.k } : { x: 0, y: 0 };
  }, [view]);
  useImperativeHandle(ref, () => ({ fit, center }), [fit, center]);
  useEffect(() => { fit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- só ao abrir

  // rolagem do mouse aproxima/afasta em volta do ponteiro
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      setView((v) => {
        const k = clampK(v.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const toWorld = (cx: number, cy: number) => {
    const r = box.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };
  const nodeAt = (wx: number, wy: number) => [...flow.nodes].reverse().find((n) => n.kind !== "note" && wx >= n.x && wx <= n.x + NODE_KINDS[n.kind].w && wy >= n.y && wy <= n.y + NODE_KINDS[n.kind].h);

  function down(e: React.PointerEvent, mode: "pan" | "node" | "link", node?: FlowNode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    box.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, id: node?.id, sx: e.clientX, sy: e.clientY, ox: mode === "pan" ? view.x : node?.x ?? 0, oy: mode === "pan" ? view.y : node?.y ?? 0, moved: false };
    if (mode === "link" && node) { const w = toWorld(e.clientX, e.clientY); setLinking({ from: node.id, x: w.x, y: w.y }); }
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.mode === "pan") setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else if (d.mode === "node" && canEdit && d.moved) {
      const nx = snap(d.ox + dx / view.k), ny = snap(d.oy + dy / view.k);
      onChange({ ...flow, nodes: flow.nodes.map((n) => (n.id === d.id ? { ...n, x: nx, y: ny } : n)) });
    } else if (d.mode === "link") { const w = toWorld(e.clientX, e.clientY); setLinking((l) => (l ? { ...l, x: w.x, y: w.y } : l)); }
  }
  function up(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === "link") {
      const w = toWorld(e.clientX, e.clientY);
      const target = nodeAt(w.x, w.y);
      setLinking(null);
      if (target && d.id && target.id !== d.id) onConnect(d.id, target.id);
      return;
    }
    if (!d.moved) onSelect(d.mode === "node" && d.id ? { type: "node", id: d.id } : null);
  }
  function key(e: React.KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selection && canEdit) { e.preventDefault(); onDelete(); }
    else if (e.key === "Escape") onSelect(null);
    else if (selection?.type === "node" && canEdit && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 50 : GRID;
      const [dx, dy] = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
      onChange({ ...flow, nodes: flow.nodes.map((n) => (n.id === selection.id ? { ...n, x: n.x + dx, y: n.y + dy } : n)) });
    }
  }

  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const from = linking ? byId.get(linking.from) : undefined;

  return (
    <div
      ref={box} tabIndex={0} onKeyDown={key} aria-label="Fluxograma do processo"
      className="relative h-full w-full touch-none select-none overflow-hidden bg-panel outline-none"
      style={{ backgroundImage: "radial-gradient(rgb(var(--zinc-700)) 1px, transparent 1px)", backgroundSize: `${20 * view.k}px ${20 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={(e) => down(e, "pan")} onPointerMove={move} onPointerUp={up}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} aria-hidden>
          <defs>
            <marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="rgb(var(--zinc-400))" /></marker>
            <marker id="seta-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="rgb(var(--accent-light))" /></marker>
          </defs>
          {flow.edges.map((e) => <EdgeView key={e.id} e={e} a={byId.get(e.from)} b={byId.get(e.to)} selected={selection?.type === "edge" && selection.id === e.id} onSelect={() => onSelect({ type: "edge", id: e.id })} />)}
          {from && linking && (() => {
            const A = NODE_KINDS[from.kind];
            const ax = from.x + A.w / 2, ay = from.y + A.h;
            return <path d={`M${ax} ${ay}C${ax} ${ay + 40} ${linking.x} ${linking.y - 40} ${linking.x} ${linking.y}`} fill="none" stroke="rgb(var(--accent-light))" strokeWidth={2} strokeDasharray="6 4" />;
          })()}
        </svg>
        {flow.nodes.map((n) => (
          <NodeView key={n.id} n={n} selected={selection?.type === "node" && selection.id === n.id} canEdit={canEdit}
            onDown={(e) => down(e, "node", n)} onLink={(e) => down(e, "link", n)} onSelect={() => onSelect({ type: "node", id: n.id })} />
        ))}
      </div>

      <div className="absolute bottom-3 left-3 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="btn-ghost h-8 w-8 bg-panel px-0" onClick={() => setView((v) => ({ ...v, k: clampK(v.k * 1.2) }))} aria-label="Aproximar"><Plus className="h-4 w-4" /></button>
        <button type="button" className="btn-ghost h-8 w-8 bg-panel px-0" onClick={() => setView((v) => ({ ...v, k: clampK(v.k / 1.2) }))} aria-label="Afastar"><Minus className="h-4 w-4" /></button>
        <button type="button" className="btn-ghost h-8 w-8 bg-panel px-0" onClick={fit} aria-label="Enquadrar o fluxograma"><Maximize2 className="h-4 w-4" /></button>
        {editable && <button type="button" className="btn-ghost h-8 w-8 bg-panel px-0" onClick={onToggleLock} aria-pressed={locked} aria-label={locked ? "Destravar a edição" : "Travar a edição"}>{locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}</button>}
      </div>
      <MiniMap flow={flow} view={view} box={box} onCenter={(x, y) => setView((v) => { const r = box.current!.getBoundingClientRect(); return { ...v, x: r.width / 2 - x * v.k, y: r.height / 2 - y * v.k }; })} />
    </div>
  );
});

function EdgeView({ e, a, b, selected, onSelect }: { e: FlowEdge; a?: FlowNode; b?: FlowNode; selected: boolean; onSelect: () => void }) {
  if (!a || !b) return null;
  const g = edgeGeometry(a, b);
  return (
    <g>
      <path d={g.d} fill="none" stroke="transparent" strokeWidth={14} className="pointer-events-auto cursor-pointer" onPointerDown={(ev) => { ev.stopPropagation(); onSelect(); }} />
      <path d={g.d} fill="none" stroke={selected ? "rgb(var(--accent-light))" : "rgb(var(--zinc-500))"} strokeWidth={selected ? 2.5 : 1.75} markerEnd={`url(#${selected ? "seta-sel" : "seta"})`} />
      {e.label && (
        <text x={g.mid[0]} y={g.mid[1]} dy="0.35em" textAnchor="middle" fontSize={12} fontWeight={600} fill="rgb(var(--zinc-100))" stroke="rgb(var(--panel))" strokeWidth={5} paintOrder="stroke" className="pointer-events-auto cursor-pointer" onPointerDown={(ev) => { ev.stopPropagation(); onSelect(); }}>{e.label}</text>
      )}
    </g>
  );
}

function NodeView({ n, selected, canEdit, onDown, onLink, onSelect }: { n: FlowNode; selected: boolean; canEdit: boolean; onDown: (e: React.PointerEvent) => void; onLink: (e: React.PointerEvent) => void; onSelect: () => void }) {
  const k = NODE_KINDS[n.kind];
  const ring = selected ? "ring-2 ring-accent-light" : "";
  const base = "absolute flex flex-col items-center justify-center px-3 text-center text-sm leading-tight shadow-sm";
  const label = `${k.label}: ${n.title || "(sem texto)"}`;
  const common = {
    role: "button", tabIndex: 0, "aria-label": label, "aria-pressed": selected, "data-node": n.id,
    onPointerDown: onDown, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") onSelect(); },
    style: { left: n.x, top: n.y, width: k.w, height: k.h },
  } as const;
  const handle = canEdit && n.kind !== "note" && n.kind !== "end" && (
    <span onPointerDown={(e) => { e.stopPropagation(); onLink(e); }} title="Puxe até outra caixa para ligar"
      className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 cursor-crosshair rounded-full border-2 border-panel bg-accent-light opacity-70 hover:opacity-100" />
  );
  const meta = (n.owner || n.link) && (
    <span className="mt-1 flex max-w-full items-center gap-2 truncate text-[11px] text-muted">
      {n.owner && <span className="inline-flex items-center gap-0.5 truncate"><User className="h-3 w-3 shrink-0" />{n.owner}</span>}
      {n.link && <span className="inline-flex items-center gap-0.5 truncate"><Link2 className="h-3 w-3 shrink-0" />{pageLabel(n.link)}</span>}
    </span>
  );
  if (n.kind === "decision") {
    return (
      <div {...common} className={`${base} cursor-grab bg-transparent shadow-none ${selected ? "drop-shadow-[0_0_2px_rgb(var(--accent-light))]" : ""}`}>
        <svg className="absolute inset-0" width={k.w} height={k.h} aria-hidden><polygon points={`${k.w / 2},2 ${k.w - 2},${k.h / 2} ${k.w / 2},${k.h - 2} 2,${k.h / 2}`} fill="rgb(var(--panel2))" stroke={selected ? "rgb(var(--accent-light))" : "rgb(var(--violet-400))"} strokeWidth={selected ? 2.5 : 1.5} /></svg>
        <span className="relative line-clamp-3 max-w-[70%] font-semibold">{n.title}</span>
        {handle}
      </div>
    );
  }
  if (n.kind === "start" || n.kind === "end") {
    return (
      <div {...common} className={`${base} cursor-grab rounded-full border-2 font-semibold ${n.kind === "start" ? "border-green-400/70 bg-green-400/10" : "border-zinc-500 bg-panel2"} ${ring}`}>
        <span className="line-clamp-2">{n.title}</span>
        {handle}
      </div>
    );
  }
  if (n.kind === "note") {
    return (
      <div {...common} className={`${base} cursor-grab items-start justify-start rounded-lg border border-amber-400/40 bg-amber-400/10 py-2 text-left ${ring}`}>
        {n.title && <span className="line-clamp-1 font-semibold text-amber-400">{n.title}</span>}
        {n.detail && <span className="line-clamp-3 text-xs text-zinc-300">{n.detail}</span>}
      </div>
    );
  }
  return (
    <div {...common} className={`${base} cursor-grab rounded-xl border border-line bg-panel2 ${ring}`}>
      <span className="line-clamp-2 font-semibold">{n.title}</span>
      {meta}
      {handle}
    </div>
  );
}

function MiniMap({ flow, view, box, onCenter }: { flow: Flow; view: View; box: React.RefObject<HTMLDivElement | null>; onCenter: (x: number, y: number) => void }) {
  const [size, setSize] = useState({ w: 800, h: 500 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);
  if (!flow.nodes.length) return null;
  const b = flowBounds(flow);
  const vx = -view.x / view.k, vy = -view.y / view.k, vw = size.w / view.k, vh = size.h / view.k;
  const x0 = Math.min(b.x, vx) - 40, y0 = Math.min(b.y, vy) - 40;
  const x1 = Math.max(b.x + b.w, vx + vw) + 40, y1 = Math.max(b.y + b.h, vy + vh) + 40;
  const W = 180, H = 120, s = Math.min(W / (x1 - x0), H / (y1 - y0));
  return (
    <svg width={W} height={H} className="absolute bottom-3 right-3 hidden cursor-pointer rounded-lg border border-line bg-panel/90 sm:block" aria-label="Minimapa"
      onPointerDown={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onCenter(x0 + (e.clientX - r.left) / s, y0 + (e.clientY - r.top) / s); }}>
      {flow.nodes.map((n) => <rect key={n.id} x={(n.x - x0) * s} y={(n.y - y0) * s} width={Math.max(2, NODE_KINDS[n.kind].w * s)} height={Math.max(2, NODE_KINDS[n.kind].h * s)} rx={2} fill={n.kind === "note" ? "rgb(var(--amber-400))" : n.kind === "decision" ? "rgb(var(--violet-400))" : "rgb(var(--zinc-500))"} opacity={0.8} />)}
      <rect x={(vx - x0) * s} y={(vy - y0) * s} width={vw * s} height={vh * s} fill="none" stroke="rgb(var(--accent-light))" strokeWidth={1.5} />
    </svg>
  );
}
