import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Autenticação por e-mail + senha, sem expiração de sessão (login permanente
// até revogação manual — conforme especificação do painel do cliente).
// O mesmo provider atende usuários internos (CRM) e clientes (painel),
// diferenciados pelo campo `role`.

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 365, // 1 ano — renovado a cada login; revogação é manual (desativar usuário)
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        if (user.role === "CLIENT" && user.clinicId) {
          const clinic = await prisma.clinic.findUnique({ where: { id: user.clinicId } });
          if (!clinic?.active) return null; // acesso revogado quando contrato encerra
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          clinicId: user.clinicId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.clinicId = user.clinicId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role;
        session.user.clinicId = (token.clinicId as string | null) ?? null;
      }
      return session;
    },
  },
};
