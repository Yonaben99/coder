import Link from "next/link";
import { CredentialsForm } from "@/components/auth/credentials-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Sign in</h1>
      <CredentialsForm mode="login" />
      <p className="text-sm text-[var(--text-secondary)]">
        No account? <Link href="/signup" className="text-[var(--color-accent)] hover:underline">Create one</Link>
      </p>
    </div>
  );
}
