"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

/** Move/remove buttons for an item in an editable list. */
export function RowControls({
  index,
  length,
  onMove,
  onRemove,
  label,
}: {
  index: number;
  length: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  label: string;
}) {
  const button =
    "inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-fill hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" className={button} disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Naikkan ${label}`}>
        <ArrowUp className="size-3.5" />
      </button>
      <button type="button" className={button} disabled={index === length - 1} onClick={() => onMove(index, index + 1)} aria-label={`Turunkan ${label}`}>
        <ArrowDown className="size-3.5" />
      </button>
      <button type="button" className={`${button} hover:text-red-600`} onClick={onRemove} aria-label={`Hapus ${label}`}>
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export const replaceAt = <T,>(list: T[], index: number, value: T) => list.map((item, i) => (i === index ? value : item));
export const removeAt = <T,>(list: T[], index: number) => list.filter((_, i) => i !== index);
