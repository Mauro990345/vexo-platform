"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { THEME_COLOR_KEYS, THEME_DEFAULTS, type ThemeColors } from "@/lib/theme";

function readHex(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? "");
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Cor inválida para ${key}.`);
  }
  return value;
}

// Global — não é por clínica (ThemeSettings não tem clinicId), então
// revalidamos o app inteiro (inclusive o layout raiz, que é onde o style
// inline com as cores é montado).
export async function updateThemeSettings(formData: FormData) {
  await requireInternalSession();

  const colors = {} as ThemeColors;
  for (const key of THEME_COLOR_KEYS) {
    colors[key] = readHex(formData, key);
  }

  await prisma.themeSettings.upsert({
    where: { id: "singleton" },
    update: colors,
    create: { id: "singleton", ...colors },
  });

  revalidatePath("/", "layout");
}

export async function resetThemeSettings() {
  await requireInternalSession();

  await prisma.themeSettings.upsert({
    where: { id: "singleton" },
    update: THEME_DEFAULTS,
    create: { id: "singleton", ...THEME_DEFAULTS },
  });

  revalidatePath("/", "layout");
}
