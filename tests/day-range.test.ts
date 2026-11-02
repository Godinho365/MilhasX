// Seletor de período: atalhos, rótulo e meses.
import { describe, it, expect } from "vitest";
import { addMonths, monthRange, rangeLabel, shortcuts } from "@/lib/day-range";

describe("períodos de dias", () => {
  it("atalhos a partir de segunda, 02/11/2026", () => {
    const s = Object.fromEntries(shortcuts("2026-11-02").map((x) => [x.label, x.range]));
    expect(s["Hoje"]).toEqual({ from: "2026-11-02", to: "2026-11-02" });
    expect(s["Ontem"]).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    expect(s["Últimos 7 dias"]).toEqual({ from: "2026-10-27", to: "2026-11-02" });
    expect(s["Esta semana"]).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(s["Semana passada"]).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(s["Mês passado"]).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(s["Este ano"]).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(s["Todo o período"]).toBeNull();
  });

  it("meses de tamanhos diferentes e virada de ano", () => {
    expect(monthRange("2028-02-15")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
    expect(addMonths("2026-12-10", 1)).toBe("2027-01-01");
  });

  it("rótulo", () => {
    expect(rangeLabel(monthRange("2026-11-02"))).toBe("novembro 2026");
    expect(rangeLabel({ from: "2026-11-02", to: "2026-11-02" })).toBe("02/11/2026");
    expect(rangeLabel({ from: "2026-11-01", to: "2026-11-15" })).toBe("01/11 – 15/11/2026");
    expect(rangeLabel({ from: "2025-12-20", to: "2026-01-05" })).toBe("20/12/2025 – 05/01/2026");
    expect(rangeLabel(null)).toBe("Todo o período");
  });
});
