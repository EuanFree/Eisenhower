/**
 * Action Registry Provider
 *
 * Central registry for all UI actions in the Eisenhower Portfolio Manager.
 * The registry maintains a Map of ActionDefinition objects keyed by their
 * unique ID, and provides query methods for filtering by category, view
 * type, or specific IDs.
 *
 * Architecture
 * ------------
 *
 * The registry is a singleton instance (`actionRegistry`) that is populated
 * at application startup with all built-in actions.  Components (Ribbon,
 * Sidebar, context menus) query the registry with the current ActionContext
 * to determine which actions to render.
 *
 * Query Methods
 * -------------
 *
 * - **getAction(id)** — Retrieve a single action by its unique ID.
 * - **getActionsForCategory(category)** — All actions in a given category
 *   (e.g., 'STRUCTURE', 'SCHEDULE') that are available in the current context.
 * - **getActionsForView(viewType)** — All actions relevant for a given view
 *   type (e.g., 'WBS_GANTT', 'DAILY_COCKPIT').
 * - **getAllActions()** — All registered actions (for debugging).
 *
 * Usage
 * -----
 *
 * ```ts
 * import { actionRegistry } from './core/actions/ActionRegistry';
 *
 * // Register a new action
 * actionRegistry.register(myCustomAction);
 *
 * // Query available actions for the Ribbon
 * const structureActions = actionRegistry.getActionsForCategory('STRUCTURE', context);
 *
 * // Check if an action is enabled
 * const cpmAction = actionRegistry.getAction('run-cpm');
 * const isEnabled = cpmAction?.isEnabled(context);
 * ```
 */

import type { ActionDefinition, ActionContext } from './types';

// ---------------------------------------------------------------------------
// Action Registry Class
// ---------------------------------------------------------------------------

/**
 * Central registry for all UI actions.
 *
 * Maintains a Map of ActionDefinition objects and provides query methods
 * for filtering by category, view type, and availability.
 */
export class ActionRegistry {
  /** Map of all registered actions, keyed by action ID */
  private actions: Map<string, ActionDefinition> = new Map();

  /**
   * Register a single action definition.
   *
   * If an action with the same ID is already registered, it is replaced.
   *
   * @param action - The action definition to register
   */
  public register(action: ActionDefinition): void {
    this.actions.set(action.id, action);
  }

  /**
   * Register multiple action definitions.
   *
   * @param actions - Array of action definitions to register
   */
  public registerAll(actions: ActionDefinition[]): void {
    for (const action of actions) {
      this.register(action);
    }
  }

  /**
   * Retrieve a single action by its unique ID.
   *
   * @param id - The action ID (e.g., 'run-cpm')
   * @returns The action definition, or `undefined` if not found
   */
  public getAction(id: string): ActionDefinition | undefined {
    return this.actions.get(id);
  }

  /**
   * Get all actions in a given category that are available in the current
   * context.
   *
   * Filters out actions where `isAvailable(context)` returns `false`.
   *
   * @param category - The category to filter by (e.g., 'STRUCTURE')
   * @param context - Current action context for availability checks
   * @returns Array of available actions in the category
   */
  public getActionsForCategory(
    category: ActionDefinition['category'],
    context?: ActionContext,
  ): ActionDefinition[] {
    const result: ActionDefinition[] = [];
    for (const action of this.actions.values()) {
      if (action.category !== category) continue;
      if (context !== undefined && !action.isAvailable(context)) continue;
      result.push(action);
    }
    return result;
  }

  /**
   * Get all actions relevant for a given view type.
   *
   * Filters actions by their `viewTypes` array (if specified) and
   * `isAvailable` predicate.
   *
   * @param viewType - The view type (e.g., 'WBS_GANTT')
   * @param context - Current action context for availability checks
   * @returns Array of available actions for the view
   */
  public getActionsForView(
    viewType: string,
    context?: ActionContext,
  ): ActionDefinition[] {
    const result: ActionDefinition[] = [];
    for (const action of this.actions.values()) {
      // If viewTypes is specified, only include actions for this view
      if (action.viewTypes !== undefined && !action.viewTypes.includes(viewType)) {
        continue;
      }
      // Check availability predicate
      if (context !== undefined && !action.isAvailable(context)) {
        continue;
      }
      result.push(action);
    }
    return result;
  }

  /**
   * Get all registered actions (for debugging or enumeration).
   *
   * @returns Array of all registered action definitions
   */
  public getAllActions(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  /**
   * Unregister an action by its ID.
   *
   * @param id - The action ID to remove
   * @returns `true` if the action was found and removed
   */
  public unregister(id: string): boolean {
    return this.actions.delete(id);
  }

  /**
   * Clear all registered actions.
   *
   * Useful for testing or resetting the registry.
   */
  public clear(): void {
    this.actions.clear();
  }

  /**
   * Get the number of registered actions.
   */
  public get size(): number {
    return this.actions.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton Instance
// ---------------------------------------------------------------------------

/**
 * Global action registry singleton.
 *
 * This is the primary entry point for registering and querying actions.
 * Built-in actions are registered at application startup via
 * `registerBuiltInActions()`.
 */
export const actionRegistry = new ActionRegistry();
