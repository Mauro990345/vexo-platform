import { ColorBadge } from "@/components/ColorBadge";

// 2 letras: iniciais de nome+sobrenome, ou as 2 primeiras letras quando só
// há uma palavra (ex: @igUsername sem nome cadastrado) — "?" só no caso
// vazio, que não deveria acontecer na prática (name já cai pro igUsername
// antes de chegar aqui, ver clinicas/[id]/page.tsx).
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

// Cor fixa (accent) pra todo lead, de propósito — variar por lead ia
// disputar com as cores semânticas já usadas no Pipeline (verde/amarelo/
// vermelho = compareceu/pendente/precisa de humano), então um avatar
// aleatoriamente vermelho ou amarelo pareceria um alerta sem ser um.
export function InitialsAvatar({ name, className = "h-7 w-7" }: { name: string; className?: string }) {
  return (
    <ColorBadge color="accent" shape="circle" size={className} className="text-caption font-semibold">
      {initialsFor(name)}
    </ColorBadge>
  );
}
