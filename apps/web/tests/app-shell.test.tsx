import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppShell, { useSession } from "../components/AppShell";
import { session } from "../lib/api";
import type { Session } from "../lib/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/register",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../lib/api", () => ({ session: vi.fn(), request: vi.fn() }));

function Workspace() {
  const [email, setEmail] = useState("");
  const { refresh } = useSession();
  return (
    <>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button onClick={() => void refresh()}>Refresh principal</button>
    </>
  );
}

describe("session discovery and private workspace state", () => {
  beforeEach(() => vi.mocked(session).mockReset());

  it("preserves text typed before the initial session response arrives", async () => {
    let resolve!: (value: Session) => void;
    vi.mocked(session).mockReturnValue(
      new Promise<Session>((done) => {
        resolve = done;
      }),
    );
    render(
      <AppShell>
        <Workspace />
      </AppShell>,
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "planner@example.test" },
    });
    await act(async () => resolve({ user: null, csrf_token: "initial-guest" }));
    expect(screen.getByLabelText("Email")).toHaveValue("planner@example.test");
  });

  it("clears private state when an established guest or account changes", async () => {
    vi.mocked(session).mockResolvedValue({
      user: null,
      csrf_token: "guest-one",
    });
    render(
      <AppShell>
        <Workspace />
      </AppShell>,
    );
    await waitFor(() => expect(session).toHaveBeenCalledOnce());
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest-private-note" },
    });
    vi.mocked(session).mockResolvedValue({
      user: null,
      csrf_token: "guest-two",
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh principal" }));
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveValue(""));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "another-private-note" },
    });
    vi.mocked(session).mockResolvedValue({
      user: {
        id: "account-one",
        email: "owner@example.test",
        display_name: "Owner",
      },
      csrf_token: "account-token",
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh principal" }));
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveValue(""));
  });
});
