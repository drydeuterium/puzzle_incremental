import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders compute, board, pieces, and locked upgrade reasons", () => {
    render(<App />);
    expect(screen.getByTestId("compute")).toHaveTextContent("0 C");
    expect(screen.getByRole("grid", { name: "Puzzle board" })).toBeInTheDocument();
    expect(screen.getAllByText(/Ready|Placed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not enough Compute/).length).toBeGreaterThan(0);
  });

  it("selects and rotates a piece", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("piece-p0"));
    await user.click(screen.getByText("Rotate Right"));
    expect(screen.getByTestId("piece-p0")).toHaveTextContent("rot");
  });

  it("shows theme settings", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText("Settings"));
    expect(screen.getByLabelText("Theme")).toHaveValue("system");
    await user.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(screen.getByLabelText("Theme")).toHaveValue("dark");
  });
});
