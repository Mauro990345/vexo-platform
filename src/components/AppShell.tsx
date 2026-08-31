import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

export function AppShell({
  title,
  navItems,
  userLabel,
  children,
}: {
  title: string;
  navItems: { href: string; label: string }[];
  userLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-vexo-border bg-vexo-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-md bg-vexo-accent" />
              <span className="text-sm font-semibold tracking-tight">VEXO</span>
              <span className="hidden text-xs text-vexo-muted sm:inline">/ {title}</span>
            </Link>
            <nav className="hidden gap-4 sm:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-vexo-muted transition hover:text-vexo-fg"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-vexo-muted sm:inline">{userLabel}</span>
            <SignOutButton />
          </div>
        </div>
        <nav className="flex gap-4 overflow-x-auto border-t border-vexo-border px-4 py-2 sm:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap text-sm text-vexo-muted transition hover:text-vexo-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
