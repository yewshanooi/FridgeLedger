"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signup } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password || !confirm) {
      setError("Please fill in all fields.");
      return;
    }
    if (!email.toLowerCase().endsWith("@gmail.com")) {
      setError("Only Gmail addresses (@gmail.com) are allowed.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const result = await signup(name, email, password);
      if (result.needsConfirmation) {
        setConfirming(true);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
      setIsLoading(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f4ee] px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1f2a24]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1f2a24]">Check your email</h1>
          <p className="mt-3 text-sm text-[#526056]">
            We sent a confirmation link to <span className="font-semibold text-[#1f2a24]">{email}</span>.
            Click the link to activate your account, then{" "}
            <Link href="/login" className="font-semibold text-emerald-700 hover:underline">sign in</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f4ee] px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1f2a24]">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#34d399"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1f2a24]">FridgeLedger</h1>
          <p className="mt-1 text-sm text-[#526056]">Create your account</p>
        </div>

        <div className="rounded-2xl border border-[#d7d0c3] bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jorden Tan"
                autoComplete="name"
                className="mt-1.5 w-full rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
                Email{" "}
                <span className="normal-case font-normal text-[#6a756d]">
                  (Gmail only)
                </span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
                autoComplete="email"
                className="mt-1.5 w-full rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
                className="mt-1.5 w-full rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="mt-1.5 w-full rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-[#aab4ad]"
            >
              {isLoading ? "Creating account..." : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-[#526056]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-emerald-700 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
