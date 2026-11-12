import { describe, it, expect } from 'vitest';
import {
  addWorkdays,
  calculateWorkdayDuration,
  computeFinishDate,
  recalculateAutoSchedule,
  ScheduleDependencyLink,
} from '../utils/scheduleCalculator';
import { WBSRow } from '../types/wbs';

function createMockRow(id: string, code: string, start: string, end: string, mode: 'AUTO' | 'MANUAL' = 'AUTO'): WBSRow {
  return {
    id,
    parent_id: null,
    version_id: 1,
    tree_type: 'WBS',
    code,
    name: `Task ${code}`,
    path: code,
    security_classification: 'OFFICIAL',
    caveats: [],
    odac_permissions: {},
    custom_attributes: { scheduling_mode: mode },
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    delivery_mode: 'WATERFALL',
    scheduling_mode: mode,
    planned_start_date: start,
    planned_end_date: end,
    duration_days: null,
    lag_days: null,
    actual_start_date: null,
    actual_end_date: null,
    percent_complete: 0,
    evm_technique: null,
    bac_cost: null,
    planned_value: null,
    earned_value: null,
    actual_cost: null,
    early_start: null,
    early_finish: null,
    late_start: null,
    late_finish: null,
    total_float: null,
    free_float: null,
    is_critical: null,
    requires_vv_signoff: false,
    is_sandbox_branch: false,
    sandbox_scenario_id: null,
    origin_node_id: null,
    currency_code: 'GBP',
    contract_exchange_rate_id: null,
    export_control_regime: null,
    eccn_or_usml_category: null,
    authorized_nationalities: null,
    taa_mla_reference: null,
    calendar_id: null,
    indentLevel: 0,
    expanded: true,
    childrenLoaded: true,
    selected: false,
  };
}

describe('Auto vs. Manual Schedule Calculator', () => {
  it('correctly calculates workday duration and addWorkdays', () => {
    // 2026-11-02 is Monday, 2026-11-06 is Friday
    expect(addWorkdays('2026-11-02', 4)).toBe('2026-11-06');
    // Add 1 workday to Friday -> Monday 2026-11-09
    expect(addWorkdays('2026-11-06', 1)).toBe('2026-11-09');
    // Duration between Mon and Fri is 5 days
    expect(calculateWorkdayDuration('2026-11-02', '2026-11-06')).toBe(5);
    // Finish date for 5-day task starting Monday is Friday
    expect(computeFinishDate('2026-11-02', 5)).toBe('2026-11-06');
  });

  it('cascades downstream dates for AUTO tasks with Finish-to-Start dependencies', () => {
    // Task 1: 2026-11-02 (Mon) to 2026-11-04 (Wed) (3 days)
    // Task 2: 2026-11-02 (Mon) to 2026-11-03 (Tue) (2 days initial)
    const task1 = createMockRow('node-1', '1.1', '2026-11-02', '2026-11-04', 'AUTO');
    const task2 = createMockRow('node-2', '1.2', '2026-11-02', '2026-11-03', 'AUTO');

    const deps: ScheduleDependencyLink[] = [
      { id: 'dep-1', predecessor_id: 'node-1', successor_id: 'node-2', dependency_type: 'FS', lag_days: 0 },
    ];

    const result = recalculateAutoSchedule([task1, task2], deps);

    // Task 2 must start the workday after Task 1 finishes (2026-11-05 Thu)
    const updatedTask2 = result.find((r) => r.id === 'node-2')!;
    expect(updatedTask2.planned_start_date).toBe('2026-11-05');
    // Task 2 duration is 2 days (Thu-Fri) -> finish date 2026-11-06
    expect(updatedTask2.planned_end_date).toBe('2026-11-06');
  });

  it('keeps MANUAL task dates fixed even when predecessors shift', () => {
    // Task 1 finishes 2026-11-10
    // Task 2 is MANUAL with fixed start 2026-11-01 and finish 2026-11-03
    const task1 = createMockRow('node-1', '1.1', '2026-11-02', '2026-11-10', 'AUTO');
    const task2 = createMockRow('node-2', '1.2', '2026-11-01', '2026-11-03', 'MANUAL');

    const deps: ScheduleDependencyLink[] = [
      { id: 'dep-1', predecessor_id: 'node-1', successor_id: 'node-2', dependency_type: 'FS', lag_days: 0 },
    ];

    const result = recalculateAutoSchedule([task1, task2], deps);

    const updatedTask2 = result.find((r) => r.id === 'node-2')!;
    // In manual mode, dates stay fixed!
    expect(updatedTask2.planned_start_date).toBe('2026-11-01');
    expect(updatedTask2.planned_end_date).toBe('2026-11-03');
  });

  it('handles lag days on FS dependencies', () => {
    // Task 1: finishes 2026-11-04 (Wed)
    // Task 2: FS+2d lag -> start is Thu + 2 workdays = Mon 2026-11-09
    const task1 = createMockRow('node-1', '1.1', '2026-11-02', '2026-11-04', 'AUTO');
    const task2 = createMockRow('node-2', '1.2', '2026-11-01', '2026-11-02', 'AUTO');

    const deps: ScheduleDependencyLink[] = [
      { id: 'dep-1', predecessor_id: 'node-1', successor_id: 'node-2', dependency_type: 'FS', lag_days: 2 },
    ];

    const result = recalculateAutoSchedule([task1, task2], deps);

    const updatedTask2 = result.find((r) => r.id === 'node-2')!;
    expect(updatedTask2.planned_start_date).toBe('2026-11-09');
  });
});
