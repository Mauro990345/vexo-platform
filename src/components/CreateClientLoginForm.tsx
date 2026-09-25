"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { createClientLogin, type CreateClientLoginState } from "@/app/crm/clinicas/actions";

const initialState: CreateClientLoginState = { error: null };

type CreatedAccess = { email: string; password: string };

// Client component só por causa de duas coisas que precisam de estado no
// navegador: o toggle de mostrar/ocultar senha, e useFormState pra mostrar
// o erro (ex: e-mail duplicado) como mensagem no formulário em vez de
// derrubar a página inteira — ver createClientLogin. useFormState (não
// useActionState) porque o projeto está no React 18 — useActionState só
// existe a partir do React 19.
//
// A senha só existe em texto puro aqui, no navegador, no instante em que a
// pessoa acabou de digitar — o backend já salva com bcrypt (createClientLogin)
// e nunca devolve a senha de volta. Por isso o resumo pra copiar (link +
// e-mail + senha) é montado a partir do próprio FormData enviado, não de
// nada que o servidor retorne: depois desse envio, essa é a única janela
// em que a senha existe em algum lugar legível — se a pessoa não copiar
// agora, não tem como recuperar depois (nem "Acesso do cliente ao painel
// dele" mostra, de propósito).
export function CreateClientLoginForm({ clinicId }: { clinicId: string }) {
  const [created, setCreated] = useState<CreatedAccess | null>(null);
  const [copied, setCopied] = useState(false);

  async function action(prevState: CreateClientLoginState, formData: FormData) {
    const result = await createClientLogin(clinicId, prevState, formData);
    if (!result.error) {
      setCreated({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
    }
    return result;
  }

  const [state, formAction] = useFormState(action, initialState);
  const [showPassword, setShowPassword] = useState(false);

  if (created) {
    const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
    const summary = `Acesso ao painel VEXO\nLink: ${loginUrl}\nE-mail: ${created.email}\nSenha: ${created.password}`;

    async function handleCopy() {
      try {
        await navigator.clipboard.writeText(summary);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard API pode falhar (contexto não seguro, permissão negada) —
        // o resumo já fica visível na tela pra copiar manualmente nesse caso.
      }
    }

    return (
      <div className="space-y-2 rounded-lg border border-vexo-success/40 bg-vexo-success/10 p-2.5 text-xs">
        <p className="font-medium text-vexo-fg">
          Acesso criado. Copie agora — a senha não fica salva em texto, não será possível ver de novo depois.
        </p>
        <div className="space-y-0.5 text-vexo-muted">
          <p className="break-all">
            <span className="text-vexo-fg">Link: </span>
            {loginUrl}
          </p>
          <p className="break-all">
            <span className="text-vexo-fg">E-mail: </span>
            {created.email}
          </p>
          <p className="break-all">
            <span className="text-vexo-fg">Senha: </span>
            {created.password}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
        >
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
          {copied ? "Copiado!" : "Copiar link, e-mail e senha"}
        </button>
        <button
          type="button"
          onClick={() => setCreated(null)}
          className="w-full text-center text-vexo-muted hover:text-vexo-fg"
        >
          Criar outro acesso
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-1.5 pt-1">
      <input
        name="name"
        placeholder="Nome do responsável"
        required
        className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
      />
      <input
        name="email"
        type="email"
        placeholder="E-mail"
        required
        className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
      />
      <div className="relative">
        <input
          name="password"
          type={showPassword ? "text" : "password"}
          placeholder="Senha (mín. 8 caracteres)"
          required
          minLength={8}
          className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 pr-8 text-xs outline-none focus:border-vexo-accent"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-vexo-muted hover:text-vexo-fg"
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
        >
          {showPassword ? <EyeOff className="h-3.5 w-3.5" strokeWidth={2} /> : <Eye className="h-3.5 w-3.5" strokeWidth={2} />}
        </button>
      </div>

      {state.error && <p className="text-caption text-vexo-error">{state.error}</p>}

      <button
        type="submit"
        className="w-full rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
      >
        Criar acesso
      </button>
    </form>
  );
}
