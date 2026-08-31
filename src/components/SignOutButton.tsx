"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-lg border border-vexo-border px-3 py-1.5 text-xs text-vexo-muted transition hover:border-vexo-accent hover:text-vexo-fg"
    >
      Sair
    </button>
  );
}
