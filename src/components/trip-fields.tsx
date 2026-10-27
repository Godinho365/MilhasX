"use client";
import { ArrowLeftRight, Plus, Trash2, Minus } from "lucide-react";
import { Field } from "./ui";
import { AirportField } from "./airport-field";
import { TRIP_LABELS, type TripType, type Segment } from "@/domain/orders";
import { CABIN_LABELS, type Cabin } from "@/domain/flight-search";

export type Trip = { tripType: TripType; cabin: Cabin; segments: Segment[]; adults: number; children: number; infants: number; flexibleDates: boolean; checkedBag: boolean };
export const emptyTrip = (): Trip => ({ tripType: "ONE_WAY", cabin: "ECONOMY", segments: [{ origin: "", destination: "", date: null }], adults: 1, children: 0, infants: 0, flexibleDates: false, checkedBag: false });

/** Trechos do pedido conforme o tipo: ida e volta vira dois trechos (volta = inverso da ida). */
export function tripSegments(t: Trip, returnDate: string | null): Segment[] {
  const first = t.segments[0]!;
  if (t.tripType === "ROUND_TRIP") return [first, { origin: first.destination, destination: first.origin, date: returnDate }];
  if (t.tripType === "ONE_WAY") return [first];
  return t.segments;
}

const seg = (on: boolean) => `flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${on ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`;

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted">{hint}</p></div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-subtle h-8 w-8 rounded-full px-0" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Menos ${label.toLowerCase()}`}><Minus className="h-4 w-4" /></button>
        <span className="w-5 text-center tabular-nums" aria-label={`${label}: ${value}`}>{value}</span>
        <button type="button" className="btn-subtle h-8 w-8 rounded-full px-0" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Mais ${label.toLowerCase()}`}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function TripFields({ trip, setTrip, returnDate, setReturnDate }: { trip: Trip; setTrip: (t: Trip) => void; returnDate: string; setReturnDate: (v: string) => void }) {
  const set = (patch: Partial<Trip>) => setTrip({ ...trip, ...patch });
  const setSeg = (i: number, patch: Partial<Segment>) => set({ segments: trip.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const pax = trip.adults + trip.children + trip.infants;
  const shown = trip.tripType === "MULTI" ? trip.segments : trip.segments.slice(0, 1);
  return (
    <div className="space-y-4">
      <div>
        <p className="kicker mb-2">Tipo de viagem</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Tipo de viagem">
          {(Object.keys(TRIP_LABELS) as TripType[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={trip.tripType === k} className={seg(trip.tripType === k)}
              onClick={() => set({ tripType: k, segments: k === "MULTI" && trip.segments.length < 2 ? [...trip.segments, { origin: trip.segments[0]!.destination, destination: "", date: null }] : trip.segments })}>
              {TRIP_LABELS[k]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="kicker mb-2">Classe</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Classe">
          {(Object.keys(CABIN_LABELS) as Cabin[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={trip.cabin === k} className={seg(trip.cabin === k)} onClick={() => set({ cabin: k })}>{CABIN_LABELS[k]}</button>
          ))}
        </div>
      </div>
      {shown.map((s, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-line p-3">
          {trip.tripType === "MULTI" && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Trecho {i + 1}</p>
              {trip.segments.length > 2 && <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => set({ segments: trip.segments.filter((_, j) => j !== i) })} aria-label={`Remover trecho ${i + 1}`}><Trash2 className="h-4 w-4" /></button>}
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Origem"><AirportField value={s.origin} onChange={(v) => setSeg(i, { origin: v })} ariaLabel={`Origem${trip.tripType === "MULTI" ? ` do trecho ${i + 1}` : ""}`} /></Field>
            <button type="button" className="btn-subtle mb-0.5 h-10 w-10 px-0" onClick={() => setSeg(i, { origin: s.destination, destination: s.origin })} aria-label="Inverter origem e destino"><ArrowLeftRight className="h-4 w-4" /></button>
            <Field label="Destino"><AirportField value={s.destination} onChange={(v) => setSeg(i, { destination: v })} ariaLabel={`Destino${trip.tripType === "MULTI" ? ` do trecho ${i + 1}` : ""}`} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={trip.tripType === "MULTI" ? "Data" : "Ida"}><input className="input" type="date" value={s.date ?? ""} onChange={(e) => setSeg(i, { date: e.target.value || null })} aria-label={trip.tripType === "MULTI" ? `Data do trecho ${i + 1}` : "Data de ida"} /></Field>
            {trip.tripType === "ROUND_TRIP" && <Field label="Volta"><input className="input" type="date" value={returnDate} min={s.date ?? undefined} onChange={(e) => setReturnDate(e.target.value)} aria-label="Data de volta" /></Field>}
          </div>
        </div>
      ))}
      {trip.tripType === "MULTI" && trip.segments.length < 6 && (
        <button type="button" className="btn-ghost w-full" onClick={() => set({ segments: [...trip.segments, { origin: trip.segments.at(-1)!.destination, destination: "", date: null }] })}><Plus className="h-4 w-4" />Adicionar trecho</button>
      )}
      <div>
        <p className="kicker mb-1">Passageiros</p>
        <Stepper label="Adulto" hint="12 anos ou mais" value={trip.adults} min={1} max={9 - trip.children - trip.infants} onChange={(v) => set({ adults: v, infants: Math.min(trip.infants, v) })} />
        <Stepper label="Criança" hint="De 2 a 12 anos" value={trip.children} min={0} max={9 - trip.adults - trip.infants} onChange={(v) => set({ children: v })} />
        <Stepper label="Bebê" hint="Até 2 anos" value={trip.infants} min={0} max={Math.min(trip.adults, 9 - trip.adults - trip.children)} onChange={(v) => set({ infants: v })} />
        <p className="text-xs text-muted">{pax} {pax === 1 ? "passageiro" : "passageiros"}</p>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="checkbox" checked={trip.flexibleDates} onChange={(e) => set({ flexibleDates: e.target.checked })} />Datas flexíveis</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="checkbox" checked={trip.checkedBag} onChange={(e) => set({ checkedBag: e.target.checked })} />Bagagem despachada</label>
      </div>
    </div>
  );
}
