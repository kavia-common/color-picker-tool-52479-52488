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
  const cssSnippet = useMemo(
    () => `background: ${gradientCss};`,
    [gradientCss]
  );

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

  async function handleCopyCss() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(cssSnippet);
      } else {
        // Fallback for older browsers/environments
        const el = document.createElement("textarea");
        el.value = cssSnippet;
        el.setAttribute("readonly", "");
        el.style.position = "absolute";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }

      setCopyStatus("Copied CSS to clipboard.");
    } catch (e) {
      setCopyStatus("Copy failed. Please select and copy manually.");
    } finally {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopyStatus(""), 1800);
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
              <div className="Swatch GradientSwatch" style={{ background: gradientCss }} />
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

              <div className="Actions">
                <button type="button" className="Btn" onClick={handleCopyCss}>
                  Copy CSS
                </button>

                {/* aria-live for copy confirmation */}
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
