import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders color picker title", () => {
  render(<App />);
  expect(screen.getByText(/color picker/i)).toBeInTheDocument();
});

test("renders gradient generator section", () => {
  render(<App />);
  expect(screen.getByText(/gradient generator/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /copy css/i })).toBeInTheDocument();
});
