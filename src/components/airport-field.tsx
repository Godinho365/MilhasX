"use client";
import { useEffect, useId, useState } from "react";
import { AIRPORTS } from "@/domain/airports";

const label = (code: string) => {
  const a = AIRPORTS.find((x) => x.code === code);
  return a ? `${a.code} — ${a.city}` : code;
};

/** Aeroporto ou cidade: sugere os da lista e aceita qualquer código IATA de 3 letras. */
export function AirportField({ value, onChange, placeholder = "Aeroporto ou cidade", ariaLabel }: { value: string; onChange: (code: string) => void; placeholder?: string; ariaLabel: string }) {
  const listId = useId();
  const [text, setText] = useState(value ? label(value) : "");
  useEffect(() => {
    // Valor trocado de fora (inverter origem/destino, preencher de um pedido)
    setText((t) => (t.slice(0, 3).toUpperCase() === value ? t : value ? label(value) : ""));
  }, [value]);
  function change(v: string) {
    setText(v);
    const t = v.trim();
    const byCode = t.slice(0, 3).toUpperCase();
    if (/^[A-Za-z]{3}(\s|$|—)/.test(t)) return onChange(byCode);
    const byCity = AIRPORTS.filter((a) => a.city.toLowerCase() === t.toLowerCase());
    onChange(byCity.length === 1 ? byCity[0]!.code : "");
  }
  return (
    <>
      <input className="input" list={listId} placeholder={placeholder} value={text} onChange={(e) => change(e.target.value)} aria-label={ariaLabel} autoComplete="off" />
      <datalist id={listId}>{AIRPORTS.map((a) => <option key={a.code} value={`${a.code} — ${a.city}`}>{a.name}</option>)}</datalist>
    </>
  );
}
