import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import "./App.css";

/**
 * Convert a CSS hex color (#RRGGBB) to an RGB object.
 * Returns null if the input is not a valid 6-digit hex.
 */
function hexToRgb(hex) {
  const normalized = String(hex || "").trim().toLowerCase();

  // Accept only #RRGGBB (the value emitted by <input type="color">)
  const match = normalized.match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;

  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return { r, g, b };
}

/**
 * Clamp a number to an inclusive range.
 */
function clamp(value, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Trigger a download for a given Blob.
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Let the click finish before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 250);
}

/**
 * Convert a CSS linear-gradient "angle" (where 0deg is up, 90deg is right)
 * into an SVG linearGradient vector (x1,y1,x2,y2 in objectBoundingBox space).
 *
 * In CSS:
 *  - 0deg points "to top"
 *  - 90deg points "to right"
 *
 * In SVG:
 *  - x increases to the right
 *  - y increases downward
 *
 * We map the direction into a vector and anchor it around the center.
 */
function cssAngleToSvgVector(angleDeg) {
  const rad = (Number(angleDeg) * Math.PI) / 180;

  // CSS "to top" at 0deg => direction (0,-1)
  // Using:
  //  x = sin(rad)
  //  y = -cos(rad)
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);

  // Convert to box endpoints around center (0.5, 0.5).
  // 0.5 offset yields endpoints that cover the box for any angle.
  const x1 = 0.5 - dx * 0.5;
  const y1 = 0.5 - dy * 0.5;
  const x2 = 0.5 + dx * 0.5;
  const y2 = 0.5 + dy * 0.5;

  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  return {
    x1: clamp01(x1),
    y1: clamp01(y1),
    x2: clamp01(x2),
    y2: clamp01(y2),
  };
}

/**
 * Convert RGB to #RRGGBB.
 */
function rgbToHex(r, g, b) {
  const to2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/**
 * Decode an image file into an HTMLImageElement.
 * Keeps logic isolated for easier mocking/testing.
 */
async function decodeImageFromFile(file) {
  const blobUrl = URL.createObjectURL(file);

  try {
    const img = new Image();
    // Best-effort; for local object URLs this is not required, but doesn't hurt.
    img.crossOrigin = "anonymous";

    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image."));
      img.src = blobUrl;
    });

    return img;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Extract prominent colors from an image using a lightweight quantization approach:
 * - Draw on an offscreen canvas scaled down to a manageable size.
 * - Quantize RGB into reduced bins (e.g., 5 bits per channel).
 * - Count frequency and return top N bins as representative colors.
 */
async function extractDominantColorsFromFile(file, options = {}) {
  const { maxSize = 110, maxColors = 5, binSize = 8 } = options;

  const img = await decodeImageFromFile(file);

  const srcW = Math.max(1, img.naturalWidth || img.width || 1);
  const srcH = Math.max(1, img.naturalHeight || img.height || 1);

  // Guard against extremely large decode sizes: we always downscale for processing.
  const scale = Math.min(maxSize / srcW, maxSize / srcH, 1);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  // Draw scaled image
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Bin map: key => { count, rSum, gSum, bSum }
  const bins = new Map();

  const step = Math.max(1, Number(binSize) || 8);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Skip fully transparent pixels
    if (a < 16) continue;

    // Quantize into bins (step is bucket size in [0..255])
    const rq = Math.floor(r / step) * step;
    const gq = Math.floor(g / step) * step;
    const bq = Math.floor(b / step) * step;

    const key = `${rq},${gq},${bq}`;

    const existing = bins.get(key);
    if (existing) {
      existing.count += 1;
      existing.rSum += r;
      existing.gSum += g;
      existing.bSum += b;
    } else {
      bins.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
    }
  }

  const sorted = Array.from(bins.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, maxColors);

  // Convert bin averages to hex.
  const colors = sorted.map(([, v]) => {
    const r = v.rSum / v.count;
    const g = v.gSum / v.count;
    const b = v.bSum / v.count;
    return rgbToHex(r, g, b);
  });

  // Ensure uniqueness but preserve order (different bins can average to same hex).
  const unique = [];
  const seen = new Set();
  for (const c of colors) {
    const k = c.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(c);
    }
  }

  return unique.slice(0, maxColors);
}

// PUBLIC_INTERFACE
function App() {
  /** Selected color is kept as HEX to match <input type="color"> value format. */
  const [hex, setHex] = useState("#3b82f6");

  const inputId = useId();

  const rgb = useMemo(() => hexToRgb(hex), [hex]);
  const rgbText = rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : "—";

  // Gradient generator state
  const [colorA, setColorA] = useState("#3b82f6");
  const [colorB, setColorB] = useState("#06b6d4");
  const [angle, setAngle] = useState(45);

  const gradientAId = useId();
  const gradientBId = useId();
  const angleSliderId = useId();
  const angleNumberId = useId();
  const snippetId = useId();

  const gradientCss = useMemo(
    () => `linear-gradient(${angle}deg, ${colorA}, ${colorB})`,
    [angle, colorA, colorB]
  );
  const cssSnippet = useMemo(() => `background: ${gradientCss};`, [gradientCss]);

  // Toast system (already present): we reuse it for palette events too.
  const [copyStatus, setCopyStatus] = useState("");
  const copyTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  function announceToast(message) {
    setCopyStatus(message);
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyStatus(""), 1800);
  }

  /** Palette-from-image state */
  const paletteInputId = useId();
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [paletteColors, setPaletteColors] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);

  // Tracks which gradient stop should be set next from a swatch.
  // On each swatch click: set A first, then B, and alternate.
  const nextGradientStopRef = useRef("A");

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  /**
   * Attempt to copy text to the user's clipboard.
   *
   * Strategy:
   *  1) Prefer async Clipboard API when available *and* likely permitted (secure context).
   *     - In some environments (http, iframe, or permission denied), writeText exists but rejects.
   *       We catch and fall back instead of surfacing an error to the user.
   *  2) Fallback to document.execCommand("copy") using a temporary textarea.
   *  3) Final fallback: prompt-based manual copy if both fail.
   */
  async function copyToClipboard(text) {
    const value = String(text ?? "");

    // 1) Modern clipboard API (best-effort).
    try {
      const hasAsyncClipboard = Boolean(navigator?.clipboard?.writeText);
      const isSecure =
        // Prefer explicit secureContext flag when present; otherwise infer from protocol.
        typeof window !== "undefined" && window.isSecureContext === true;

      if (hasAsyncClipboard && isSecure) {
        // Try to check permission when supported; ignore errors and still attempt writeText.
        // Some browsers (or iframes) will throw here even before writeText.
        try {
          if (navigator?.permissions?.query) {
            const res = await navigator.permissions.query({
              // "clipboard-write" is supported in Chromium; other browsers may throw.
              name: "clipboard-write",
            });
            if (res?.state === "denied") {
              throw new Error("Clipboard permission denied.");
            }
          }
        } catch (_ignoredPermissionError) {
          // If permissions API is unavailable/blocked, still attempt writeText.
        }

        await navigator.clipboard.writeText(value);
        return { method: "clipboard" };
      }
    } catch (_clipboardError) {
      // Continue to fallback paths.
    }

    // 2) execCommand fallback (works in many non-secure contexts).
    try {
      const el = document.createElement("textarea");
      el.value = value;

      // readonly prevents iOS from popping up the keyboard in some cases.
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.top = "0";
      el.style.left = "-9999px";
      el.style.opacity = "0";

      document.body.appendChild(el);
      el.focus();
      el.select();

      const ok = document.execCommand("copy");
      document.body.removeChild(el);

      if (ok) return { method: "execCommand" };
    } catch (_execCommandError) {
      // Continue to final fallback.
    }

    // 3) Manual fallback. (prompt is crude, but reliable everywhere)
    // Note: prompt may be blocked by some browsers; if so, throw.
    const promptText =
      "Copy this CSS snippet manually (Ctrl/Cmd+C), then press Enter:";
    const res = window.prompt(promptText, value);

    // If prompt is blocked it returns null; treat as failure.
    if (res === null) {
      throw new Error("Clipboard copy failed.");
    }

    return { method: "prompt" };
  }

  async function handleCopyCss() {
    try {
      const result = await copyToClipboard(cssSnippet);

      if (result.method === "prompt") {
        announceToast("Clipboard unavailable. Paste from the prompt.");
      } else {
        announceToast("Copied CSS to clipboard.");
      }
    } catch (e) {
      announceToast("Copy failed. Select the CSS and copy manually.");
    }
  }

  async function handleExportPng() {
    try {
      const width = 1920;
      const height = 1080;

      // Offscreen canvas render (no heavy deps)
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable.");

      // Canvas uses radians and 0 rad points to the right; CSS 0deg points up.
      // Convert by subtracting 90deg: CSS 90deg (to right) => 0rad
      const rad = ((Number(angle) - 90) * Math.PI) / 180;

      // Direction vector
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);

      // Compute endpoints across canvas center
      const cx = width / 2;
      const cy = height / 2;
      const halfDiag = Math.sqrt(width * width + height * height) / 2;

      const x1 = cx - dx * halfDiag;
      const y1 = cy - dy * halfDiag;
      const x2 = cx + dx * halfDiag;
      const y2 = cy + dy * halfDiag;

      const grd = ctx.createLinearGradient(x1, y1, x2, y2);
      grd.addColorStop(0, colorA);
      grd.addColorStop(1, colorB);

      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, width, height);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );

      if (!blob) throw new Error("PNG export failed.");

      downloadBlob(blob, "gradient.png");
      announceToast("Exported PNG.");
    } catch (e) {
      announceToast("PNG export failed.");
    }
  }

  function handleExportSvg() {
    try {
      const width = 1920;
      const height = 1080;

      const { x1, y1, x2, y2 } = cssAngleToSvgVector(angle);

      // Note: encode minimal SVG with a rect fill.
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" gradientUnits="objectBoundingBox" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
      <stop offset="0%" stop-color="${colorA}" />
      <stop offset="100%" stop-color="${colorB}" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#g)" />
</svg>`;

      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      downloadBlob(blob, "gradient.svg");
      announceToast("Exported SVG.");
    } catch (e) {
      announceToast("SVG export failed.");
    }
  }

  function handleApplySwatch(hexColor) {
    const normalized = String(hexColor || "").trim().toLowerCase();
    const valid = normalized.match(/^#([0-9a-f]{6})$/i);
    if (!valid) return;

    // Update single color picker (always present in current UI).
    setHex(normalized);

    // Update gradient stops (stop A first, then B, alternate).
    if (nextGradientStopRef.current === "A") {
      setColorA(normalized);
      nextGradientStopRef.current = "B";
    } else {
      setColorB(normalized);
      nextGradientStopRef.current = "A";
    }

    announceToast(`Selected ${normalized.toUpperCase()}.`);
  }

  async function runExtraction() {
    if (!imageFile) {
      announceToast("Please choose an image first.");
      return;
    }

    const maxBytes = 8 * 1024 * 1024; // 8MB guard
    if (imageFile.size > maxBytes) {
      announceToast("Image too large. Please choose a file under 8MB.");
      return;
    }

    setIsExtracting(true);
    announceToast("Extracting colors…");

    try {
      const colors = await extractDominantColorsFromFile(imageFile, {
        maxSize: 110,
        maxColors: 5,
        binSize: 8,
      });

      setPaletteColors(colors);
      announceToast(
        colors.length
          ? `Extracted ${colors.length} color${colors.length === 1 ? "" : "s"}.`
          : "No prominent colors found."
      );
    } catch (e) {
      setPaletteColors([]);
      announceToast("Color extraction failed. Try another image.");
    } finally {
      setIsExtracting(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0] || null;
    setPaletteColors([]);
    setImageFile(file);

    // Small debounce so quick successive changes don't queue multiple extractions.
    // We only auto-extract after a real selection.
    if (file) {
      window.setTimeout(() => {
        runExtraction();
      }, 120);
    }
  }

  return (
    <div className="App">
      <main className="Page">
        <div className="Stack" aria-label="Color tools">
          <section className="Card" aria-label="Color picker card">
            <header className="CardHeader">
              <div className="HeaderText">
                <h1 className="Title">Color Picker</h1>
                <p className="Subtitle">
                  Pick a color to see its HEX and RGB values in real time.
                </p>
              </div>

              <div className="PickerRow">
                <label className="Label" htmlFor={inputId}>
                  Color
                </label>
                <input
                  id={inputId}
                  className="ColorInput"
                  type="color"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  aria-describedby="color-values"
                />
              </div>
            </header>

            <div className="SwatchWrap" aria-label="Selected color preview">
              <div className="Swatch" style={{ backgroundColor: hex }} />
            </div>

            <div className="Values" id="color-values">
              <div className="ValueRow">
                <span className="ValueLabel">HEX</span>
                {/* aria-live helps screen readers announce changes as user drags/selects */}
                <output className="ValueCode" aria-live="polite">
                  {hex.toUpperCase()}
                </output>
              </div>

              <div className="ValueRow">
                <span className="ValueLabel">RGB</span>
                <output className="ValueCode" aria-live="polite">
                  {rgbText}
                </output>
              </div>
            </div>
          </section>

          <section className="Card" aria-label="Gradient generator card">
            <header className="CardHeader">
              <div className="HeaderText">
                <h2 className="Title">Gradient Generator</h2>
                <p className="Subtitle">
                  Choose two colors and an angle to generate a CSS linear-gradient.
                </p>
              </div>

              <div className="GridTwo">
                <div className="Field">
                  <label className="Label" htmlFor={gradientAId}>
                    Color A
                  </label>
                  <input
                    id={gradientAId}
                    className="ColorInput"
                    type="color"
                    value={colorA}
                    onChange={(e) => setColorA(e.target.value)}
                  />
                </div>

                <div className="Field">
                  <label className="Label" htmlFor={gradientBId}>
                    Color B
                  </label>
                  <input
                    id={gradientBId}
                    className="ColorInput"
                    type="color"
                    value={colorB}
                    onChange={(e) => setColorB(e.target.value)}
                  />
                </div>
              </div>

              <div className="AngleRow" aria-label="Angle controls">
                <div className="AngleTop">
                  <label className="Label" htmlFor={angleSliderId}>
                    Angle
                  </label>
                  <div className="AngleNumber">
                    <label className="SrOnly" htmlFor={angleNumberId}>
                      Angle in degrees
                    </label>
                    <input
                      id={angleNumberId}
                      className="NumberInput"
                      type="number"
                      min={0}
                      max={360}
                      value={angle}
                      onChange={(e) => setAngle(clamp(e.target.value, 0, 360))}
                    />
                    <span className="Unit" aria-hidden="true">
                      °
                    </span>
                  </div>
                </div>

                <input
                  id={angleSliderId}
                  className="Range"
                  type="range"
                  min={0}
                  max={360}
                  value={angle}
                  onChange={(e) => setAngle(clamp(e.target.value, 0, 360))}
                  aria-describedby={snippetId}
                />
              </div>
            </header>

            <div className="SwatchWrap" aria-label="Gradient preview">
              <div
                className="Swatch GradientSwatch"
                style={{ background: gradientCss }}
              />
            </div>

            <div className="GradientOutput" aria-label="Generated CSS">
              <label className="ValueLabel" htmlFor={snippetId}>
                CSS snippet
              </label>

              <textarea
                id={snippetId}
                className="CodeArea"
                value={cssSnippet}
                readOnly
                rows={2}
                aria-readonly="true"
              />

              <div className="Actions" aria-label="Gradient actions">
                <div className="ActionGroup" aria-label="Export actions">
                  <button
                    type="button"
                    className="Btn"
                    onClick={handleCopyCss}
                    aria-label="Copy CSS"
                  >
                    Copy CSS
                  </button>
                  <button
                    type="button"
                    className="Btn"
                    onClick={handleExportPng}
                    aria-label="Export PNG"
                  >
                    Export PNG
                  </button>
                  <button
                    type="button"
                    className="Btn"
                    onClick={handleExportSvg}
                    aria-label="Export SVG"
                  >
                    Export SVG
                  </button>
                </div>

                {/* aria-live for action confirmation (also used by Palette from Image) */}
                <span className="Toast" role="status" aria-live="polite">
                  {copyStatus}
                </span>
              </div>
            </div>
          </section>

          <section className="Card" aria-label="Palette from image card">
            <header className="CardHeader">
              <div className="HeaderText">
                <h2 className="Title">Palette from Image</h2>
                <p className="Subtitle">
                  Upload an image to extract the top 5 prominent colors. Click a swatch to
                  apply it to the color picker and gradient stops.
                </p>
              </div>

              <div className="UploadRow">
                <div className="UploadLeft">
                  <label className="SrOnly" htmlFor={paletteInputId}>
                    Upload image
                  </label>
                  <input
                    id={paletteInputId}
                    className="FileInput"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    aria-label="Upload image for palette extraction"
                  />

                  {imagePreviewUrl ? (
                    <img
                      className="Thumb"
                      src={imagePreviewUrl}
                      alt="Uploaded preview"
                    />
                  ) : (
                    <div
                      className="Thumb"
                      aria-label="No image selected"
                      role="img"
                    />
                  )}
                </div>

                <div className="ActionGroup" aria-label="Palette actions">
                  <button
                    type="button"
                    className="Btn BtnSecondary"
                    onClick={runExtraction}
                    disabled={!imageFile || isExtracting}
                    aria-label="Re-extract palette"
                  >
                    Re-extract
                  </button>

                  {isExtracting ? (
                    <span className="LoadingNote" aria-label="Extracting colors">
                      <span className="Spinner" aria-hidden="true" />
                      Processing…
                    </span>
                  ) : null}
                </div>
              </div>
            </header>

            <div className="PaletteBody" aria-label="Extracted palette">
              <div className="SwatchGrid" aria-label="Palette swatches">
                {paletteColors.slice(0, 5).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="SwatchBtn"
                    style={{ background: c }}
                    aria-label={`Select ${c.toUpperCase()}`}
                    onClick={() => handleApplySwatch(c)}
                  />
                ))}
              </div>

              <p className="Subtitle" style={{ margin: 0 }}>
                Tip: swatches set Color A first, then Color B (alternating).
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
