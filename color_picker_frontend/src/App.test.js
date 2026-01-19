import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

function mockCanvasWithImageData(colors) {
  // colors: array of [r,g,b,a] tuples to be repeated
  const bytes = [];
  for (let i = 0; i < 400; i += 1) {
    const c = colors[i % colors.length];
    bytes.push(c[0], c[1], c[2], c[3]);
  }

  Object.defineProperty(global.HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: function getContext(type) {
      if (type !== "2d") return null;

      return {
        drawImage: jest.fn(),
        getImageData: jest.fn(() => ({
          data: new Uint8ClampedArray(bytes),
        })),
        createLinearGradient: jest.fn(() => ({
          addColorStop: jest.fn(),
        })),
        fillRect: jest.fn(),
        set fillStyle(_) {},
      };
    },
  });

  Object.defineProperty(global.HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: function toBlob(cb) {
      cb(new Blob(["x"], { type: "image/png" }));
    },
  });
}

function mockImageDecode() {
  // Ensure the Image used in App can "load" immediately.
  class InstantImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.crossOrigin = "";
      this.naturalWidth = 100;
      this.naturalHeight = 100;
      this.width = 100;
      this.height = 100;
    }

    set src(_v) {
      // Simulate async-ish load
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    }
  }

  // eslint-disable-next-line no-global-assign
  global.Image = InstantImage;
}

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

  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });

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

test("copy css falls back to execCommand when clipboard API rejects", async () => {
  const user = userEvent.setup();

  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });

  const writeText = jest.fn().mockRejectedValue(new Error("NotAllowedError"));
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  const execSpy = jest.spyOn(document, "execCommand").mockReturnValue(true);

  render(<App />);

  await user.click(screen.getByRole("button", { name: /copy css/i }));

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  await waitFor(() => {
    expect(execSpy).toHaveBeenCalledWith("copy");
  });

  expect(await screen.findByText(/copied css to clipboard/i)).toBeInTheDocument();

  execSpy.mockRestore();
});

test("palette from image: shows upload input", () => {
  render(<App />);
  expect(
    screen.getByLabelText(/upload image for palette extraction/i)
  ).toBeInTheDocument();
});

test("palette from image: renders up to 5 swatches after upload (mocked canvas)", async () => {
  mockImageDecode();
  mockCanvasWithImageData([
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 0, 255],
    [0, 255, 255, 255],
  ]);

  render(<App />);

  const input = screen.getByLabelText(/upload image for palette extraction/i);

  const file = new File(["img"], "test.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });

  // Should eventually render swatch buttons (aria-label "Select #RRGGBB")
  await waitFor(() => {
    const swatches = screen.getAllByRole("button", { name: /^select #/i });
    expect(swatches.length).toBeGreaterThan(0);
    expect(swatches.length).toBeLessThanOrEqual(5);
  });
});

test("palette from image: clicking a swatch updates selected HEX output", async () => {
  const user = userEvent.setup();

  mockImageDecode();
  // Strongly favor a single color to make deterministic first swatch
  mockCanvasWithImageData([
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [0, 0, 255, 255],
  ]);

  render(<App />);

  const input = screen.getByLabelText(/upload image for palette extraction/i);
  const file = new File(["img"], "test.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });

  const swatch = await screen.findByRole("button", { name: /select #/i });

  await user.click(swatch);

  // The HEX output should become the chosen swatch (red-ish: #ff0000)
  expect(await screen.findByText("#FF0000")).toBeInTheDocument();
});
