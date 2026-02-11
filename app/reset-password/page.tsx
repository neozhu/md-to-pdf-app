import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your account.",
};

export default function ResetPasswordPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <ResetPasswordForm />
      </div>
    </main>
  );
}
