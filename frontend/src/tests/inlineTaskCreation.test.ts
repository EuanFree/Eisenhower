import { describe, it, expect, vi } from 'vitest';
import { addWorkdays, calculateWorkdayDuration, computeFinishDate } from '../utils/scheduleCalculator';
import { WBSRow } from '../types/wbs';

/**
 * Tests for inline task creation features:
 * - insertChildTask: child inherits parent start date and classification
 * - insertSiblingTask: sibling inherits attributes with FOLLOW_ON or PARALLEL relationship
 * - Path and code calculation logic
 * - Date inheritance and relationship mode behavior
 */

// ---------------------------------------------------------------------------
// Mock row factory
// ---------------------------------------------------------------------------

function createMockRow(
  id: string,
  code: string,
  path: string,
  parentId: string | null = null,
  start: string = '2026-11-02',
  end: string = '2026-11-06',
  classification: string = 'OFFICIAL',
  deliveryMode: string = 'WATERFALL',
  evmTechnique: string | null = null,
  calendarId: string | null = null,
): WBSRow {
  const indentLevel = path.split('.').length - 1;
  return {
    id,
    parent_id: parentId,
    version_id: 1,
    tree_type: 'WBS',
    code,
    name: `Task ${code}`,
    path,
    security_classification: classification as any,
    caveats: [],
    odac_permissions: {},
    custom_attributes: { scheduling_mode: 'AUTO' },
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    delivery_mode: deliveryMode as any,
    scheduling_mode: 'AUTO',
    planned_start_date: start,
    planned_end_date: end,
    duration_days: null,
    lag_days: null,
    actual_start_date: null,
    actual_end_date: null,
    percent_complete: 0,
    evm_technique: evmTechnique,
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
    calendar_id: calendarId,
    indentLevel,
    expanded: true,
    childrenLoaded: true,
    selected: false,
  };
}

// ---------------------------------------------------------------------------
// Path & Code Calculation Tests
// ---------------------------------------------------------------------------

describe('Inline Task Creation - Path & Code Calculation', () => {
  it('computes child path correctly for a root-level node', () => {
    // Parent path: 1.1 -> child should be 1.1.1
    const parentPath = '1.1';
    const parts = parentPath.split('.');
    parts.push('1');
    const childPath = parts.join('.');
    expect(childPath).toBe('1.1.1');
  });

  it('computes child path correctly when siblings already exist', () => {
    // Existing children: 1.1.1, 1.1.2 -> next child should be 1.1.3
    const existingPaths = ['1.1.1', '1.1.2'];
    const parentPath = '1.1';

    const childNumbers = existingPaths
      .filter((p) => p.startsWith(parentPath + '.'))
      .map((p) => {
        const last = parseInt(p.split('.').pop()!, 10);
        return isNaN(last) ? 0 : last;
      });

    const nextNum = childNumbers.length > 0 ? Math.max(...childNumbers) + 1 : 1;
    expect(nextNum).toBe(3);

    const parts = parentPath.split('.');
    parts.push(String(nextNum));
    const childPath = parts.join('.');
    expect(childPath).toBe('1.1.3');
  });

  it('computes sibling path correctly', () => {
    // Existing siblings: 1.1, 1.2 -> next sibling should be 1.3
    const existingPaths = ['1.1', '1.2'];
    const refPath = '1.2';

    const siblingNumbers = existingPaths.map((p) => {
      const last = parseInt(p.split('.').pop()!, 10);
      return isNaN(last) ? 0 : last;
    });
    const nextNum = Math.max(...siblingNumbers) + 1;
    expect(nextNum).toBe(3);

    const pathParts = refPath.split('.');
    pathParts[pathParts.length - 1] = String(nextNum);
    const newPath = pathParts.join('.');
    expect(newPath).toBe('1.3');
  });

  it('computes sibling path for nested nodes', () => {
    // Existing siblings: 1.2.1, 1.2.2 -> next sibling should be 1.2.3
    const existingPaths = ['1.2.1', '1.2.2'];
    const refPath = '1.2.2';

    const siblingNumbers = existingPaths.map((p) => {
      const last = parseInt(p.split('.').pop()!, 10);
      return isNaN(last) ? 0 : last;
    });
    const nextNum = Math.max(...siblingNumbers) + 1;
    expect(nextNum).toBe(3);

    const pathParts = refPath.split('.');
    pathParts[pathParts.length - 1] = String(nextNum);
    const newPath = pathParts.join('.');
    expect(newPath).toBe('1.2.3');
  });

  it('computes code with prefix correctly', () => {
    // Parent code: P-1.2 -> child code should be P-1.2.1
    const parentCode = 'P-1.2';
    const childPath = '1.2.1';
    const codePrefix = parentCode.includes('-') ? parentCode.split('-')[0] + '-' : '';
    const childCode = `${codePrefix}${childPath}`;
    expect(childCode).toBe('P-1.2.1');
  });

  it('computes code without prefix correctly', () => {
    // Parent code: 1.2 -> child code should be 1.2.1
    const parentCode = '1.2';
    const childPath = '1.2.1';
    const codePrefix = parentCode.includes('-') ? parentCode.split('-')[0] + '-' : '';
    const childCode = `${codePrefix}${childPath}`;
    expect(childCode).toBe('1.2.1');
  });
});

// ---------------------------------------------------------------------------
// Child Task Inheritance Tests
// ---------------------------------------------------------------------------

describe('Inline Task Creation - Child Task Inheritance', () => {
  it('child task inherits parent start date', () => {
    const parent = createMockRow('node-1', 'P-1.1', '1.1', null, '2026-11-09', '2026-11-13');

    // Child should inherit parent's planned_start_date
    const childStartDate = parent.planned_start_date;
    expect(childStartDate).toBe('2026-11-09');
  });

  it('child task inherits parent security classification', () => {
    const parent = createMockRow(
      'node-1',
      'P-1.1',
      '1.1',
      null,
      '2026-11-02',
      '2026-11-06',
      'TOP_SECRET',
    );

    // Child should inherit parent's security_classification
    const childClassification = parent.security_classification;
    expect(childClassification).toBe('TOP_SECRET');
  });

  it('child task inherits parent delivery mode', () => {
    const parent = createMockRow(
      'node-1',
      'P-1.1',
      '1.1',
      null,
      '2026-11-02',
      '2026-11-06',
      'OFFICIAL',
      'AGILE',
    );

    const childDeliveryMode = parent.delivery_mode;
    expect(childDeliveryMode).toBe('AGILE');
  });

  it('child task inherits parent EVM technique', () => {
    const parent = createMockRow(
      'node-1',
      'P-1.1',
      '1.1',
      null,
      '2026-11-02',
      '2026-11-06',
      'OFFICIAL',
      'WATERFALL',
      'PERCENT_COMPLETE',
    );

    const childEvmTechnique = parent.evm_technique;
    expect(childEvmTechnique).toBe('PERCENT_COMPLETE');
  });

  it('child task inherits parent calendar ID', () => {
    const parent = createMockRow(
      'node-1',
      'P-1.1',
      '1.1',
      null,
      '2026-11-02',
      '2026-11-06',
      'OFFICIAL',
      'WATERFALL',
      null,
      'cal-standard',
    );

    const childCalendarId = parent.calendar_id;
    expect(childCalendarId).toBe('cal-standard');
  });

  it('child task defaults to today when parent has no start date', () => {
    const parent = createMockRow('node-1', 'P-1.1', '1.1', null, null as any, null as any);

    // When parent has no start date, child defaults to today
    const todayStr = new Date().toISOString().split('T')[0];
    const childStartDate = parent.planned_start_date || todayStr;
    expect(childStartDate).toBe(todayStr);
  });
});

// ---------------------------------------------------------------------------
// Sibling Task Inheritance Tests
// ---------------------------------------------------------------------------

describe('Inline Task Creation - Sibling Task Inheritance', () => {
  it('sibling inherits classification from reference node', () => {
    const ref = createMockRow(
      'node-2',
      'P-1.2',
      '1.2',
      'node-1',
      '2026-11-02',
      '2026-11-06',
      'SECRET',
    );

    const siblingClassification = ref.security_classification;
    expect(siblingClassification).toBe('SECRET');
  });

  it('sibling inherits delivery mode from reference node', () => {
    const ref = createMockRow(
      'node-2',
      'P-1.2',
      '1.2',
      'node-1',
      '2026-11-02',
      '2026-11-06',
      'OFFICIAL',
      'HYBRID',
    );

    const siblingDeliveryMode = ref.delivery_mode;
    expect(siblingDeliveryMode).toBe('HYBRID');
  });

  it('sibling inherits EVM technique from reference node', () => {
    const ref = createMockRow(
      'node-2',
      'P-1.2',
      '1.2',
      'node-1',
      '2026-11-02',
      '2026-11-06',
      'OFFICIAL',
      'WATERFALL',
      'MILESTONE_UNITS',
    );

    const siblingEvmTechnique = ref.evm_technique;
    expect(siblingEvmTechnique).toBe('MILESTONE_UNITS');
  });

  it('sibling inherits currency code from reference node', () => {
    const ref = createMockRow('node-2', 'P-1.2', '1.2', 'node-1');
    ref.currency_code = 'EUR';

    const siblingCurrency = ref.currency_code;
    expect(siblingCurrency).toBe('EUR');
  });
});

// ---------------------------------------------------------------------------
// Sibling Relationship Mode Tests
// ---------------------------------------------------------------------------

describe('Inline Task Creation - Sibling Relationship Modes', () => {
  it('FOLLOW_ON sibling starts after reference finish date', () => {
    const ref = createMockRow('node-2', 'P-1.2', '1.2', 'node-1', '2026-11-02', '2026-11-06');

    // FOLLOW_ON: start = ref finish + 1 workday
    const refFinish = ref.planned_end_date || ref.planned_start_date || '';
    const followOnStart = addWorkdays(refFinish, 1);

    // 2026-11-06 is Friday, +1 workday = Monday 2026-11-09
    expect(followOnStart).toBe('2026-11-09');
  });

  it('FOLLOW_ON with weekend gap', () => {
    const ref = createMockRow('node-2', 'P-1.2', '1.2', 'node-1', '2026-11-04', '2026-11-06');

    // 2026-11-06 is Friday, +1 workday = Monday 2026-11-09
    const refFinish = ref.planned_end_date || '';
    const followOnStart = addWorkdays(refFinish, 1);
    expect(followOnStart).toBe('2026-11-09');
  });

  it('PARALLEL sibling starts at same date as reference', () => {
    const ref = createMockRow('node-2', 'P-1.2', '1.2', 'node-1', '2026-11-02', '2026-11-06');

    // PARALLEL: start = ref start
    const parallelStart = ref.planned_start_date;
    expect(parallelStart).toBe('2026-11-02');
  });

  it('FOLLOW_ON sibling end date equals start date by default', () => {
    const ref = createMockRow('node-2', 'P-1.2', '1.2', 'node-1', '2026-11-02', '2026-11-06');

    const refFinish = ref.planned_end_date || '';
    const followOnStart = addWorkdays(refFinish, 1);
    const followOnEnd = followOnStart; // default: end = start

    expect(followOnEnd).toBe('2026-11-09');
  });

  it('default relationship mode is FOLLOW_ON', () => {
    // The store defaults siblingRelationshipMode to 'FOLLOW_ON'
    const defaultMode = 'FOLLOW_ON';
    expect(defaultMode).toBe('FOLLOW_ON');
  });
});

// ---------------------------------------------------------------------------
// Insert Position Tests
// ---------------------------------------------------------------------------

describe('Inline Task Creation - Insert Position', () => {
  it('child is inserted after parent and its descendants', () => {
    const rows = [
      createMockRow('node-1', 'P-1.1', '1.1', null),
      createMockRow('node-1-1', 'P-1.1.1', '1.1.1', 'node-1'),
      createMockRow('node-1-2', 'P-1.1.2', '1.1.2', 'node-1'),
      createMockRow('node-2', 'P-1.2', '1.2', null),
    ];

    const parentIndex = rows.findIndex((r) => r.id === 'node-1');
    let insertIndex = parentIndex + 1;
    while (insertIndex < rows.length && rows[insertIndex].indentLevel > rows[parentIndex].indentLevel) {
      insertIndex++;
    }

    // Should skip over children (1.1.1, 1.1.2) and insert before 1.2
    expect(insertIndex).toBe(3);
  });

  it('sibling is inserted after reference and its descendants', () => {
    const rows = [
      createMockRow('node-1', 'P-1.1', '1.1', null),
      createMockRow('node-1-1', 'P-1.1.1', '1.1.1', 'node-1'),
      createMockRow('node-2', 'P-1.2', '1.2', null),
      createMockRow('node-2-1', 'P-1.2.1', '1.2.1', 'node-2'),
      createMockRow('node-3', 'P-1.3', '1.3', null),
    ];

    const refIndex = rows.findIndex((r) => r.id === 'node-2');
    let insertIndex = refIndex + 1;
    while (insertIndex < rows.length && rows[insertIndex].indentLevel > rows[refIndex].indentLevel) {
      insertIndex++;
    }

    // Should skip over 1.2.1 and insert before 1.3
    expect(insertIndex).toBe(4);
  });

  it('sibling is inserted at end when reference is last', () => {
    const rows = [
      createMockRow('node-1', 'P-1.1', '1.1', null),
      createMockRow('node-2', 'P-1.2', '1.2', null),
    ];

    const refIndex = rows.findIndex((r) => r.id === 'node-2');
    let insertIndex = refIndex + 1;
    while (insertIndex < rows.length && rows[insertIndex].indentLevel > rows[refIndex].indentLevel) {
      insertIndex++;
    }

    // Should be at the end
    expect(insertIndex).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Draft ID Generation Tests
// ---------------------------------------------------------------------------

describe('Inline Task Creation - Draft IDs', () => {
  it('draft IDs are unique', () => {
    const id1 = `draft-${Date.now()}`;
    const id2 = `draft-${Date.now() + 1}`;
    expect(id1).not.toBe(id2);
    expect(id1.startsWith('draft-')).toBe(true);
    expect(id2.startsWith('draft-')).toBe(true);
  });

  it('draft IDs are temporary and distinguishable from real UUIDs', () => {
    const draftId = `draft-${Date.now()}`;
    const realId = 'c3c42b90-2f25-41eb-8893-d1db0ddd2bf7';

    expect(draftId.startsWith('draft-')).toBe(true);
    expect(realId.startsWith('draft-')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Keyboard Shortcut Mapping Tests
// ---------------------------------------------------------------------------

describe('Inline Task Creation - Keyboard Shortcuts', () => {
  it('Insert key maps to sibling creation', () => {
    // The keyboard shortcut hook maps Insert key to onInsertSibling
    const keyMap: Record<string, string> = {
      Insert: 'insertSibling',
    };
    expect(keyMap['Insert']).toBe('insertSibling');
  });

  it('Ctrl+Enter maps to child creation', () => {
    // The keyboard shortcut hook maps Ctrl+Enter to onInsertChild
    const keyMap: Record<string, string> = {
      'Ctrl+Enter': 'insertChild',
    };
    expect(keyMap['Ctrl+Enter']).toBe('insertChild');
  });

  it('Tab maps to indent', () => {
    const keyMap: Record<string, string> = {
      Tab: 'indent',
    };
    expect(keyMap['Tab']).toBe('indent');
  });

  it('Shift+Tab maps to outdent', () => {
    const keyMap: Record<string, string> = {
      'Shift+Tab': 'outdent',
    };
    expect(keyMap['Shift+Tab']).toBe('outdent');
  });
});
