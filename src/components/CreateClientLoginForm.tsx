"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { createClientLogin, type CreateClientLoginState } from "@/app/crm/clinicas/actions";

const initialState: CreateClientLoginState = { error: null };

// Client component só por causa de duas coisas que precisam de estado no
// navegador: o toggle de mostrar/ocultar senha, e useFormState pra mostrar
// o erro (ex: e-mail duplicado) como mensagem no formulário em vez de
// derrubar a página inteira — ver createClientLogin. useFormState (não
// useActionState) porque o projeto está no React 18 — useActionState só
// existe a partir do React 19.
export function CreateClientLoginForm({ clinicId }: { clinicId: string }) {
  const [state, formAction] = useFormState(createClientLogin.bind(null, clinicId), initialState);
  const [showPassword, setShowPassword] = useState(false);

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
