"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { THEME_COLOR_KEYS, THEME_DEFAULTS, type ThemeColors } from "@/lib/theme";
import { PAGE_STYLE_SECTIONS } from "@/lib/page-style-overrides";

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

// Um campo "personalizado" é uma linha em PageStyleOverride (id = a chave
// do campo); desmarcar o toggle APAGA a linha em vez de só desativar um
// flag — assim nunca sobra um valor "desligado" esquecido no banco, e a
// ausência da linha já significa, por si só, "siga a cor global".
export async function updatePageStyleOverrides(formData: FormData) {
  await requireInternalSession();

  const writes = [];
  for (const field of PAGE_STYLE_SECTIONS.flatMap((s) => s.fields)) {
    const isEnabled = formData.get(`${field.key}.enabled`) === "on";
    if (isEnabled) {
      const value = String(formData.get(`${field.key}.value`) ?? "");
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
        throw new Error(`Cor inválida para ${field.key}.`);
      }
      writes.push(
        prisma.pageStyleOverride.upsert({
          where: { id: field.key },
          update: { value },
          create: { id: field.key, value },
        })
      );
    } else {
      writes.push(prisma.pageStyleOverride.deleteMany({ where: { id: field.key } }));
    }
  }

  await prisma.$transaction(writes);
  revalidatePath("/", "layout");
}
