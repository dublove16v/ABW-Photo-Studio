import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function emailAuth(kind: "in" | "up") {
    setBusy(true);
    setError("");
    try {
      const path = kind === "in" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, name: email.split("@")[0] || "Lot" }),
      });
      if (!res.ok) {
        setError("Use a real email and 8 or more characters.");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Sign-in did not complete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10 text-ink">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="font-display text-sm tracking-widest text-muted">A BETTER WAY</p>
          <h1 className="font-display text-5xl leading-none">Photo Studio</h1>
          <p className="mt-2 text-sm text-muted">One login per photographer. Photos stay off the database.</p>
        </div>
        {authEnabled ? (
          <>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void emailAuth("in");
              }}
            >
              <label className="block text-sm">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-3"
                />
              </label>
              <label className="block text-sm">
                Password
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-3"
                />
              </label>
              {error && <p className="text-sm text-primary">{error}</p>}
              <button type="submit" disabled={busy} className="w-full rounded-lg bg-primary py-3 text-primary-fg">
                Sign in
              </button>
              <button type="button" disabled={busy} onClick={() => void emailAuth("up")} className="w-full rounded-lg border border-line bg-surface py-3">
                Create login
              </button>
            </form>
            <div className="space-y-2">
              {GROK_PROVIDERS.map((p) => (
                <button
                  key={p.providerId}
                  type="button"
                  onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                  className="w-full rounded-lg border border-line bg-surface px-4 py-3"
                >
                  Continue with {p.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Sign-in is off.</p>
        )}
      </div>
    </main>
  );
}
