"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LoginFormProps = {
  nextPath?: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const isSignUp = mode === "signup";

  const redirectPath = React.useMemo(() => {
    if (!nextPath || !nextPath.startsWith("/")) return "/";
    return nextPath;
  }, [nextPath]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password.");
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (isSignUp && password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        mode,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      needsEmailConfirmation?: boolean;
      message?: string;
    };

    if (!res.ok) {
      toast.error(data.error ?? "Authentication failed.");
      setIsSubmitting(false);
      return;
    }

    if (data.needsEmailConfirmation) {
      toast.message(data.message ?? "Please confirm your email.");
      setIsSubmitting(false);
      return;
    }

    toast.success(isSignUp ? "Account created." : "Signed in.");
    router.replace(redirectPath);
    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <Card className="rounded-xl border p-6 shadow-none">
      <div className="mb-6">
        <div className="mb-4 grid grid-cols-2 rounded-md border bg-muted/40 p-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setMode("signin")}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              mode === "signin" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setMode("signup")}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              mode === "signup" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Create Account
          </button>
        </div>
        <h1 className="text-xl font-semibold">
          {isSignUp ? "Create account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignUp
            ? "Register a new account to keep your history private."
            : "Use your account to access your private Markdown history."}
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={isSubmitting}
          />
        </div>

        {isSignUp ? (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="confirm-password">
              Confirm Password
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isSubmitting}
            />
          </div>
        ) : null}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSignUp ? "Create Account" : "Sign In"}
        </Button>

        {!isSignUp ? (
          <div className="text-right text-sm">
            <Link
              href="/forgot-password"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Forgot password?
            </Link>
          </div>
        ) : null}
      </form>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account?" : "No account yet?"}{" "}
        <button
          type="button"
          onClick={() => setMode(isSignUp ? "signin" : "signup")}
          className="font-medium text-foreground underline underline-offset-4"
          disabled={isSubmitting}
        >
          {isSignUp ? "Sign in here" : "Create one"}
        </button>
      </div>
    </Card>
  );
}
