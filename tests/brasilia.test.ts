// Horário de Brasília: o "hoje" e a receita do dia, da semana e do mês.
import { describe, it, expect } from "vitest";
import { brDay, brWindows, revenueWindows } from "@/domain/brasilia";

describe("horário de Brasília", () => {
  it("às 22h de Brasília ainda é o mesmo dia (o UTC já virou)", () => {
    const night = new Date("2026-10-31T01:30:00Z"); // 30/10 às 22h30 em Brasília
    expect(night.toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(brDay(night)).toBe("2026-10-30");
  });

  it("semana começa na segunda e mês no dia 1", () => {
    expect(brWindows(new Date("2026-10-30T15:00:00Z"))).toEqual({ day: "2026-10-30", week: "2026-10-26", month: "2026-10-01" });
    expect(brWindows(new Date("2026-11-01T15:00:00Z"))).toEqual({ day: "2026-11-01", week: "2026-10-26", month: "2026-11-01" }); // domingo
  });

  it("soma receita, lucro e vendas de hoje, da semana e do mês", () => {
    const now = new Date("2026-10-30T15:00:00Z");
    const s = (date: string, totalCents: number) => ({ date: `${date}T00:00:00.000Z`, totalCents, resultCents: totalCents / 10 });
    const r = revenueWindows([s("2026-10-30", 1000), s("2026-10-27", 2000), s("2026-10-05", 4000), s("2026-09-30", 8000), s("2026-10-31", 16000)], now);
    expect(r.day).toEqual({ revenueCents: 1000, profitCents: 100, count: 1 });
    expect(r.week).toEqual({ revenueCents: 3000, profitCents: 300, count: 2 });
    expect(r.month).toEqual({ revenueCents: 7000, profitCents: 700, count: 3 });
  });
});
