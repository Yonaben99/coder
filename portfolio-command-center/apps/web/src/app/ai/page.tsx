import { AuthGate } from "@/components/layout/auth-gate";
import { AIChat } from "@/components/ai/ai-chat";

export default function AIPage() {
  return (
    <AuthGate>
      <AIChat />
    </AuthGate>
  );
}
