import { type UserRole } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    role: UserRole;
    clinicId: string | null;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: UserRole;
      clinicId: string | null;
      // Escopo opcional, só presente numa sessão nascida do segundo link
      // de acesso do cliente (ver ClientFilaLink/acesso-fila/[token]/
      // route.ts) — "fila" trava /dashboard pra quem só tem esse link
      // (ver middleware.ts/isFilaScopeAllowedPath). Ausente/undefined em
      // toda sessão de login normal e no ClientPanelLink original
      // (acesso de painel completo).
      scope?: "fila" | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole;
    clinicId: string | null;
    scope?: "fila" | null;
  }
}
