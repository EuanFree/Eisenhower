/**
 * Action Registry Type Definitions
 *
 * This module defines the core interfaces for the decoupled Action Registry
 * system.  Actions are declarative definitions that describe what they do,
 * when they are available, and how they are rendered.  The registry then
 * automatically renders actions in the Ribbon, Sidebar, and context menus
 * based on the current context.
 *
 * Architecture
 * ------------
 *
 * 1. **ActionDefinition** — A single action (e.g., "Run CPM", "Freeze Baseline").
 *    Each action declares its label, icon, category, keyboard shortcut,
 *    availability/enabled predicates, and an execute callback.
 *
 * 2. **ActionContext** — The runtime context passed to every action's
 *    predicates and execute function.  Contains selected nodes, active view,
 *    user clearance/roles, baseline lock state, and store dispatch functions.
 *
 * 3. **ActionRegistry** — A Map-based singleton that stores all registered
 *    actions and provides query methods (by category, by view type, by ID).
 *
 * 4. **Generic Renderers** — RibbonActionRenderer and SidebarActionRenderer
 *    read ActionDefinition metadata to automatically render the correct
 *    button type (large, small, split dropdown, numeric input).
 *
 * Usage
 * -----
 *
 * ```ts
 * // Define an action
 * const runCpmAction: ActionDefinition = {
 *   id: 'run-cpm',
 *   label: 'Run CPM',
 *   description: 'Recalculate Critical Path Method',
 *   icon: 'Play',
 *   category: 'SCHEDULE',
 *   preferredSize: 'LARGE_48PX',
 *   isAvailable: (ctx) => ctx.activeViewType === 'WBS_GANTT',
 *   isEnabled: (ctx) => ctx.selectedNodeIds.length > 0,
 *   execute: (ctx) => { // ... },
 * };
 *
 * // Register it
 * actionRegistry.register(runCpmAction);
 *
 * // Query actions for a category
 * const scheduleActions = actionRegistry.getActionsForCategory('SCHEDULE');
 * ```
 */

// ---------------------------------------------------------------------------
// Button Size Discriminators
// ---------------------------------------------------------------------------

/**
 * Visual size variant for action buttons.
 *
 * - **LARGE_48PX**: 48px icon + label text (primary actions like "Freeze Baseline").
 * - **SMALL_24PX**: Compact stacked button (secondary actions like "Indent/Outdent").
 * - **SPLIT_DROPDOWN**: Combined action button + dropdown menu (e.g., "Mark Progress" with 0%/25%/50%/75%/100%).
 * - **INPUT_NUMERIC**: Compact numeric input field (e.g., Lag Days, Duration).
 */
export type ActionButtonSize = 'LARGE_48PX' | 'SMALL_24PX' | 'SPLIT_DROPDOWN' | 'INPUT_NUMERIC';

// ---------------------------------------------------------------------------
// Action Context
// ---------------------------------------------------------------------------

/**
 * Runtime context passed to every action's `isAvailable`, `isEnabled`,
 * and `execute` functions.
 *
 * The context is derived from the current workspace state: selected nodes,
 * active view type, user clearance and roles, baseline lock status, and
 * store mutation functions.
 */
export interface ActionContext {
  /** IDs of currently selected nodes (may be empty, single, or multiple) */
  selectedNodeIds: string[];

  /** The primary selected node data (first in selection, or undefined) */
  selectedNode?: any;

  /** The active workspace view type (e.g., 'WBS_GANTT', 'DAILY_COCKPIT') */
  activeViewType: string;

  /** User's security clearance level */
  userClearance: 'OFFICIAL' | 'SECRET' | 'TOP_SECRET';

  /** User's assigned roles (e.g., ['SYSTEM_ADMIN', 'CAM']) */
  userRoles: string[];

  /** Whether the active baseline is locked (blocks mutations) */
  isBaselineLocked: boolean;

  /**
   * Dispatch function for store mutations.
   *
   * @param action - Action type string (e.g., 'UPDATE_NODE')
   * @param payload - Optional payload data
   */
  dispatch: (action: string, payload?: any) => void;

  /**
   * Execute a command (e.g., history command for undo/redo).
   *
   * @param command - The command object to execute
   */
  executeCommand: (command: any) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Dropdown Options
// ---------------------------------------------------------------------------

/**
 * A single option in a split-button dropdown menu.
 *
 * Example: Mark Progress dropdown with 0%, 25%, 50%, 75%, 100% options.
 */
export interface ActionDropdownOption {
  /** Display label (e.g., "25%") */
  label: string;

  /** Value passed to execute() when this option is selected */
  value: any;

  /** Optional Lucide icon key for the dropdown item */
  icon?: string;
}

// ---------------------------------------------------------------------------
// Action Definition
// ---------------------------------------------------------------------------

/**
 * Declarative definition of a single UI action.
 *
 * Each action defines:
 * - **Identity**: id, label, description, icon
 * - **Categorization**: category (STRUCTURE, SCHEDULE, PROGRESS, etc.)
 * - **Rendering**: preferredSize, dropdownOptions
 * - **Availability**: isAvailable() — should this action be shown at all?
 * - **Enablement**: isEnabled() — is the action clickable right now?
 * - **Execution**: execute() — what happens when clicked?
 *
 * The `isAvailable` and `isEnabled` functions receive the current
 * `ActionContext` and return a boolean.  This allows actions to
 * dynamically hide or disable themselves based on selection, clearance,
 * baseline locks, etc.
 *
 * Example
 * -------
 *
 * ```ts
 * const freezeBaselineAction: ActionDefinition = {
 *   id: 'freeze-baseline',
 *   label: 'Freeze Baseline',
 *   description: 'Freeze current WBS as Performance Measurement Baseline',
 *   icon: 'Lock',
 *   category: 'GOVERNANCE',
 *   defaultShortcut: 'Ctrl+Shift+F',
 *   preferredSize: 'LARGE_48PX',
 *   isAvailable: (ctx) => ctx.activeViewType === 'WBS_GANTT',
 *   isEnabled: (ctx) =>
 *     !ctx.isBaselineLocked &&
 *     ctx.userRoles.includes('SYSTEM_ADMIN'),
 *   execute: async (ctx) => {
 *     // Freeze baseline logic
 *   },
 * };
 * ```
 */
export interface ActionDefinition {
  /** Unique action identifier (e.g., 'run-cpm', 'freeze-baseline') */
  id: string;

  /** Display label shown on the button */
  label: string;

  /** Tooltip / description shown on hover */
  description: string;

  /** Lucide-react icon component name (e.g., 'Play', 'Lock', 'Trash2') */
  icon: string;

  /**
   * Action category for grouping in the Ribbon.
   *
   * Categories determine which action group (chunk) the button appears in:
   * - **STRUCTURE**: Hierarchy operations (Indent, Outdent, Insert, Delete)
   * - **SCHEDULE**: CPM, milestones, date manipulation
   * - **PROGRESS**: Progress marking, blockers, timesheets
   * - **EVM**: Earned Value Management calculations and exports
   * - **GOVERNANCE**: Baselines, BCRs, CDRLs, commercial acceptance
   * - **RISK**: Monte Carlo SRA, clash detection
   * - **FACILITY**: Chamber reservations, calibration
   * - **SECURITY**: Forensic audit, ledger integrity, spillage purge
   * - **SYSTEM**: Undo/Redo, display settings, presets
   */
  category: 'STRUCTURE' | 'SCHEDULE' | 'PROGRESS' | 'EVM' | 'GOVERNANCE' | 'RISK' | 'FACILITY' | 'SECURITY' | 'SYSTEM';

  /**
   * Default keyboard shortcut hint (e.g., 'Ctrl+F2', 'Ctrl+B').
   * Displayed as a <kbd> badge next to the button label.
   */
  defaultShortcut?: string;

  /**
   * Preferred visual size for this action button.
   * Defaults to 'SMALL_24PX' if not specified.
   */
  preferredSize?: ActionButtonSize;

  /**
   * Dropdown options for SPLIT_DROPDOWN buttons.
   *
   * Example: Mark Progress with [0%, 25%, 50%, 75%, 100%] options.
   */
  dropdownOptions?: ActionDropdownOption[];

  /**
   * Determine whether this action should be rendered at all.
   *
   * Return `false` to completely hide the action from the UI.
   * For example, a "Freeze Baseline" action might only be available
   * in the WBS_GANTT view.
   *
   * @param ctx - Current action context
   * @returns `true` if the action should be visible
   */
  isAvailable: (ctx: ActionContext) => boolean;

  /**
   * Determine whether this action is currently clickable.
   *
   * Return `false` to render the button in a disabled state with
   * a contextual tooltip explaining why it's blocked.
   * For example, "Freeze Baseline" is disabled when the baseline is locked.
   *
   * @param ctx - Current action context
   * @returns `true` if the action is enabled
   */
  isEnabled: (ctx: ActionContext) => boolean;

  /**
   * Execute the action when the user clicks the button.
   *
   * This function receives the current context and an optional
   * dropdown option value (for SPLIT_DROPDOWN buttons).
   *
   * @param ctx - Current action context
   * @param optionValue - Selected dropdown option value (if applicable)
   */
  execute: (ctx: ActionContext, optionValue?: any) => void | Promise<void>;

  /**
   * Optional reason why the action is disabled.
   *
   * When `isEnabled` returns `false`, this function can provide a
   * human-readable explanation shown in the tooltip.
   * For example: "Disabled: Task is locked under Baseline 0".
   *
   * @param ctx - Current action context
   * @returns Reason string or `undefined` if no specific reason
   */
  getDisabledReason?: (ctx: ActionContext) => string | undefined;

  /**
   * Optional view types this action is relevant for.
   *
   * If specified, the action is only registered for these view types,
   * simplifying the `isAvailable` predicate.
   */
  viewTypes?: string[];
}
