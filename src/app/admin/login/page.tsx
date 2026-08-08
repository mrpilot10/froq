"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FROQ_LOGO_SRC } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("capt.tanmay10@gmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(signError.message);
        return;
      }
      const res = await fetch("/api/admin/session", { method: "GET" });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) {
        await supabase.auth.signOut();
        setError(body.error ?? "This account is not a Froq super admin.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={onSubmit}>
        <div className="admin-login-brand">
          <img src={FROQ_LOGO_SRC} alt="" width={36} height={36} />
          <div>
            <h1 className="admin-login-title">Super Admin</h1>
            <p className="admin-login-sub">Internal Froq operators only</p>
          </div>
        </div>

        {error ? <p className="admin-login-error">{error}</p> : null}

        <div className="admin-field">
          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="admin-login-btn" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
