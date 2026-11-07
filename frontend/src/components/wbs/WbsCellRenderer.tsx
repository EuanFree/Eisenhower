/**
 * WbsCellRenderer — Reusable Cell Renderer with Presence Indicators
 *
 * Encapsulates the rendering logic for editable WBS table cells with:
 * - Inline editing support via InlineEditCell
 * - Peer presence indicators (CellFocusIndicator with colored borders)
 * - Soft-lock interlock preventing concurrent editing
 * - Hardware-accelerated CSS transitions for 60 FPS scrolling
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    <WbsCellRenderer
 *      nodeId={node.id}
 *      field="planned_start_date"
 *      value={node.planned_start_date}
 *      renderContent={(v) => formatDate(v)}
 *      editHook={editHook}
 *      cellPresence={cellPresence}
 *      getCellFocus={getCellFocus}
 *      tryStartEdit={tryStartEditWithSoftLockCheck}
 *      commitEdit={commitEditWithBlur}
 *      revertEdit={revertEditWithBlur}
 *      handleEditKeyDown={handleEditKeyDown}
 *      rowHeight={rowHeight}
 *      nodeLocked={isNodeLocked(node.path)}
 *    />
 */

import React, { memo } from 'react';
import { EditableField } from '../../types/editing';
import { CellFocusRecord } from '../../stores/usePresenceStore';
import InlineEditCell from './InlineEditCell';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the WbsCellRenderer component.
 */
interface WbsCellRendererProps {
  /** The WBS node ID */
  nodeId: string;
  /** The field being rendered */
  field: EditableField;
  /** The current value */
  value: string | number | null;
  /** Function to render the cell content */
  renderContent: (value: string | number | null) => React.ReactNode;
  /** Whether the node is locked by a lease */
  nodeLocked?: boolean;
  /** Row height for sizing */
  rowHeight?: number;
  /** Global row index for editing */
  globalIndex?: number;
  /** Active cell state from edit hook */
  activeCell?: {
    nodeId: string;
    field: EditableField;
    currentValue: string;
    rowIndex?: number;
  } | null;
  /** Update value callback */
  onChange?: (value: string) => void;
  /** Key down handler for navigation */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Commit edit callback */
  onBlur?: () => void;
  /** Input ref for focus management */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Get cell focus record for peer presence */
  getCellFocus?: (nodeId: string, columnKey: string) => CellFocusRecord | null;
  /** Check if cell is soft-locked */
  isCellSoftLocked?: (nodeId: string, columnKey: string) => boolean;
  /** Get soft-lock holder UPN */
  getSoftLockHolder?: (nodeId: string, columnKey: string) => string | null;
  /** Start edit with soft-lock check */
  tryStartEdit?: (e: React.MouseEvent, rowIndex: number, nodeId: string, field: EditableField, value: string | number | null) => void;
  /** Optional list of autocomplete suggestions (rendered via a native <datalist>) */
  inputListOptions?: string[];
}

// ---------------------------------------------------------------------------
// CellFocusIndicator — Colored border and compact avatar chip
// ---------------------------------------------------------------------------

/**
 * CellFocusIndicator — Colored border and compact avatar chip for a cell
 * actively edited by a peer.
 *
 * Wraps a cell's content and renders:
 * - A colored border matching the editing colleague's display color.
 * - A compact avatar chip (initials) in the top-right corner.
 */
interface CellFocusIndicatorProps {
  cellFocus: CellFocusRecord;
  children: React.ReactNode;
}

const CellFocusIndicator: React.FC<CellFocusIndicatorProps> = memo(({
  cellFocus,
  children,
}) => {
  const initials = cellFocus.user_upn.split('@')[0].charAt(0).toUpperCase();

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '3px',
        border: `2px solid ${cellFocus.display_color}`,
        padding: '0 18px',
        minHeight: '20px',
        willChange: 'transform',
        transform: 'translateZ(0)',
      }}
    >
      {/* Compact avatar chip */}
      <div
        title={`Cell actively edited by ${cellFocus.user_upn}`}
        style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: cellFocus.display_color,
          border: '2px solid #0F172A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '9px',
          fontWeight: 700,
          color: '#0F172A',
          zIndex: 20,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {initials}
      </div>
      {children}
    </div>
  );
});

CellFocusIndicator.displayName = 'CellFocusIndicator';

// ---------------------------------------------------------------------------
// WbsCellRenderer
// ---------------------------------------------------------------------------

/**
 * WbsCellRenderer — Memoized cell renderer with presence indicators.
 *
 * Handles inline editing, peer presence visualization, and soft-lock interlock.
 * Uses React.memo and CSS hardware acceleration for 60 FPS scrolling.
 */
const WbsCellRenderer: React.FC<WbsCellRendererProps> = memo(({
  nodeId,
  field,
  value,
  renderContent,
  nodeLocked = false,
  rowHeight,
  globalIndex = 0,
  activeCell,
  onChange,
  onKeyDown,
  onBlur,
  inputRef,
  getCellFocus,
  isCellSoftLocked,
  getSoftLockHolder,
  tryStartEdit,
  inputListOptions,
}) => {
  // Check if this cell is being edited (only if not locked)
  const isEditing = !nodeLocked && activeCell?.nodeId === nodeId && activeCell?.field === field;

  // Check for peer cell focus
  const cellFocus = getCellFocus?.(nodeId, field);
  const softLocked = isCellSoftLocked?.(nodeId, field);
  const holderUpn = getSoftLockHolder?.(nodeId, field);

  // Determine cursor and text style based on lock state
  const cursorClass = nodeLocked
    ? 'cursor-not-allowed'
    : softLocked
    ? 'cursor-not-allowed'
    : 'cursor-text';

  const textClass = nodeLocked
    ? 'text-amber-500/60'
    : softLocked
    ? 'text-text-ops-muted'
    : 'text-text-ops-muted';

  // Determine tooltip text
  const tooltipText = nodeLocked
    ? 'Editing restricted: node is checked out'
    : softLocked
    ? `Cell actively being edited by ${holderUpn?.split('@')[0]}`
    : 'Double-click to edit';

  // Render inline edit mode
  if (isEditing && onChange && onKeyDown && onBlur && inputRef) {
    return (
      <InlineEditCell
        field={field}
        value={activeCell.currentValue}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        inputRef={inputRef}
        rowHeight={rowHeight}
        listOptions={inputListOptions}
      />
    );
  }

  // Render display mode with presence indicators
  return (
    <span
      className={`font-mono text-sm ${textClass} ${cursorClass}`}
      onDoubleClick={(e) => {
        if (nodeLocked) return;
        tryStartEdit?.(e, globalIndex, nodeId, field, value);
      }}
      title={tooltipText}
      style={{
        willChange: 'transform',
        transform: 'translateZ(0)',
      }}
    >
      {cellFocus ? (
        <CellFocusIndicator cellFocus={cellFocus}>
          {renderContent(value)}
        </CellFocusIndicator>
      ) : (
        renderContent(value)
      )}
    </span>
  );
});

WbsCellRenderer.displayName = 'WbsCellRenderer';

export default WbsCellRenderer;
export { CellFocusIndicator };
