import { describe, expect, it } from "vitest";
import { nextClubDate, projectClub, yearMonths } from "@/domain/club-calendar";

describe("calendário de clubes", () => {
  it("mensal mantém o dia e ajusta meses curtos", () => {
    expect(nextClubDate("2026-01-31", "MONTHLY")).toBe("2026-02-28");
    expect(nextClubDate("2026-02-28", "MONTHLY", 1, 31)).toBe("2026-03-31");
    expect(nextClubDate("2026-11-21", "QUARTERLY")).toBe("2027-02-21");
    expect(nextClubDate("2026-11-21", "YEARLY")).toBe("2027-11-21");
  });

  it("projeta as cobranças até o fim do ano ou do plano", () => {
    const c = { id: "c1", nextDate: "2026-11-21", frequency: "MONTHLY" as const, interval: 1, dayOfMonth: 21, endDate: null, points: 2000, costCents: 4990 };
    expect(projectClub(c, "2026-11-12", "2026-12-31").map((e) => e.day)).toEqual(["2026-11-21", "2026-12-21"]);
    expect(projectClub({ ...c, endDate: "2026-11-30" }, "2026-01-01", "2026-12-31").map((e) => e.day)).toEqual(["2026-11-21"]);
    expect(projectClub(c, "2027-01-01", "2027-03-31").map((e) => e.day)).toEqual(["2027-01-21", "2027-02-21", "2027-03-21"]);
    expect(projectClub(c, "2026-01-01", "2026-12-31").every((e) => e.projected)).toBe(true);
  });

  it("monta os 12 meses em semanas com as cobranças de cada dia", () => {
    const ms = yearMonths(2026, [
      { clubId: "a", day: "2026-11-21", points: 2000, costCents: 4990, projected: true },
      { clubId: "b", day: "2026-11-21", points: 10000, costCents: 35680, projected: false },
    ]);
    expect(ms).toHaveLength(12);
    const nov = ms[10]!;
    expect(nov.month).toBe("2026-11");
    expect(nov.weeks[0]![0]).toBe("2026-11-01"); // 01/11/2026 é domingo
    expect(nov.weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(nov.byDay.get("2026-11-21")).toHaveLength(2);
    expect([nov.totalCents, nov.points, nov.events.length]).toEqual([40670, 12000, 2]);
    expect(ms[0]!.weeks[0]!.slice(0, 4)).toEqual([null, null, null, null]); // 01/01/2026 é quinta
  });
});
