"use client";
import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useNav } from "@/lib/nav";
import { Field, Alert } from "@/components/ui";
import { AirportField } from "@/components/airport-field";
import { CABIN_LABELS, type Cabin } from "@/domain/flight-search";

export function TranslatorForm({ origin, destination, roundTrip, cabin }: { origin: string; destination: string; roundTrip: boolean; cabin: Cabin }) {
  const nav = useNav();
  const [o, setO] = useState(origin);
  const [d, setD] = useState(destination);
  const [rt, setRt] = useState(roundTrip);
  const [c, setC] = useState<Cabin>(cabin);
  const [erro, setErro] = useState("");
  function go(e: React.FormEvent) {
    e.preventDefault();
    if (!o || !d) return setErro("Informe origem e destino (código do aeroporto, ex.: GRU)");
    if (o === d) return setErro("Origem e destino precisam ser diferentes");
    nav(`/app/tradutor?de=${o}&para=${d}&tipo=${rt ? "ida-e-volta" : "so-ida"}&classe=${c}`);
  }
  return (
    <form onSubmit={go} className="card card-pad space-y-4" aria-label="Analisar um trecho">
      <h2 className="text-lg font-semibold">Analisar um trecho</h2>
      {erro && <Alert>{erro}</Alert>}
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <Field label="Origem"><AirportField value={o} onChange={setO} ariaLabel="Origem" /></Field>
        <button type="button" className="btn-subtle mb-0.5 h-10 w-10 px-0" onClick={() => { setO(d); setD(o); }} aria-label="Inverter origem e destino"><ArrowLeftRight className="h-4 w-4" /></button>
        <Field label="Destino"><AirportField value={d} onChange={setD} ariaLabel="Destino" /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo">
          <div className="flex gap-2" role="radiogroup" aria-label="Tipo">
            {([[true, "Ida e volta"], [false, "Só ida"]] as const).map(([v, l]) => (
              <button key={l} type="button" role="radio" aria-checked={rt === v} onClick={() => setRt(v)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${rt === v ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="Classe">
          <select className="input" value={c} onChange={(e) => setC(e.target.value as Cabin)} aria-label="Classe">
            {(Object.keys(CABIN_LABELS) as Cabin[]).map((k) => <option key={k} value={k}>{CABIN_LABELS[k]}</option>)}
          </select>
        </Field>
      </div>
      <button className="btn-primary w-full">Analisar</button>
    </form>
  );
}
