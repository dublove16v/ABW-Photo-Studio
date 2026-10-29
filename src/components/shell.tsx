import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const SUITE = [
  { href: "https://pearson-report.vercel.app", label: "Pearson", color: "#0ea5e9" },
  { href: "https://new-prices.vercel.app", label: "New Prices", color: "#22c55e" },
  { href: "https://six-million.vercel.app", label: "Six-Million", color: "#f59e0b" },
  { href: "https://not-advertised.vercel.app", label: "Not Advertised", color: "#ef4444" },
  { href: "https://aim.vercel.app", label: "AIM", color: "#8b5cf6" },
  { href: "https://xref-o-matic.vercel.app", label: "Xref-o-matic", color: "#06b6d4" },
  { href: "https://boxes-guides.vercel.app", label: "Boxes & Guides", color: "#f97316" },
  { href: "https://reductions.vercel.app", label: "Reductions", color: "#64748b" },
  { href: "https://super-helpful.vercel.app", label: "Super Helpful", color: "#10b981" },
] as const;

const LINKS = [
  { to: "/", label: "Lot" },
  { to: "/capture", label: "Capture" },
  { to: "/compare", label: "Compare" },
  { to: "/delivery", label: "Delivery" },
  { to: "/defaults", label: "Defaults" },
] as const;

export function Guard({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="min-h-screen bg-[#0f0f0f]">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="h-8 w-40 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-[#f5f5f4] text-[#1c1917]">
      <header className="bg-[#0f0f0f] text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded bg-white text-[10px] font-bold text-black">abw</span>
            <span className="text-sm font-medium">desk</span>
          </Link>
          <nav className="ml-2 hidden flex-1 items-center gap-1 overflow-x-auto text-xs lg:flex">
            {SUITE.map((s) => (
              <a
                key={s.href}
                href={s.href}
                className="shrink-0 rounded px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white"
                style={{ borderLeft: `2px solid ${s.color}` }}
              >
                {s.label}
              </a>
            ))}
            <span className="shrink-0 rounded bg-white px-2 py-1 text-black" style={{ borderLeft: "2px solid #7c3aed" }}>
              Photo Studio
            </span>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <UserButton />
          </div>
        </div>
      </header>
      <div className="bg-[#7c3aed] text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded bg-white/20 text-xs font-bold">PS</span>
          <div>
            <p className="text-lg font-semibold leading-none">Photo Studio</p>
            <p className="text-xs text-white/80">Vehicle photo pipeline</p>
          </div>
        </div>
      </div>
      <nav className="border-b border-[#e7e5e4] bg-white">
        <div className="mx-auto flex max-w-7xl gap-1 px-3">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`border-b-2 px-4 py-2.5 text-sm ${path === l.to ? "border-[#7c3aed] font-medium text-[#7c3aed]" : "border-transparent text-[#57534e] hover:text-[#1c1917]"}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-7xl px-4 py-5 pb-24 md:pb-10">{children}</main>
    </div>
  );
}
