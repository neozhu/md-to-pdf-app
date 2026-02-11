import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Request a password reset email.",
};

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
