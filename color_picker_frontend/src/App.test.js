import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders color picker title", () => {
  render(<App />);
  expect(screen.getByText(/color picker/i)).toBeInTheDocument();
});
