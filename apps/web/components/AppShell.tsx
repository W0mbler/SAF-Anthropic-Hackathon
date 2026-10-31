"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { ArrowUpRight, Command, LogOut, UserRound } from "lucide-react";
import { request, session } from "../lib/api";
import type { Session } from "../lib/types";
const SessionContext = createContext<{
  value: Session | null;
  refresh: () => Promise<void>;
}>({ value: null, refresh: async () => {} });
export const useSession = () => useContext(SessionContext);
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [value, setValue] = useState<Session | null>(null);
  const [error, setError] = useState("");
  async function refresh() {
    try {
      setValue(await session());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <SessionContext.Provider value={{ value, refresh }}>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="SAF Command home">
          <span className="brand-symbol">
            <Command size={22} />
          </span>
          <span>
            SAF<span className="brand-light">COMMAND</span>
            <small>INFRASTRUCTURE INTELLIGENCE</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          {[
            ["/", "Overview"],
            ["/atlas", "Supply Atlas"],
            ["/optimize", "Optimise"],
            ["/compare", "Compare"],
            ["/about", "How it works"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "nav-active" : ""}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="account">
          {value?.user ? (
            <>
              <span className="session-label">
                <UserRound size={14} />
                {value.user.display_name || value.user.email}
              </span>
              <button
                className="icon-button"
                data-testid="logout"
                title="Log out"
                aria-label="Log out"
                onClick={async () => {
                  try {
                    await request("/auth/logout", "POST");
                    await refresh();
                    router.replace("/");
                    router.refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <span className="guest-dot" />
              <span className="session-label">Guest workspace</span>
              <Link href="/login" className="account-link">
                Sign in <ArrowUpRight size={14} />
              </Link>
            </>
          )}
        </div>
      </header>
      {error && (
        <div className="connection-banner" role="alert">
          {error}{" "}
          <button onClick={() => void refresh()}>Retry connection</button>
        </div>
      )}
      <main key={value?.user?.id || value?.csrf_token || "initial"}>
        {children}
      </main>
      <footer className="footer">
        <span>
          <span className="guest-dot" /> KALIMANTAN · INDONESIA
        </span>
        <span>Planning support · Illustrative assumptions · SciPy / HiGHS</span>
        <Link href="/about">Data & methodology ↗</Link>
      </footer>
    </SessionContext.Provider>
  );
}
