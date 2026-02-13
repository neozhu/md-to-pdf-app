import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Verify Email",
  description: "Check your inbox to verify your account.",
};

type VerifyEmailPageProps = {
  searchParams: Promise<{
    email?: string;
    next?: string;
  }>;
};

function getMailboxUrl(email?: string) {
  if (!email || !email.includes("@")) return "https://mail.google.com";
  const domain = email.split("@")[1]?.toLowerCase() ?? "";

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return "https://mail.google.com";
  }
  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com") {
    return "https://outlook.live.com/mail/";
  }
  if (domain === "yahoo.com") {
    return "https://mail.yahoo.com";
  }
  if (domain === "qq.com") {
    return "https://mail.qq.com";
  }
  if (domain === "163.com") {
    return "https://mail.163.com";
  }
  if (domain === "126.com") {
    return "https://mail.126.com";
  }

  return "https://mail.google.com";
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { email, next } = await searchParams;
  const safeNext = next && next.startsWith("/") ? next : "/";
  const mailboxUrl = getMailboxUrl(email);

  return (
    <main className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Card className="rounded-xl border p-6 shadow-none">
          <h1 className="text-xl font-semibold">Activate your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We sent a verification email
            {email ? (
              <>
                {" "}
                to <span className="font-medium text-foreground">{email}</span>
              </>
            ) : null}
            . Please click the link in that email before signing in.
          </p>

          <div className="mt-6 space-y-3">
            <a
              href={mailboxUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open Mailbox (New Window)
            </a>
            <Link
              href={`/login?next=${encodeURIComponent(safeNext)}`}
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Back to login
            </Link>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Didn&apos;t receive it? Check spam/junk and wait a minute before trying again.
          </p>
        </Card>
      </div>
    </main>
  );
}
