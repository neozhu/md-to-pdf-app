"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email.");
      return;
    }

    setIsSubmitting(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };

    if (!res.ok) {
      toast.error(data.error ?? "Failed to send reset email.");
      setIsSubmitting(false);
      return;
    }

    setSubmitted(true);
    setIsSubmitting(false);
    toast.success("Reset email sent.");
  }

  return (
    <Card className="rounded-xl border p-6 shadow-none">
      <h1 className="text-xl font-semibold">Forgot password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your email and we&apos;ll send a reset link.
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
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
            disabled={isSubmitting || submitted}
          />
        </div>

        <Button type="submit" disabled={isSubmitting || submitted} className="w-full">
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Send Reset Link
        </Button>
      </form>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Back to login
        </Link>
      </div>
    </Card>
  );
}
