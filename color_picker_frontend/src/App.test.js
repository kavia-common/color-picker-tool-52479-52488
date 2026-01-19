import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

test("renders color picker title", () => {
  render(<App />);
  expect(screen.getByText(/color picker/i)).toBeInTheDocument();
});

test("renders gradient generator section", () => {
  render(<App />);
  expect(screen.getByText(/gradient generator/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /copy css/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export png/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export svg/i })).toBeInTheDocument();
});

test("copy css button copies snippet to clipboard and shows success toast", async () => {
  const user = userEvent.setup();

  const writeText = jest.fn().mockResolvedValue(undefined);

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  render(<App />);

  await user.click(screen.getByRole("button", { name: /copy css/i }));

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  // Ensure it copied the full CSS declaration (not just the gradient function)
  expect(writeText.mock.calls[0][0]).toMatch(/^background:\s*linear-gradient\(/i);

  // aria-live status should show confirmation
  expect(await screen.findByText(/copied css to clipboard/i)).toBeInTheDocument();
});
