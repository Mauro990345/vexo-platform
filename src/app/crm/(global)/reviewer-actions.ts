"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";

// Login "Revisor" (ver UserRole.REVIEWER, DESIGN.md) — e-mail/clínica
// FIXOS por design, não configuráveis pela tela: um login só, sempre o
// mesmo, sempre da Clínica Demo VEXO. "Login de revisão" em Contas (ver
// ReviewerLoginSection.tsx) só ativa/desativa e troca a senha dele.
const REVIEWER_EMAIL = "revisor@vexoia.com.br";
const REVIEWER_NAME = "Revisor Meta";

export type ReviewerLoginStatus = { exists: boolean; email: string; active: boolean };

export async function getReviewerLoginStatus(): Promise<ReviewerLoginStatus> {
  await requireAdminSession();
  const user = await prisma.user.findUnique({
    where: { email: REVIEWER_EMAIL },
    select: { active: true },
  });
  return user ? { exists: true, email: REVIEWER_EMAIL, active: user.active } : { exists: false, email: REVIEWER_EMAIL, active: false };
}

export async function toggleReviewerActiveAction(): Promise<ReviewerLoginStatus> {
  await requireAdminSession();
  const user = await prisma.user.findUnique({ where: { email: REVIEWER_EMAIL }, select: { id: true, active: true } });
  if (!user) {
    throw new Error('Login Revisor ainda não existe — clique em "Gerar nova senha" primeiro.');
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data: { active: !user.active }, select: { active: true } });
  revalidatePath("/crm");
  return { exists: true, email: REVIEWER_EMAIL, active: updated.active };
}

// 24 bytes aleatórios (crypto.randomBytes, não Math.random) em base64url —
// só caracteres seguros pra copiar/colar numa URL ou campo de texto sem
// escapar nada, ~32 caracteres, entropia bem acima do mínimo de 8 do resto
// do sistema (ver setup/actions.ts).
function generateStrongPassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

// Cria o login Revisor (1ª vez, com clinicId fixo = Clínica Demo VEXO) ou
// só troca a senha de um que já existe — mesmo botão nos dois casos (ver
// ReviewerLoginSection.tsx). Devolve a senha em texto puro, UMA ÚNICA VEZ,
// só no valor de retorno desta chamada — nunca gravada (só o hash vai pro
// banco), nunca logada (nenhum console.log/throw com o valor dela).
export async function generateReviewerPasswordAction(): Promise<{ password: string; status: ReviewerLoginStatus }> {
  await requireAdminSession();

  const password = generateStrongPassword();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: REVIEWER_EMAIL },
    create: { email: REVIEWER_EMAIL, name: REVIEWER_NAME, role: "REVIEWER", clinicId: DEMO_CLINIC_ID, passwordHash },
    update: { passwordHash },
    select: { active: true },
  });

  revalidatePath("/crm");
  return { password, status: { exists: true, email: REVIEWER_EMAIL, active: user.active } };
}
