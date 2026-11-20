// Confere o TEXTO real da migration (não um banco de verdade — este
// sandbox não tem Postgres) — garante que ela preserva o comportamento de
// toda clínica já existente: as 4 caixinhas nascem true (DEFAULT, aplicado
// a toda linha já existente pelo ALTER TABLE) e, pra quem NÃO tem vídeo,
// um UPDATE depois desliga as 4 — nunca o contrário (clínica sem vídeo
// ganhando cafezinho/final sozinhos, ou clínica com vídeo perdendo algo).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "migrations/20261120000000_attendance_sequence_item_toggles/migration.sql"),
  "utf8"
);

const COLUMNS = [
  "confirmationVideoCaptionEnabled",
  "confirmationVideoEnabled",
  "attendanceTipEnabled",
  "attendanceFinalEnabled",
];

describe("migration 20261120000000_attendance_sequence_item_toggles", () => {
  it("adiciona as 4 colunas novas em Clinic, cada uma com DEFAULT true (comportamento de quem JÁ TEM vídeo, preservado)", () => {
    for (const column of COLUMNS) {
      expect(MIGRATION_SQL).toMatch(
        new RegExp(`ALTER TABLE "Clinic" ADD COLUMN "${column}" BOOLEAN NOT NULL DEFAULT true;`)
      );
    }
  });

  it("desliga as 4 colunas pra clínica SEM vídeo (WHERE confirmationVideoUrl IS NULL) — nunca passa a mandar cafezinho/final sozinho", () => {
    const updateMatch = MIGRATION_SQL.match(/UPDATE "Clinic"\s*SET([\s\S]*?)WHERE "confirmationVideoUrl" IS NULL;/);
    expect(updateMatch, "UPDATE condicional por confirmationVideoUrl IS NULL não encontrado").not.toBeNull();

    const setClause = updateMatch![1]!;
    for (const column of COLUMNS) {
      expect(setClause).toMatch(new RegExp(`"${column}" = false`));
    }
  });

  it("não apaga nenhuma coluna existente (só ADD COLUMN, nunca DROP)", () => {
    expect(MIGRATION_SQL).not.toMatch(/DROP COLUMN/i);
  });
});

// Mesma regra, em forma de função pura — útil pra documentar/testar a
// INTENÇÃO da migration isoladamente do SQL em si (ver testes acima, que
// conferem o SQL de verdade). Clínica nova (sem rodar esta migration, só
// o DEFAULT do schema) também nasce com as 4 true — comportamento
// idêntico ao de uma clínica já existente que TEM vídeo.
function startsWithAttendanceItemsEnabled(confirmationVideoUrl: string | null): boolean {
  return confirmationVideoUrl !== null;
}

describe("startsWithAttendanceItemsEnabled (regra da migration, isolada)", () => {
  it("clínica já existente COM vídeo: as 4 caixinhas continuam true", () => {
    expect(startsWithAttendanceItemsEnabled("https://cdn/video.mp4")).toBe(true);
  });

  it("clínica já existente SEM vídeo: as 4 caixinhas ficam false", () => {
    expect(startsWithAttendanceItemsEnabled(null)).toBe(false);
  });
});
