"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";

// icon é um elemento já renderizado (ex: <Building2 className="h-4 w-4" />),
// não a referência do componente — passar a função do ícone como prop de um
// Server Component (os layouts) pra este Client Component não serializa
// (React só sabe passar elementos/JSX pela fronteira server→client, não
// referências de função soltas).
export type NavItem = { href: string; label: string; icon: React.ReactNode };
export type NavGroup = { label: string; items: NavItem[] };

// Resolve o item ativo pelo prefixo mais específico — evita que "/crm" fique
// destacado junto com "/crm/follow-up" quando ambos "batem" no pathname.
function resolveActiveHref(pathname: string, groups: NavGroup[]): string | null {
  const items = groups.flatMap((g) => g.items);
  const matches = items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (matches.length === 0) return null;
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).href;
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
        active
          ? "bg-vexo-accent/15 text-vexo-accent"
          : "text-vexo-muted hover:bg-vexo-surface2 hover:text-vexo-fg"
      }`}
    >
      {item.icon}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// Um único componente de sidebar, reaproveitado tanto pelo CRM interno
// quanto pelo painel do cliente (cada layout passa seus próprios grupos —
// não é o mesmo MENU pros dois papéis, é o mesmo COMPONENTE/estilo).
export function AppShell({
  navGroups,
  userLabel,
  children,
}: {
  navGroups: NavGroup[];
  userLabel: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const activeHref = resolveActiveHref(pathname, navGroups);
  const flatItems = navGroups.flatMap((g) => g.items);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-vexo-border bg-vexo-surface sm:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
          <span className="h-7 w-7 shrink-0 rounded-lg bg-vexo-accent" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none tracking-tight">VEXO</p>
            <p className="mt-1 truncate text-[11px] leading-none text-vexo-muted">M8 Growth</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-4 px-3 py-2">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-vexo-muted">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} active={item.href === activeHref} />
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-vexo-border p-3">
          <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
            <span className="truncate text-xs text-vexo-muted">{userLabel}</span>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-vexo-border bg-vexo-surface px-4 py-3 sm:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-md bg-vexo-accent" />
            <span className="text-sm font-semibold tracking-tight">VEXO</span>
          </Link>
          <SignOutButton />
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-vexo-border px-3 py-2 sm:hidden">
          {flatItems.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                  active ? "bg-vexo-accent/15 text-vexo-accent" : "text-vexo-muted hover:text-vexo-fg"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
