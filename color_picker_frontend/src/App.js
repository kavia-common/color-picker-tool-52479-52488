import React, { useId, useMemo, useState } from "react";
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

// PUBLIC_INTERFACE
function App() {
  /** Selected color is kept as HEX to match <input type="color"> value format. */
  const [hex, setHex] = useState("#3b82f6");

  const inputId = useId();

  const rgb = useMemo(() => hexToRgb(hex), [hex]);
  const rgbText = rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : "—";

  return (
    <div className="App">
      <main className="Page">
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
      </main>
    </div>
  );
}

export default App;
