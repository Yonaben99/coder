import Link from "next/link";
import { CredentialsForm } from "@/components/auth/credentials-form";

export default function SignupPage() {
  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Create your account</h1>
      <CredentialsForm mode="signup" />
      <p className="text-sm text-[var(--text-secondary)]">
        Already have an account? <Link href="/login" className="text-[var(--color-accent)] hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
