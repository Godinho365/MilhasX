"use client";
import { createContext, useContext, useState } from "react";

// No celular, a Visão Geral do painel fica em abas (como na referência); no desktop tudo aparece junto.
const Ctx = createContext<string>("");

export function MobileTabs({ tabs, children }: { tabs: [string, string][]; children: React.ReactNode }) {
  const [active, setActive] = useState(tabs[0]![0]);
  return (
    <Ctx.Provider value={active}>
      <div role="tablist" aria-label="Seções do painel" className="mb-4 flex gap-1 rounded-xl border border-line bg-panel p-1 lg:hidden">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={active === k} onClick={() => setActive(k)} className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium ${active === k ? "bg-panel2 text-white shadow-sm" : "text-muted"}`}>{l}</button>
        ))}
      </div>
      {children}
    </Ctx.Provider>
  );
}

export function MobileTab({ k, children, className = "" }: { k: string; children: React.ReactNode; className?: string }) {
  const active = useContext(Ctx);
  return <div className={`${active === k ? "" : "hidden lg:block"} ${className}`}>{children}</div>;
}
