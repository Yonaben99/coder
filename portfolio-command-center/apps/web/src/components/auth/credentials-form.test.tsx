import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialsForm } from "./credentials-form";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

describe("CredentialsForm", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { id: "1", email: "trader@example.com" } }),
      }),
    );
  });

  it("submits login credentials to the API and navigates home on success", async () => {
    const user = userEvent.setup();
    render(<CredentialsForm mode="login" />);

    await user.type(screen.getByLabelText("Email"), "trader@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/login"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email: "trader@example.com", password: "correct horse battery staple" }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows the API error message instead of navigating when credentials are rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } }),
      }),
    );
    const user = userEvent.setup();
    render(<CredentialsForm mode="login" />);

    await user.type(screen.getByLabelText("Email"), "trader@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong password entirely");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(push).not.toHaveBeenCalled();
  });
});
