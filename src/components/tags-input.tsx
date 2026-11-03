"use client";
import { useState } from "react";
import { X } from "lucide-react";

/** Campo de tags: digita e Enter (ou vírgula) adiciona; sugere as já usadas. */
export function TagsInput({ value, onChange, suggestions, label = "Tags" }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; label?: string }) {
  const [text, setText] = useState("");
  const add = (t: string) => {
    const tag = t.trim().slice(0, 30);
    if (tag && !value.includes(tag) && value.length < 10) onChange([...value, tag]);
    setText("");
  };
  const listId = `tags-${label}`;
  return (
    <div className="input flex min-h-10 flex-wrap items-center gap-1 py-1.5">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-panel2 px-2 py-0.5 text-xs">
          {t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remover tag ${t}`}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
        list={listId}
        placeholder={value.length ? "" : "Selecionar tags"}
        value={text}
        aria-label={label}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(text); }
          if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
      />
      <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}
