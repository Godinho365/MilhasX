import { describe, it, expect } from "vitest";
import { assertE2eDatabase, deriveE2eUrl } from "../e2e/db";

const PROD = "postgresql://u:p@127.0.0.1:5444/milheiro?schema=public";

describe("banco dos testes E2E", () => {
  it("deriva o banco _e2e do banco de teste, no mesmo servidor", () => {
    expect(deriveE2eUrl("postgresql://u:p@127.0.0.1:5444/milheiro_test?schema=public")).toBe("postgresql://u:p@127.0.0.1:5444/milheiro_e2e?schema=public");
  });

  it("recusa o banco de produção e qualquer banco sem e2e no nome", () => {
    expect(() => assertE2eDatabase(PROD, PROD)).toThrow(/não é de E2E/);
    expect(() => assertE2eDatabase("postgresql://u:p@127.0.0.1:5444/milheiro_test", PROD)).toThrow(/não é de E2E/);
    expect(() => assertE2eDatabase("postgresql://u:p@127.0.0.1:5444/milheiro_e2e", "postgresql://u:p@127.0.0.1:5444/milheiro_e2e")).toThrow(/banco do app/);
    expect(() => assertE2eDatabase("postgresql://u:p@127.0.0.1:5444/milheiro_e2e", PROD)).not.toThrow();
  });
});
