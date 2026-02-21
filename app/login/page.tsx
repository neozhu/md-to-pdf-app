import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import ShaderBackground from "@/components/ui/shader-background";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to access your Markdown history.",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;

  return (
    <main className="relative min-h-dvh overflow-hidden px-4 py-10">
      <ShaderBackground />
      <div className="absolute inset-0 bg-background/55 backdrop-blur-[1px]" />
      <div className="relative mx-auto w-full max-w-md">
        <LoginForm nextPath={next} />
      </div>
    </main>
  );
}
