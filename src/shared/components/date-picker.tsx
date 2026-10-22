import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  getTodayString,
  formatDateISO,
  formatDisplayDate,
  parseDateString,
  getDaysInMonth,
  getFirstDayOfWeek,
  addDaysFromToday,
} from "./date-picker-utils";
import "./date-picker.css";

export {
  getTodayString,
  formatDateISO,
  formatDisplayDate,
  parseDateString,
  getDaysInMonth,
  getFirstDayOfWeek,
  addDaysFromToday,
};

export interface DatePickerProps {
  value?: string; // "yyyy-MM-dd" format string (e.g. "2026-10-21") or ""
  onChange: (value: string) => void;
  min?: string; // "yyyy-MM-dd" format
  max?: string; // "yyyy-MM-dd" format
  disabled?: boolean;
  error?: boolean | string;
  required?: boolean;
  placeholder?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  className?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const WEEKDAYS = [
  { short: "M", title: "Monday" },
  { short: "T", title: "Tuesday" },
  { short: "W", title: "Wednesday" },
  { short: "T", title: "Thursday" },
  { short: "F", title: "Friday" },
  { short: "S", title: "Saturday" },
  { short: "S", title: "Sunday" },
];

export function DatePicker({
  value = "",
  onChange,
  min,
  max,
  disabled = false,
  error,
  required = false,
  placeholder = "Select date",
  id,
  name,
  "aria-label": ariaLabel,
  className = "",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [typedText, setTypedText] = useState(() => formatDisplayDate(value));
  const [isTouched, setIsTouched] = useState(false);
  const [internalError, setInternalError] = useState(false);

  // Calendar navigation state (year & 0-indexed month)
  const initialDate = value && value.includes("-") ? value.split("-") : null;
  const currentYear = initialDate ? parseInt(initialDate[0], 10) : new Date().getFullYear();
  const currentMonth = initialDate ? parseInt(initialDate[1], 10) - 1 : new Date().getMonth();

  const [viewYear, setViewYear] = useState<number>(currentYear);
  const [viewMonth, setViewMonth] = useState<number>(currentMonth);

  // Month/Year chooser mode (grid of 12 months for quick jump)
  const [isChooserOpen, setIsChooserOpen] = useState(false);

  // Focused day for keyboard navigation in calendar grid
  const [focusedDateISO, setFocusedDateISO] = useState<string>(value || getTodayString());

  // Viewport popup coordinates
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Sync typed text when value prop changes externally
  useEffect(() => {
    setTypedText(formatDisplayDate(value));
    if (value) {
      setInternalError(false);
      const parts = value.split("-");
      if (parts.length === 3) {
        setViewYear(parseInt(parts[0], 10));
        setViewMonth(parseInt(parts[1], 10) - 1);
        setFocusedDateISO(value);
      }
    }
  }, [value]);

  const isDateDisabled = useCallback(
    (isoDate: string): boolean => {
      if (min && isoDate < min) return true;
      if (max && isoDate > max) return true;
      return false;
    },
    [min, max]
  );

  // Calculate popup position (flip above if no room below, shift to stay within viewport)
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popupHeight = 360;
    const popupWidth = 300;
    const gap = 6;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top = rect.bottom + gap;
    if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
      top = Math.max(8, rect.top - popupHeight - gap);
    } else {
      top = Math.min(top, window.innerHeight - popupHeight - 8);
    }

    let left = rect.left;
    if (left + popupWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popupWidth - 8);
    }

    setCoords({ top, left });
  }, []);

  // Recalculate on open, resize, scroll
  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popupRef.current &&
        !popupRef.current.contains(target)
      ) {
        setOpen(false);
        setIsChooserOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setIsChooserOpen(false);
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Open popup
  const handleOpenPopup = () => {
    if (disabled) return;
    if (value && value.includes("-")) {
      const parts = value.split("-");
      setViewYear(parseInt(parts[0], 10));
      setViewMonth(parseInt(parts[1], 10) - 1);
      setFocusedDateISO(value);
    } else {
      const today = getTodayString();
      const parts = today.split("-");
      setViewYear(parseInt(parts[0], 10));
      setViewMonth(parseInt(parts[1], 10) - 1);
      setFocusedDateISO(today);
    }
    setIsChooserOpen(false);
    setOpen(true);
  };

  // Select day handler
  const handleSelectDay = (isoDate: string) => {
    if (isDateDisabled(isoDate)) return;
    onChange(isoDate);
    setTypedText(formatDisplayDate(isoDate));
    setIsTouched(true);
    setInternalError(false);
    setOpen(false);
    setIsChooserOpen(false);
  };

  // Clear handler
  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange("");
    setTypedText("");
    setIsTouched(true);
    if (required) {
      setInternalError(true);
    } else {
      setInternalError(false);
    }
    setOpen(false);
    setIsChooserOpen(false);
  };

  // Header month navigation
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Year navigation in chooser
  const handlePrevYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear((y) => y - 1);
  };

  const handleNextYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear((y) => y + 1);
  };

  // Typing and input change
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTypedText(e.target.value);
    setInternalError(false);
  };

  const commitTypedInput = () => {
    setIsTouched(true);
    const raw = typedText.trim();
    if (!raw) {
      if (required) {
        setInternalError(true);
      } else {
        onChange("");
        setInternalError(false);
      }
      return;
    }

    const parsed = parseDateString(raw);
    if (parsed && !isDateDisabled(parsed)) {
      onChange(parsed);
      setTypedText(formatDisplayDate(parsed));
      setInternalError(false);
    } else {
      // Invalid date text: display error, restore previous stored date display
      setInternalError(true);
      setTypedText(formatDisplayDate(value));
    }
  };

  const handleInputBlur = () => {
    commitTypedInput();
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTypedInput();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      handleOpenPopup();
    }
  };

  // Keyboard navigation within calendar popup grid
  const handleGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = focusedDateISO ? focusedDateISO.split("-") : getTodayString().split("-");
    let y = parseInt(current[0], 10);
    let m = parseInt(current[1], 10);
    let d = parseInt(current[2], 10);
    const curDate = new Date(y, m - 1, d);

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      curDate.setDate(curDate.getDate() - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      curDate.setDate(curDate.getDate() + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      curDate.setDate(curDate.getDate() - 7);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      curDate.setDate(curDate.getDate() + 7);
    } else if (e.key === "PageUp") {
      e.preventDefault();
      curDate.setMonth(curDate.getMonth() - 1);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      curDate.setMonth(curDate.getMonth() + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      // Jump to Monday of current week
      const dayOfWeek = (curDate.getDay() + 6) % 7;
      curDate.setDate(curDate.getDate() - dayOfWeek);
    } else if (e.key === "End") {
      e.preventDefault();
      // Jump to Sunday of current week
      const dayOfWeek = (curDate.getDay() + 6) % 7;
      curDate.setDate(curDate.getDate() + (6 - dayOfWeek));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!isDateDisabled(focusedDateISO)) {
        handleSelectDay(focusedDateISO);
      }
      return;
    } else {
      return;
    }

    const nextISO = formatDateISO(curDate.getFullYear(), curDate.getMonth() + 1, curDate.getDate());
    setFocusedDateISO(nextISO);
    setViewYear(curDate.getFullYear());
    setViewMonth(curDate.getMonth());
  };

  // Presets definition
  const todayISO = getTodayString();
  const presets = [
    { label: "Today", iso: todayISO },
    { label: "Tomorrow", iso: addDaysFromToday(1) },
    { label: "In 3 days", iso: addDaysFromToday(3) },
    { label: "Next week", iso: addDaysFromToday(7) },
  ];

  // Generate 42 calendar grid cells (fixed 6 rows x 7 cols)
  const daysInCurrentMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDayOffset = getFirstDayOfWeek(viewYear, viewMonth); // 0=Mon, 6=Sun

  // Previous month trailing days
  const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const prevMonthYear = viewMonth === 0 ? viewYear - 1 : viewYear;
  const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonth);

  const gridCells: Array<{
    dayNumber: number;
    isoDate: string;
    isCurrentMonth: boolean;
  }> = [];

  // Trailing previous month days
  for (let i = firstDayOffset - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    gridCells.push({
      dayNumber: day,
      isoDate: formatDateISO(prevMonthYear, prevMonth + 1, day),
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    gridCells.push({
      dayNumber: day,
      isoDate: formatDateISO(viewYear, viewMonth + 1, day),
      isCurrentMonth: true,
    });
  }

  // Next month leading days up to 42 cells
  const remaining = 42 - gridCells.length;
  const nextMonthYear = viewMonth === 11 ? viewYear + 1 : viewYear;
  const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  for (let day = 1; day <= remaining; day++) {
    gridCells.push({
      dayNumber: day,
      isoDate: formatDateISO(nextMonthYear, nextMonth + 1, day),
      isCurrentMonth: false,
    });
  }

  // Determine error state:
  // Required error must NOT show on initial load, only after touched or explicit error prop
  const hasError =
    (Boolean(error) && (isTouched || typeof error === "string")) ||
    (required && isTouched && !value) ||
    internalError;

  const errorMessage =
    typeof error === "string"
      ? error
      : internalError
      ? "Select a valid date"
      : required && !value
      ? "Select a date"
      : "Select a date";

  return (
    <div className={`altus-date-picker ${className}`}>
      <div
        ref={triggerRef}
        className={`altus-date-picker-trigger ${open ? "is-open" : ""} ${
          hasError ? "has-error" : ""
        } ${disabled ? "is-disabled" : ""}`}
        onClick={handleOpenPopup}
      >
        <Calendar size={16} className="altus-date-picker-icon" />

        <input
          ref={inputRef}
          type="text"
          id={id}
          name={name}
          className="altus-date-picker-input"
          value={typedText}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel || placeholder}
          aria-invalid={hasError}
          autoComplete="off"
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
        />

        {value && !required && !disabled && (
          <button
            type="button"
            className="altus-date-picker-clear-btn"
            title="Clear date"
            aria-label="Clear date"
            onClick={handleClear}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {hasError && <div className="altus-date-picker-error">{errorMessage}</div>}

      {open &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label="Calendar date picker"
            aria-modal="true"
            className="altus-date-picker-popup"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }}
            tabIndex={0}
            onKeyDown={handleGridKeyDown}
          >
            {/* Quick Presets Row */}
            <div className="altus-date-picker-presets">
              {presets.map((p) => {
                const isPresetDisabled = isDateDisabled(p.iso);
                return (
                  <button
                    key={p.label}
                    type="button"
                    className="altus-date-picker-preset-btn"
                    disabled={isPresetDisabled}
                    onClick={() => handleSelectDay(p.iso)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {!isChooserOpen ? (
              <>
                {/* Header: Month Year with Prev / Next */}
                <div className="altus-date-picker-header">
                  <button
                    type="button"
                    className="altus-date-picker-title-btn"
                    title="Click to jump month or year"
                    onClick={() => setIsChooserOpen(true)}
                  >
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </button>

                  <div className="altus-date-picker-nav-group">
                    <button
                      type="button"
                      className="altus-date-picker-nav-btn"
                      title="Previous month"
                      aria-label="Previous month"
                      onClick={handlePrevMonth}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      className="altus-date-picker-nav-btn"
                      title="Next month"
                      aria-label="Next month"
                      onClick={handleNextMonth}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>

                {/* Weekday Labels (Mon - Sun) */}
                <div className="altus-date-picker-weekdays">
                  {WEEKDAYS.map((w, idx) => (
                    <div
                      key={idx}
                      className="altus-date-picker-weekday"
                      title={w.title}
                    >
                      {w.short}
                    </div>
                  ))}
                </div>

                {/* Fixed 42-day Calendar Grid */}
                <div className="altus-date-picker-grid" role="grid">
                  {gridCells.map((cell) => {
                    const isSelected = cell.isoDate === value;
                    const isToday = cell.isoDate === todayISO;
                    const isDisabled = isDateDisabled(cell.isoDate);

                    return (
                      <button
                        key={cell.isoDate}
                        type="button"
                        role="gridcell"
                        aria-selected={isSelected}
                        aria-current={isToday ? "date" : undefined}
                        disabled={isDisabled}
                        className={`altus-date-picker-day ${
                          !cell.isCurrentMonth ? "is-other-month" : ""
                        } ${isToday ? "is-today" : ""} ${
                          isSelected ? "is-selected" : ""
                        }`}
                        onClick={() => handleSelectDay(cell.isoDate)}
                      >
                        {cell.dayNumber}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Month & Year Chooser View */
              <div className="altus-date-picker-chooser">
                <div className="altus-date-picker-chooser-header">
                  <button
                    type="button"
                    className="altus-date-picker-nav-btn"
                    title="Previous year"
                    aria-label="Previous year"
                    onClick={handlePrevYear}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="altus-date-picker-year-label">{viewYear}</span>
                  <button
                    type="button"
                    className="altus-date-picker-nav-btn"
                    title="Next year"
                    aria-label="Next year"
                    onClick={handleNextYear}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="altus-date-picker-month-grid">
                  {MONTH_SHORT.map((name, idx) => {
                    const isSelectedMonth =
                      idx === viewMonth &&
                      value.startsWith(`${viewYear}-${String(idx + 1).padStart(2, "0")}`);
                    return (
                      <button
                        key={name}
                        type="button"
                        className={`altus-date-picker-month-cell ${
                          isSelectedMonth ? "is-selected" : ""
                        }`}
                        onClick={() => {
                          setViewMonth(idx);
                          setIsChooserOpen(false);
                        }}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer Row: Today & Clear */}
            <div className="altus-date-picker-footer">
              <button
                type="button"
                className="altus-date-picker-footer-btn"
                disabled={isDateDisabled(todayISO)}
                onClick={() => handleSelectDay(todayISO)}
              >
                Today
              </button>

              {value && !required && (
                <button
                  type="button"
                  className="altus-date-picker-footer-btn is-clear"
                  onClick={handleClear}
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
