"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// Bootstrap do primeiro usuário interno admin, via interface — usado no lugar
// do seed via Railway CLI. Rota pública, mas protegida em duas camadas:
//  1) só funciona enquanto não existir nenhum INTERNAL_ADMIN no banco;
//  2) exige ADMIN_SETUP_TOKEN (variável de ambiente) — sem ela configurada,
//     a rota fica desabilitada por padrão (fail closed).

export async function createFirstAdmin(formData: FormData) {
  const setupToken = process.env.ADMIN_SETUP_TOKEN;
  if (!setupToken) {
    throw new Error(
      "ADMIN_SETUP_TOKEN não configurado no ambiente — configure a variável no Railway antes de usar esta tela."
    );
  }

  const providedToken = String(formData.get("setupToken") ?? "");
  if (providedToken !== setupToken) {
    throw new Error("Token de configuração inválido.");
  }

  const existingAdmin = await prisma.user.findFirst({ where: { role: "INTERNAL_ADMIN" } });
  if (existingAdmin) {
    throw new Error("Já existe um administrador cadastrado. Use a tela de login normal.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || password.length < 8) {
    throw new Error("Preencha nome, e-mail e senha (mín. 8 caracteres).");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: { name, email, passwordHash, role: "INTERNAL_ADMIN" },
  });

  redirect("/login?setup=ok");
}
