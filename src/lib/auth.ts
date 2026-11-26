import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Autenticação por e-mail + senha, sem expiração de sessão (login permanente
// até revogação manual — conforme especificação do painel do cliente).
// O mesmo provider atende usuários internos (CRM) e clientes (painel),
// diferenciados pelo campo `role`.

// BUG REAL encontrado e corrigido (link "Painel completo" caindo na tela de
// login em vez de autenticar direto pelo token): o NextAuth decide o NOME
// do cookie de sessão (com ou sem o prefixo "__Secure-") sozinho, por
// padrão, olhando se `NEXTAUTH_URL` começa com "https://" — não o que o
// navegador/proxy realmente usa. Em produção (Railway), só `APP_URL` é
// garantidamente configurada (é a variável que o resto do app já usa pra
// montar todo link — ver uploads.ts, que lança erro se faltar); `NEXTAUTH_URL`
// pode simplesmente não existir como variável do serviço (ninguém além do
// próprio NextAuth a lê, fácil esquecer). Sem ela, o NextAuth cai no default
// "http://localhost:3000" por baixo dos panos e decide useSecureCookies=false
// — só que `acesso/[token]/route.ts`/`acesso-fila/[token]/route.ts` (login
// automático por token, que montam o cookie NA MÃO) decidem o nome do
// cookie olhando `APP_URL` (sempre https em produção) e gravam com o
// prefixo "__Secure-". Resultado: o cookie é gravado com um nome e o
// `getServerSession()` procura por outro — nunca bate, a sessão nunca é
// encontrada, e a página trata como "não logado" e manda pro /entrar.
// Fixado aqui, de vez: `useSecureCookies` explícito, derivado de `APP_URL`
// (nunca de `NEXTAUTH_URL`) — o MESMO critério que as rotas de token já
// usam, então os dois lados sempre concordam no nome do cookie,
// independente de `NEXTAUTH_URL` estar ou não configurada no ambiente.
const useSecureCookies = (process.env.APP_URL ?? "").startsWith("https://");

export const authOptions: NextAuthOptions = {
  useSecureCookies,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 365, // 1 ano — renovado a cada login; revogação é manual (desativar usuário)
  },
  pages: {
    signIn: "/entrar",
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

        // Login desativado (ver User.active) — pensado pro login Revisor,
        // vale pra qualquer usuário. Quem já está logado perde o acesso na
        // próxima requisição por outro caminho (ver requireSession,
        // session.ts); aqui é só o bloqueio na hora de entrar.
        if (!user.active) return null;

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
        // Repassa o escopo (ver next-auth.d.ts) só quando presente —
        // nunca gravado aqui, só lido: quem grava é o encode() manual do
        // login por link (/acesso-fila/[token]/route.ts), fora deste
        // callback (não existe signIn() chamável fora de um POST de
        // formulário no NextAuth v4 — ver comentário grande lá).
        session.user.scope = token.scope ?? null;
      }
      return session;
    },
  },
};
