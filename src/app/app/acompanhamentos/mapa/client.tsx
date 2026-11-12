"use client";
// Mapa de viagens: o mundo (Natural Earth, em /maps/world.json) com uma bolinha por cidade onde há cliente em
// viagem, embarcando em até 48h ou voltando hoje. Clique (ou Enter) na bolinha mostra as viagens dali e o
// trajeto; a legenda liga e desliga cada situação. Zoom pelos botões, duplo clique ou Ctrl + rolagem.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Minus, Maximize2, MapPin, Plane, BedDouble, Ship, ExternalLink, Users } from "lucide-react";
import { MAP_W, MAP_H, placeName, pointOf } from "@/domain/geo";
import { itemFields } from "@/domain/sale-items";
import { MAP_STATUS, activeClients, departed, rowTitle, type MapStatus, type Now, type Trip, type TrackRow } from "@/domain/tracking";

type View = { x: number; y: number; w: number };
const FULL: View = { x: 0, y: 0, w: MAP_W };
const ASPECT = MAP_H / MAP_W;
const MIN_W = 40;
const ORDER: MapStatus[] = ["traveling", "boarding", "returning"];
/** Cor da bolinha com mais de uma situação: a mais urgente. */
const PRIORITY: MapStatus[] = ["boarding", "returning", "traveling"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function clampView(v: View): View {
  const w = Math.min(MAP_W, Math.max(MIN_W, v.w));
  const h = w * ASPECT;
  return { w, x: Math.min(MAP_W - w, Math.max(0, v.x)), y: Math.min(MAP_H - h, Math.max(0, v.y)) };
}
function fitTo(points: [number, number][]): View {
  if (!points.length) return FULL;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = Math.max(160, (x1 - x0) * 1.6, ((y1 - y0) * 1.6) / ASPECT);
  return clampView({ w, x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - (w * ASPECT) / 2 });
}
/** Curva suave entre dois pontos (para o trajeto). */
function arc(a: [number, number], b: [number, number]) {
  const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  return `M${a[0]} ${a[1]}Q${mx - dy * 0.18} ${my + dx * 0.18} ${b[0]} ${b[1]}`;
}

export function TravelMap({ now, trips }: { now: Now; trips: Trip[] }) {
  const [world, setWorld] = useState<{ land: string; borders: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/maps/world.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((d) => alive && setWorld(d)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);

  const [hidden, setHidden] = useState<Set<MapStatus>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const visible = useMemo(() => trips.filter((t) => !hidden.has(t.status)), [trips, hidden]);
  const places = useMemo(() => {
    const m = new Map<string, Trip[]>();
    for (const t of visible) if (t.at && pointOf(t.at)) m.set(t.at, [...(m.get(t.at) ?? []), t]);
    return [...m.entries()].map(([code, list]) => ({ code, list, p: pointOf(code)!, status: PRIORITY.find((s) => list.some((t) => t.status === s))! }));
  }, [visible]);
  const nowhere = visible.filter((t) => !t.at || !pointOf(t.at));
  const counts = Object.fromEntries(ORDER.map((s) => [s, trips.filter((t) => t.status === s).length])) as Record<MapStatus, number>;

  const [view, setView] = useState<View>(() => fitTo(places.map((p) => p.p)));
  const svg = useRef<SVGSVGElement>(null);
  const [px, setPx] = useState(900);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(el.getBoundingClientRect().width || 900));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const unit = view.w / px; // unidades do mapa por pixel na tela

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const w = Math.min(MAP_W, Math.max(MIN_W, v.w * factor));
      const fx = cx ?? v.x + v.w / 2, fy = cy ?? v.y + (v.w * ASPECT) / 2;
      return clampView({ w, x: fx - ((fx - v.x) * w) / v.w, y: fy - ((fy - v.y) * w) / v.w });
    });
  }, []);
  const toMap = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return [view.x + ((e.clientX - r.left) / r.width) * view.w, view.y + ((e.clientY - r.top) / r.height) * view.w * ASPECT] as const;
  };
  // Ctrl/⌘ + rolagem (e o gesto de pinça do trackpad) aproxima; a rolagem simples continua rolando a página
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const cx = v.x + ((e.clientX - r.left) / r.width) * v.w, cy = v.y + ((e.clientY - r.top) / r.height) * v.w * ASPECT;
        const w = Math.min(MAP_W, Math.max(MIN_W, v.w * (e.deltaY > 0 ? 1.15 : 1 / 1.15)));
        return clampView({ w, x: cx - ((cx - v.x) * w) / v.w, y: cy - ((cy - v.y) * w) / v.w });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const selected = places.find((p) => p.code === sel) ?? null;
  const selTrips = selected?.list ?? [];
  const lines = useMemo(() => selTrips.flatMap((t) => t.legs.flatMap((l) => {
    const a = pointOf(l.from), b = pointOf(l.to);
    return a && b && l.from !== l.to ? [{ id: `${t.id}:${l.id}`, d: arc(a, b), color: MAP_STATUS[t.status].color, done: departed(l, now) }] : [];
  })), [selTrips, now]);

  function pick(code: string) {
    setSel((s) => (s === code ? null : code));
  }

  return (
    <div className="space-y-4">
      <div className="card relative overflow-hidden p-0">
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap gap-1 rounded-xl border border-line bg-panel/90 p-1 backdrop-blur" role="group" aria-label="Situações no mapa">
            {ORDER.map((s) => (
              <button key={s} type="button" aria-pressed={!hidden.has(s)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(s)) n.delete(s); else n.add(s); return n; })}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${hidden.has(s) ? "text-muted line-through opacity-60" : "text-zinc-100"}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MAP_STATUS[s].color }} aria-hidden />{MAP_STATUS[s].label}
                <span className="tabular-nums text-muted">{counts[s]}</span>
              </button>
            ))}
          </div>
          <p className="pointer-events-auto rounded-xl border border-line bg-panel/90 px-3 py-1.5 text-xs font-semibold backdrop-blur" aria-live="polite">
            {activeClients(visible).toLocaleString("pt-BR")} {activeClients(visible) === 1 ? "cliente ativo" : "clientes ativos"}
          </p>
        </div>

        <svg
          ref={svg} role="img" aria-label="Mapa de viagens" viewBox={`${view.x} ${view.y} ${view.w} ${view.w * ASPECT}`}
          className="block h-auto w-full cursor-grab select-none bg-panel active:cursor-grabbing" style={{ aspectRatio: `${MAP_W} / ${MAP_H}`, touchAction: view.w < MAP_W ? "none" : "auto" }}
          onPointerDown={(e) => { if ((e.target as Element).closest("[data-place]")) return; drag.current = { x: e.clientX, y: e.clientY, moved: false }; (e.currentTarget as Element).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const r = svg.current!.getBoundingClientRect();
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
            d.x = e.clientX; d.y = e.clientY;
            setView((v) => clampView({ ...v, x: v.x - (dx / r.width) * v.w, y: v.y - (dy / r.height) * v.w * ASPECT }));
          }}
          onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && !d.moved && !(e.target as Element).closest("[data-place]")) setSel(null); }}
          onDoubleClick={(e) => { const [cx, cy] = toMap(e); zoomAt(1 / 1.8, cx, cy); }}
        >
          <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="rgb(var(--panel))" />
          {world && (
            <g aria-hidden>
              <path d={world.land} fill="rgb(var(--zinc-800))" />
              <path d={world.borders} fill="none" stroke="rgb(var(--zinc-700))" strokeWidth={0.6 * unit} strokeLinejoin="round" />
            </g>
          )}
          {lines.map((l) => (
            <path key={l.id} d={l.d} fill="none" stroke={l.color} strokeWidth={2 * unit} strokeDasharray={l.done ? undefined : `${5 * unit} ${4 * unit}`} strokeLinecap="round" opacity={0.9} aria-hidden />
          ))}
          {places.map(({ code, list, p, status }) => {
            const r = (6 + Math.min(6, (list.length - 1) * 1.5)) * unit;
            const on = sel === code;
            const name = placeName(code) ?? code;
            return (
              <g key={code} data-place={code} role="button" tabIndex={0} aria-pressed={on} aria-label={`${name}: ${list.length} ${list.length === 1 ? "viagem" : "viagens"}`}
                onClick={() => pick(code)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(code); } }} className="cursor-pointer outline-none">
                {on && <circle cx={p[0]} cy={p[1]} r={r + 5 * unit} fill="none" stroke={MAP_STATUS[status].color} strokeWidth={2 * unit} opacity={0.6} />}
                <circle cx={p[0]} cy={p[1]} r={r} fill={MAP_STATUS[status].color} stroke="rgb(var(--panel))" strokeWidth={2 * unit} />
                {list.length > 1 && <text x={p[0]} y={p[1]} dy="0.35em" textAnchor="middle" fontSize={10 * unit} fontWeight={700} fill="#fff">{list.length}</text>}
                {(on || view.w < 300) && <text x={p[0] + r + 3 * unit} y={p[1]} dy="0.35em" fontSize={11 * unit} fontWeight={600} fill="rgb(var(--zinc-100))" stroke="rgb(var(--panel))" strokeWidth={3 * unit} paintOrder="stroke">{name}</text>}
              </g>
            );
          })}
        </svg>

        <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
          <button type="button" className="btn-ghost h-9 w-9 bg-panel/90 px-0" onClick={() => zoomAt(1 / 1.6)} aria-label="Aproximar"><Plus className="h-4 w-4" /></button>
          <button type="button" className="btn-ghost h-9 w-9 bg-panel/90 px-0" onClick={() => zoomAt(1.6)} aria-label="Afastar"><Minus className="h-4 w-4" /></button>
          <button type="button" className="btn-ghost h-9 w-9 bg-panel/90 px-0" onClick={() => setView(places.length ? fitTo(places.map((x) => x.p)) : FULL)} aria-label="Enquadrar as viagens"><Maximize2 className="h-4 w-4" /></button>
        </div>
        {failed && <p className="absolute bottom-3 left-3 z-10 rounded-lg bg-panel/90 px-2 py-1 text-xs text-muted">Não deu para carregar o desenho do mapa; as bolinhas continuam funcionando.</p>}
        {!failed && <p className="absolute bottom-3 left-3 z-10 hidden rounded-lg bg-panel/80 px-2 py-1 text-[11px] text-muted sm:block">Ctrl + rolagem ou duplo clique para aproximar · arraste para mover</p>}
      </div>

      {selected ? (
        <section className="card card-pad space-y-3" aria-label={`Viagens em ${placeName(selected.code)}`}>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted" />
            <h2 className="font-semibold">{placeName(selected.code)} <span className="font-normal text-muted">({selected.code})</span></h2>
            <button type="button" className="btn-subtle ml-auto h-8" onClick={() => setSel(null)}>Fechar</button>
          </div>
          <ul className="space-y-3">{selTrips.map((t) => <TripCard key={t.id} t={t} now={now} />)}</ul>
        </section>
      ) : (
        <div className="card flex flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted">
          <MapPin className="h-5 w-5" />
          {trips.length ? "Clique em uma bolinha no mapa para ver os detalhes da viagem." : "Ninguém viajando agora, embarcando em até 48h ou voltando hoje. As viagens aparecem aqui pelas datas dos voos, hospedagens e cruzeiros das vendas."}
        </div>
      )}

      {visible.length > 0 && (
        <section className="space-y-2" aria-label="Todas as viagens do mapa">
          <h2 className="kicker">Todas as viagens</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {ORDER.filter((s) => !hidden.has(s)).map((s) => {
              const list = visible.filter((t) => t.status === s);
              return (
                <div key={s} className="card overflow-hidden">
                  <p className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MAP_STATUS[s].color }} aria-hidden />{MAP_STATUS[s].label}
                    <span className="ml-auto text-xs font-normal text-muted">{list.length}</span>
                  </p>
                  {list.length === 0 ? <p className="px-4 py-3 text-sm text-muted">Ninguém.</p> : (
                    <ul className="divide-y divide-line">
                      {list.map((t) => {
                        const has = !!(t.at && pointOf(t.at));
                        return (
                          <li key={t.id}>
                            <button type="button" disabled={!has} onClick={() => has && setSel(t.at)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-panel2 disabled:cursor-default disabled:hover:bg-transparent">
                              <span className="min-w-0 flex-1 truncate">{t.customers.map((c) => c.name).join(", ") || "Sem cliente"}</span>
                              <span className="shrink-0 text-xs text-muted">{t.at ? placeName(t.at) : "sem lugar"}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          {nowhere.length > 0 && <p className="text-xs text-muted">{nowhere.length === 1 ? "1 viagem não aparece no mapa" : `${nowhere.length} viagens não aparecem no mapa`}: o lugar não tem código de aeroporto conhecido.</p>}
        </section>
      )}
    </div>
  );
}

function legLine(l: TrackRow) {
  if (l.leg === "STAY") {
    const f = itemFields(l.kind);
    return `${f.section} · ${rowTitle(l)} · ${dm(l.date)}${l.endDate ? ` → ${dm(l.endDate)}` : ""}`;
  }
  return `${dm(l.date)}${l.time ? ` ${l.time}` : ""} · ${l.from ?? "?"} → ${l.to ?? "?"}${l.provider ? ` · ${l.provider}` : ""}`;
}

function TripCard({ t, now }: { t: Trip; now: Now }) {
  const Icon = t.kind === "HOTEL" ? BedDouble : t.kind === "CRUISE" ? Ship : Plane;
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-muted" />
        <p className="font-semibold">{t.customers.map((c) => c.name).join(", ") || "Sem cliente"}</p>
        <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: MAP_STATUS[t.status].color }}>{MAP_STATUS[t.status].label}</span>
        {t.passengers != null && <span className="inline-flex items-center gap-1 text-xs text-muted"><Users className="h-3.5 w-3.5" />{t.passengers}</span>}
        <span className="ml-auto text-xs text-muted">{dm(t.start)}{t.end !== t.start ? ` → ${dm(t.end)}` : ""}</span>
      </div>
      <ol className="mt-2 space-y-1 text-sm">
        {t.legs.map((l) => (
          <li key={l.id} className={`flex items-center gap-2 ${departed(l, now) && l.leg !== "STAY" ? "text-muted" : ""}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${departed(l, now) ? "bg-muted" : "bg-accent-light"}`} aria-hidden />
            <span className="min-w-0 flex-1">{legLine(l)}</span>
            {l.done && <span className="shrink-0 text-xs text-green-400">{itemFields(l.kind).done}</span>}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        {t.reservation && <span>Localizador <span className="font-mono text-zinc-200">{t.reservation}</span></span>}
        {t.saleIds.map((id, n) => (
          <Link key={id} href={`/app/sales?edit=${encodeURIComponent(id)}`} className="inline-flex items-center gap-1 text-accent-light hover:underline">
            <ExternalLink className="h-3.5 w-3.5" />{t.saleIds.length > 1 ? `Venda ${n + 1}` : "Abrir a venda"}
          </Link>
        ))}
      </div>
    </li>
  );
}
