import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import {
  parseTimeString,
  formatDisplayTime,
  decompose24,
  compose24,
} from "./time-picker-utils";
import "./time-picker.css";

export { parseTimeString, formatDisplayTime, decompose24, compose24 };

export interface TimePickerProps {
  value?: string; // "HH:mm" 24-hour string (e.g. "18:31", "06:31") or ""
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean | string;
  placeholder?: string;
  minuteStep?: number;
  id?: string;
  name?: string;
  "aria-label"?: string;
  required?: boolean;
  className?: string;
}

const CLOCK_RADIUS = 80; // Distance of numbers from center (in px)
const CLOCK_CENTER = 110; // (x, y) center coordinate on 220px face

export function TimePicker({
  value = "",
  onChange,
  disabled = false,
  error,
  placeholder = "Select time",
  minuteStep = 1,
  id,
  name,
  "aria-label": ariaLabel,
  required = false,
  className = "",
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [typedText, setTypedText] = useState(() => formatDisplayTime(value));
  const [internalError, setInternalError] = useState(false);

  // Watch popup state: active selection mode ("hour" or "minute")
  const [mode, setMode] = useState<"hour" | "minute">("hour");

  // Session draft state (committed only when user clicks OK)
  const [draftHour, setDraftHour] = useState<number>(12);
  const [draftMinute, setDraftMinute] = useState<number>(0);
  const [draftPeriod, setDraftPeriod] = useState<"AM" | "PM">("AM");

  // Dragging state for smooth analog clock hand movement
  const [isDragging, setIsDragging] = useState(false);

  // Viewport popup positioning
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number }>({
    top: 0,
    left: 0,
    maxHeight: 380,
  });

  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);

  // Sync typed text when value changes externally
  useEffect(() => {
    setTypedText(formatDisplayTime(value));
    if (value) {
      setInternalError(false);
    }
  }, [value]);

  // When popup opens, initialize draft from current value (or current local time)
  useEffect(() => {
    if (open) {
      const current = decompose24(value);
      setDraftHour(current.hour12);
      setDraftMinute(current.minute);
      setDraftPeriod(current.period);
      setMode("hour");
      setIsDragging(false);
    }
  }, [open, value]);

  const hasError = Boolean(error) || internalError;
  const errorMessage =
    typeof error === "string"
      ? error
      : internalError
      ? "Select a valid time"
      : "Select a valid time";

  // Calculate popup position (flip and shift to guarantee inside viewport)
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popupHeight = 360;
    const popupWidth = 280;
    const gap = 6;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top = rect.bottom + gap;
    if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
      // Flip above
      top = Math.max(8, rect.top - popupHeight - gap);
    }

    // Horizontal shift
    let left = rect.left;
    if (left + popupWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popupWidth - 8);
    }
    if (left < 8) left = 8;

    const availableHeight = Math.min(420, window.innerHeight - 16);
    setCoords({ top, left, maxHeight: availableHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleWindowChange = () => {
      updatePosition();
    };

    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open, updatePosition]);

  // Outside click closes and discards session changes
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  // Typing in the trigger field
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTypedText(e.target.value);
  };

  const commitTypedInput = () => {
    const text = typedText.trim();
    if (!text) {
      if (required) {
        setInternalError(true);
      } else {
        setInternalError(false);
      }
      onChange("");
      setTypedText("");
      return;
    }

    const parsed = parseTimeString(text);
    if (parsed) {
      setInternalError(false);
      onChange(parsed);
      setTypedText(formatDisplayTime(parsed));
    } else {
      setInternalError(true);
      // Keep invalid typed text so user can correct it, do not change stored value
    }
  };

  const handleInputBlur = () => {
    commitTypedInput();
  };

  const adjustMinutesBy = (deltaMinutes: number) => {
    const current = decompose24(value);
    let total = (current.hour12 % 12 + (current.period === "PM" ? 12 : 0)) * 60 + current.minute;
    total = (total + deltaMinutes + 1440) % 1440;
    const newH24 = Math.floor(total / 60);
    const newM = total % 60;
    const nextVal = `${String(newH24).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
    setInternalError(false);
    onChange(nextVal);
    setTypedText(formatDisplayTime(nextVal));
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "Enter") {
      e.preventDefault();
      commitTypedInput();
      setOpen((prev) => !prev);
      return;
    }

    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open && e.altKey) {
        setOpen(true);
        return;
      }
      if (!open) {
        adjustMinutesBy(e.key === "ArrowUp" ? minuteStep : -minuteStep);
      } else {
        popupRef.current?.focus();
      }
      return;
    }

    if (e.key === " " && !typedText.trim()) {
      e.preventDefault();
      setOpen(true);
    }
  };

  // Keyboard navigation inside popup
  const handlePopupKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.focus();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      handleOkClick();
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      if (mode === "hour") {
        setDraftHour((prev) => (prev % 12) + 1);
      } else {
        setDraftMinute((prev) => (prev + minuteStep) % 60);
      }
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      if (mode === "hour") {
        setDraftHour((prev) => (prev === 1 ? 12 : prev - 1));
      } else {
        setDraftMinute((prev) => (prev - minuteStep + 60) % 60);
      }
      return;
    }
  };

  // Angle calculation from pointer position
  const updateValueFromPointer = (e: ReactPointerEvent<HTMLDivElement>, isFinal: boolean = false) => {
    if (!clockRef.current) return;
    const rect = clockRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;

    // Angle in degrees from 12 o'clock (0° = top, 90° = 3 o'clock, 180° = 6 o'clock, 270° = 9 o'clock)
    let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angleDeg < 0) angleDeg += 360;

    if (mode === "hour") {
      // 360° / 12 = 30° per hour
      const hour = Math.round(angleDeg / 30) % 12 || 12;
      setDraftHour(hour);
      if (isFinal) {
        // Automatically switch to minute mode after picking the hour
        setMode("minute");
      }
    } else {
      // 360° / 60 = 6° per minute
      let min = Math.round(angleDeg / 6) % 60;
      if (minuteStep > 1) {
        min = Math.round(min / minuteStep) * minuteStep % 60;
      }
      setDraftMinute(min);
    }
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateValueFromPointer(e, false);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    updateValueFromPointer(e, false);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    setIsDragging(false);
    updateValueFromPointer(e, true);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Footer button actions
  const handleNowClick = () => {
    const now = new Date();
    const h = now.getHours();
    let m = now.getMinutes();
    if (minuteStep > 1) {
      m = Math.round(m / minuteStep) * minuteStep;
      if (m >= 60) m = 0;
    }
    setDraftHour(h % 12 || 12);
    setDraftMinute(m);
    setDraftPeriod(h >= 12 ? "PM" : "AM");
  };

  const handleCancelClick = () => {
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleOkClick = () => {
    const nextVal = compose24(draftHour, draftMinute, draftPeriod);
    setInternalError(false);
    onChange(nextVal);
    setTypedText(formatDisplayTime(nextVal));
    setOpen(false);
    inputRef.current?.focus();
  };

  // Current hand angle
  const handAngle = mode === "hour" ? (draftHour % 12) * 30 : draftMinute * 6;

  // Selected value label for the center of the hand's red end circle
  const selectedLabel =
    mode === "hour" ? String(draftHour) : String(draftMinute).padStart(2, "0");

  // Readout labels
  const displayHour = String(draftHour).padStart(2, "0");
  const displayMin = String(draftMinute).padStart(2, "0");

  return (
    <div className={`altus-time-picker ${className}`}>
      <div
        ref={triggerRef}
        className={`altus-time-picker-trigger ${open ? "is-open" : ""} ${
          hasError ? "has-error" : ""
        } ${disabled ? "is-disabled" : ""}`}
        onClick={() => {
          if (!disabled) {
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <Clock className="altus-time-picker-icon" size={16} />
        <input
          ref={inputRef}
          type="text"
          id={id}
          name={name}
          aria-label={ariaLabel || "Time picker"}
          aria-invalid={hasError ? "true" : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="altus-time-picker-input"
          value={typedText}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          autoComplete="off"
          spellCheck="false"
        />
      </div>

      {hasError && (
        <div className="altus-time-picker-error" role="alert">
          {errorMessage}
        </div>
      )}

      {open &&
        !disabled &&
        createPortal(
          <div
            ref={popupRef}
            tabIndex={-1}
            className="altus-time-picker-popup"
            role="dialog"
            aria-label="Time picker"
            aria-modal="false"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              maxHeight: `${coords.maxHeight}px`,
            }}
            onKeyDown={handlePopupKeyDown}
          >
            {/* Live screen reader announcement */}
            <div className="sr-only" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
              {`Selected time ${displayHour}:${displayMin} ${draftPeriod}, ${mode} mode`}
            </div>

            {/* Top Readout and AM/PM */}
            <div className="altus-time-readout-row">
              <div className="altus-time-readout">
                <button
                  type="button"
                  className={`altus-time-segment ${mode === "hour" ? "is-active" : ""}`}
                  onClick={() => setMode("hour")}
                  aria-label="Select hour"
                >
                  {displayHour}
                </button>
                <span className="altus-time-colon">:</span>
                <button
                  type="button"
                  className={`altus-time-segment ${mode === "minute" ? "is-active" : ""}`}
                  onClick={() => setMode("minute")}
                  aria-label="Select minute"
                >
                  {displayMin}
                </button>
              </div>

              <div className="altus-ampm-group">
                <button
                  type="button"
                  className={`altus-ampm-pill ${draftPeriod === "AM" ? "is-active" : ""}`}
                  onClick={() => setDraftPeriod("AM")}
                >
                  AM
                </button>
                <button
                  type="button"
                  className={`altus-ampm-pill ${draftPeriod === "PM" ? "is-active" : ""}`}
                  onClick={() => setDraftPeriod("PM")}
                >
                  PM
                </button>
              </div>
            </div>

            {/* Middle Watch-Style Clock Face */}
            <div className="altus-clock-face-wrap">
              <div
                ref={clockRef}
                className="altus-clock-face"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {/* Center red pin */}
                <div className="altus-clock-center-pin" />

                {/* Clock hand pointing to selected angle */}
                <div
                  className={`altus-clock-hand ${isDragging ? "is-dragging" : ""}`}
                  style={{
                    transform: `rotate(${handAngle}deg)`,
                  }}
                >
                  <div className="altus-clock-hand-end">
                    {selectedLabel}
                  </div>
                </div>

                {/* Minute Ticks (Only visible in minute mode) */}
                {mode === "minute" &&
                  Array.from({ length: 60 }).map((_, i) => {
                    const isMajor = i % 5 === 0;
                    return (
                      <div
                        key={`tick-${i}`}
                        className={`altus-clock-tick ${isMajor ? "major" : ""}`}
                        style={{
                          transform: `rotate(${i * 6}deg)`,
                        }}
                      />
                    );
                  })}

                {/* Hour Mode Numbers: 1 to 12 */}
                {mode === "hour" &&
                  Array.from({ length: 12 }, (_, i) => i + 1).map((h) => {
                    const angle = (h % 12) * 30;
                    const rad = (angle - 90) * (Math.PI / 180);
                    const x = CLOCK_CENTER + CLOCK_RADIUS * Math.cos(rad);
                    const y = CLOCK_CENTER + CLOCK_RADIUS * Math.sin(rad);
                    const isSelected = draftHour === h;

                    return (
                      <span
                        key={`hour-${h}`}
                        className={`altus-clock-number ${isSelected ? "is-selected" : ""}`}
                        style={{
                          left: `${x}px`,
                          top: `${y}px`,
                        }}
                      >
                        {h}
                      </span>
                    );
                  })}

                {/* Minute Mode Numbers: 00, 05, 10 ... 55 */}
                {mode === "minute" &&
                  Array.from({ length: 12 }, (_, i) => i * 5).map((m) => {
                    const angle = m * 6;
                    const rad = (angle - 90) * (Math.PI / 180);
                    const x = CLOCK_CENTER + CLOCK_RADIUS * Math.cos(rad);
                    const y = CLOCK_CENTER + CLOCK_RADIUS * Math.sin(rad);
                    const isSelected = draftMinute === m;

                    return (
                      <span
                        key={`min-${m}`}
                        className={`altus-clock-number ${isSelected ? "is-selected" : ""}`}
                        style={{
                          left: `${x}px`,
                          top: `${y}px`,
                        }}
                      >
                        {String(m).padStart(2, "0")}
                      </span>
                    );
                  })}
              </div>
            </div>

            {/* Bottom Footer: Now on left, Cancel and OK on right */}
            <div className="altus-clock-footer">
              <button
                type="button"
                className="altus-clock-btn-now"
                onClick={handleNowClick}
              >
                Now
              </button>
              <div className="altus-clock-footer-right">
                <button
                  type="button"
                  className="altus-clock-btn-cancel"
                  onClick={handleCancelClick}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="altus-clock-btn-ok"
                  onClick={handleOkClick}
                >
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
