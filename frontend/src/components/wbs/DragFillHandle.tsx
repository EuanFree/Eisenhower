/**
 * DragFillHandle — 4px Drag-to-Fill Handle
 *
 * Renders a 4px square fill handle on the bottom-right corner
 * of the active cell. Dragging the handle down propagates the
 * cell's value to highlighted target cells.
 *
 * The multi-row assignment is wrapped in a single createBatchCommand()
 * for one-click Ctrl+Z rollback.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    {activeCell && (
 *      <DragFillHandle
 *        cellRect={getCellRect(activeCell)}
 *        rows={rows}
 *        columnId={activeCell.columnId}
 *        value={activeCell.currentValue}
 *      />
 *    )}
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { useScheduleStore } from '../../stores/useScheduleStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DragFillHandleProps {
  /** Bounding rectangle of the active cell */
  cellRect: { top: number; left: number; width: number; height: number } | null;
  /** All rows for target detection */
  rows: { id: string }[];
  /** Column ID being filled */
  columnId: string;
  /** Value to propagate */
  value: string | number | null;
  /** Row height in pixels */
  rowHeight: number;
  /** Active cell row index */
  activeRowIndex: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DragFillHandle: React.FC<DragFillHandleProps> = ({
  cellRect,
  rows,
  columnId,
  value,
  rowHeight,
  activeRowIndex,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [targetRowIndices, setTargetRowIndices] = useState<number[]>([]);
  const handleRef = useRef<HTMLDivElement>(null);
  const updateRow = useScheduleStore((s) => s.updateRow);
  const pushCommand = useHistoryStore((s) => s.pushCommand);

  // Handle mouse down on the fill handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  // Handle mouse move during drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate which rows are being dragged over
      const container = document.querySelector('[class*="overflow-auto"]') as HTMLElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const relativeY = e.clientY - containerRect.top + container.scrollTop;

      // Determine target row range
      const startRow = activeRowIndex + 1;
      const endRow = Math.min(
        rows.length - 1,
        Math.floor(relativeY / rowHeight) - 1, // -1 for header
      );

      if (endRow >= startRow) {
        const indices = Array.from({ length: endRow - startRow + 1 }, (_, i) => startRow + i);
        setTargetRowIndices(indices);
      } else {
        setTargetRowIndices([]);
      }
    };

    const handleMouseUp = () => {
      if (targetRowIndices.length > 0 && value != null) {
        // Apply the fill
        const operations = targetRowIndices.map((rowIdx) => {
          const row = rows[rowIdx];
          return {
            node_id: row.id,
            field: columnId,
            oldValue: (rows[rowIdx] as any)[columnId] ?? null,
            newValue: value,
          };
        });

        // Update rows
        targetRowIndices.forEach((rowIdx) => {
          const row = rows[rowIdx];
          updateRow(row.id, { [columnId]: value });
        });

        // Push as a single batch command
        pushCommand({
          type: 'BATCH_EDIT',
          description: `Drag-to-fill ${targetRowIndices.length} cells with ${value}`,
          operations,
        });
      }

      setIsDragging(false);
      setTargetRowIndices([]);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, activeRowIndex, rows, rowHeight, columnId, value, targetRowIndices, updateRow, pushCommand]);

  if (!cellRect) return null;

  const handleSize = 6; // 6px handle (slightly larger than 4px for usability)

  return (
    <>
      {/* Fill handle */}
      <div
        ref={handleRef}
        className={clsx(
          'absolute z-20 cursor-crosshair bg-blue-500 border border-blue-300',
          isDragging && 'bg-blue-400',
        )}
        style={{
          width: handleSize,
          height: handleSize,
          bottom: -handleSize / 2,
          right: -handleSize / 2,
        }}
        onMouseDown={handleMouseDown}
        title="Drag to fill"
      />

      {/* Target row highlights */}
      {isDragging && targetRowIndices.map((rowIdx) => (
        <div
          key={rowIdx}
          className="absolute left-0 right-0 bg-blue-500/10 border-b border-blue-500/30 pointer-events-none"
          style={{
            top: (rowIdx + 1) * rowHeight, // +1 for header
            height: rowHeight,
          }}
        />
      ))}
    </>
  );
};

// Helper for clsx
function clsx(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export default DragFillHandle;
