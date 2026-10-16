import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAuth } from "../auth/auth";
import { api } from "../api/client";

export type ColumnWidths = Record<string, number>;

const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 600;
const SAVE_DELAY_MS = 500;

function mergeWidths(defaultWidths: ColumnWidths, saved: unknown): ColumnWidths {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...defaultWidths };
  const source = saved as Record<string, unknown>;
  return Object.fromEntries(Object.entries(defaultWidths).map(([key, fallback]) => [key, Number.isInteger(source[key]) && Number(source[key]) >= MIN_COLUMN_WIDTH && Number(source[key]) <= MAX_COLUMN_WIDTH ? Number(source[key]) : fallback]));
}

function cacheKey(userId: string, tableKey: string) { return `table-widths.v1:${userId}:${tableKey}`; }

export function useResizableColumns(tableKey: string, defaultWidths: ColumnWidths) {
  const { user } = useAuth();
  const [widths, setWidths] = useState<ColumnWidths>(() => ({ ...defaultWidths }));
  const widthsRef = useRef(widths);
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<ColumnWidths | null>(null);
  const dragRef = useRef<{ key: string; pointerId: number; startX: number; startWidth: number; moved: boolean; element: HTMLButtonElement } | null>(null);
  const guideFrameRef = useRef<number | null>(null);
  const defaultsSignature = JSON.stringify(defaultWidths);

  const applyWidths = useCallback((next: ColumnWidths) => {
    widthsRef.current = next;
    setWidths(next);
  }, []);
  const save = useCallback((next: ColumnWidths) => {
    if (!user?.id) return;
    pendingSaveRef.current = next;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const value = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (!value) return;
      void api(`/api/user-preferences/table/${encodeURIComponent(tableKey)}`, { method: "PUT", body: JSON.stringify({ widths: value }) }).catch(() => { /* local cache remains the retry-safe fallback */ });
    }, SAVE_DELAY_MS);
  }, [tableKey, user?.id]);
  const releaseDrag = useCallback(() => {
    if (guideFrameRef.current !== null) window.cancelAnimationFrame(guideFrameRef.current);
    guideFrameRef.current = null;
    if (dragRef.current) {
      delete dragRef.current.element.dataset.resizing;
      const guide = dragRef.current.element.closest(".lead-table-wrap")?.querySelector<HTMLElement>(".lead-column-resize-guide");
      guide?.classList.remove("is-visible");
    }
    dragRef.current = null;
    document.body.classList.remove("is-resizing-column");
    document.body.style.userSelect = "";
  }, []);
  const updateResizeGuide = useCallback((element: HTMLButtonElement) => {
    if (guideFrameRef.current !== null) window.cancelAnimationFrame(guideFrameRef.current);
    guideFrameRef.current = window.requestAnimationFrame(() => {
      guideFrameRef.current = null;
      const wrapper = element.closest<HTMLElement>(".lead-table-wrap");
      const table = wrapper?.querySelector<HTMLTableElement>(".lead-table");
      const guide = wrapper?.querySelector<HTMLElement>(".lead-column-resize-guide");
      if (!wrapper || !table || !guide) return;
      const handleBounds = element.getBoundingClientRect();
      const wrapperBounds = wrapper.getBoundingClientRect();
      guide.style.left = `${handleBounds.left - wrapperBounds.left + wrapper.scrollLeft + 4}px`;
      guide.style.top = `${table.offsetTop}px`;
      guide.style.height = `${table.offsetHeight}px`;
      guide.classList.add("is-visible");
    });
  }, []);

  useEffect(() => {
    if (!user?.id) { applyWidths({ ...defaultWidths }); return; }
    const key = cacheKey(user.id, tableKey);
    try { applyWidths(mergeWidths(defaultWidths, JSON.parse(window.localStorage.getItem(key) || "null"))); } catch { applyWidths({ ...defaultWidths }); }
    let live = true;
    void api<{ widths: unknown }>(`/api/user-preferences/table/${encodeURIComponent(tableKey)}`).then((response) => {
      if (!live) return;
      const next = mergeWidths(defaultWidths, response.widths);
      applyWidths(next);
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* localStorage is optional */ }
    }).catch(() => { /* cached widths stay in place */ });
    return () => { live = false; };
  }, [applyWidths, defaultsSignature, tableKey, user?.id]);

  useEffect(() => () => {
    if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); const value = pendingSaveRef.current; pendingSaveRef.current = null; if (value && user?.id) void api(`/api/user-preferences/table/${encodeURIComponent(tableKey)}`, { method: "PUT", body: JSON.stringify({ widths: value }) }).catch(() => {}); }
    releaseDrag();
  }, [releaseDrag, tableKey, user?.id]);

  const setColumnWidth = useCallback((columnKey: string, width: number, persist = true) => {
    const next = { ...widthsRef.current, [columnKey]: Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width))) };
    applyWidths(next);
    if (user?.id) { try { window.localStorage.setItem(cacheKey(user.id, tableKey), JSON.stringify(next)); } catch { /* localStorage is optional */ } }
    if (persist) save(next);
  }, [applyWidths, save, tableKey, user?.id]);
  const resetColumn = useCallback((columnKey: string) => setColumnWidth(columnKey, defaultWidths[columnKey] || MIN_COLUMN_WIDTH), [defaultWidths, setColumnWidth]);
  const resetAll = useCallback(() => {
    const next = { ...defaultWidths };
    applyWidths(next);
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    pendingSaveRef.current = null;
    if (user?.id) { try { window.localStorage.removeItem(cacheKey(user.id, tableKey)); } catch { /* localStorage is optional */ } }
    void api(`/api/user-preferences/table/${encodeURIComponent(tableKey)}`, { method: "DELETE" }).catch(() => {});
  }, [applyWidths, defaultWidths, tableKey, user?.id]);
  const resizeHandleProps = useCallback((columnKey: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault(); event.stopPropagation();
      dragRef.current = { key: columnKey, pointerId: event.pointerId, startX: event.clientX, startWidth: widthsRef.current[columnKey] || defaultWidths[columnKey] || MIN_COLUMN_WIDTH, moved: false, element: event.currentTarget };
      event.currentTarget.dataset.resizing = "true";
      event.currentTarget.setPointerCapture(event.pointerId);
      updateResizeGuide(event.currentTarget);
      document.body.classList.add("is-resizing-column");
      document.body.style.userSelect = "none";
    },
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || drag.key !== columnKey) return;
      const delta = event.clientX - drag.startX;
      if (Math.abs(delta) > 2) drag.moved = true;
      setColumnWidth(columnKey, drag.startWidth + delta, false);
      updateResizeGuide(event.currentTarget);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      releaseDrag();
      if (drag.moved) save(widthsRef.current);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      releaseDrag();
    },
    onDoubleClick: (event: ReactPointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.stopPropagation(); resetColumn(columnKey); },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => { event.preventDefault(); event.stopPropagation(); },
  }), [defaultWidths, releaseDrag, resetColumn, save, setColumnWidth, updateResizeGuide]);

  return { widths, widthFor: (columnKey: string) => widths[columnKey] || defaultWidths[columnKey] || MIN_COLUMN_WIDTH, resizeHandleProps, resetAll };
}
