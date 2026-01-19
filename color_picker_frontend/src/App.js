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

  /**
   * Attempt to copy text to the user's clipboard.
   * Uses the async Clipboard API when available, otherwise falls back to
   * document.execCommand("copy") with a hidden textarea.
   */
  async function copyToClipboard(text) {
    // Prefer modern async clipboard API when present.
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    // Fallback for older browsers/environments.
    const el = document.createElement("textarea");
    el.value = text;

    // readonly prevents iOS from popping up the keyboard in some cases.
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "-9999px";

    document.body.appendChild(el);
    el.focus();
    el.select();

    const ok = document.execCommand("copy");
    document.body.removeChild(el);

    if (!ok) {
      throw new Error("Clipboard copy failed (fallback).");
    }
  }

  async function handleCopyCss() {
    try {
      await copyToClipboard(cssSnippet);
      announceToast("Copied CSS to clipboard.");
    } catch (e) {
      announceToast("Copy failed. Please try again.");
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

                {/* aria-live for action confirmation */}
                <span className="Toast" role="status" aria-live="polite">
                  {copyStatus}
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
