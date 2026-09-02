"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      title="Sair"
      className="flex shrink-0 items-center gap-1.5 rounded-md p-1.5 text-vexo-muted transition hover:bg-vexo-surface hover:text-vexo-fg"
    >
      <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}
