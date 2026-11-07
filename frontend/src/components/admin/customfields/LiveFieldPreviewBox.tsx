/**
 * Live Field Preview Box
 *
 * Real-time sandbox embedded in the right pane of the Field Definition Drawer.
 * Dynamically renders the exact form input component as configured in the form.
 *
 * Features
 * --------
 * - **Dynamic Input Rendering** — Renders the appropriate input component based
 *   on the configured data type (STRING, INTEGER, DECIMAL, BOOLEAN, DATE,
 *   SINGLE_ENUM, MULTI_ENUM, CURRENCY).
 * - **Clearance Emulator** — Toggle between OFFICIAL, SECRET, and TOP_SECRET
 *   clearance levels to demonstrate live field masking ([RESTRICTED]) when
 *   caller clearance is below the field's read_clearance_level.
 * - **Validation Testing** — Interactive test input that validates against the
 *   field's type, constraints, and regex rules in real time.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <LiveFieldPreviewBox
 *   formState={formState}
 *   readClearanceLevel="OFFICIAL"
 * />
 * ```
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Eye,
  Shield,
  Lock,
  Check,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { clsx } from 'clsx';
import type {
  FieldDefinitionFormState,
  ClearanceLevel,
  PreviewTestResult,
} from '../../../types/custom_fields';
import {
  CLEARANCE_LEVELS,
  CLEARANCE_COLORS,
  DATA_TYPE_METADATA,
} from '../../../types/custom_fields';

// ---------------------------------------------------------------------------
// Clearance Level Ranking
// ---------------------------------------------------------------------------

const CLEARANCE_RANK: Record<ClearanceLevel, number> = {
  OFFICIAL: 1,
  SECRET: 2,
  TOP_SECRET: 3,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LiveFieldPreviewBoxProps {
  /** Current form state being configured */
  formState: FieldDefinitionFormState;
}

// ---------------------------------------------------------------------------
// Clearance Emulator Component
// ---------------------------------------------------------------------------

interface ClearanceEmulatorProps {
  /** Current simulated clearance level */
  simulatedClearance: ClearanceLevel;
  /** Field's required read clearance */
  requiredClearance: ClearanceLevel;
  /** Callback when clearance changes */
  onChange: (level: ClearanceLevel) => void;
}

const ClearanceEmulator: React.FC<ClearanceEmulatorProps> = ({
  simulatedClearance,
  requiredClearance,
  onChange,
}) => {
  const isMasked = CLEARANCE_RANK[simulatedClearance] < CLEARANCE_RANK[requiredClearance];

  return (
    <div className="bg-ops-surface border border-ops-subtle rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-4 h-4 text-ops-muted" />
        <h5 className="text-xs font-semibold text-ops-primary">Clearance Emulator</h5>
      </div>

      <p className="text-xs text-ops-muted mb-2">
        View as:
      </p>

      <div className="flex gap-1 mb-3">
        {CLEARANCE_LEVELS.map((level) => {
          const colors = CLEARANCE_COLORS[level];
          const isActive = simulatedClearance === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              className={clsx(
                'flex-1 px-1.5 py-1 rounded border text-center text-xs font-medium transition-colors',
                isActive
                  ? `${colors.bg} ${colors.border} ${colors.text}`
                  : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
              )}
            >
              {level.replace('_', ' ')}
            </button>
          );
        })}
      </div>

      {/* Masking status indicator */}
      <div
        className={clsx(
          'flex items-center gap-2 px-2 py-1.5 rounded text-xs',
          isMasked
            ? 'bg-red-900/20 border border-red-500/30 text-red-400'
            : 'bg-green-900/20 border border-green-500/30 text-green-400',
        )}
      >
        {isMasked ? (
          <>
            <Lock className="w-3 h-3 flex-shrink-0" />
            <span>Field masked — clearance too low</span>
          </>
        ) : (
          <>
            <Eye className="w-3 h-3 flex-shrink-0" />
            <span>Field visible at this clearance</span>
          </>
        )}
      </div>

      {/* Required clearance badge */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-xs text-ops-muted">Required:</span>
        <span
          className={clsx(
            'px-1.5 py-0.5 rounded text-xs font-medium border',
            CLEARANCE_COLORS[requiredClearance].bg,
            CLEARANCE_COLORS[requiredClearance].text,
            CLEARANCE_COLORS[requiredClearance].border,
          )}
        >
          {requiredClearance.replace('_', ' ')}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Masked Field Display
// ---------------------------------------------------------------------------

const MaskedFieldDisplay: React.FC<{ displayLabel: string }> = ({ displayLabel }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-ops-muted">{displayLabel || 'Field'}</span>
      <Lock className="w-3 h-3 text-red-400" />
    </div>
    <div className="px-3 py-2 bg-red-900/10 border border-red-500/30 rounded text-sm font-mono text-red-400">
      [RESTRICTED]
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Live Preview Input Renderer
// ---------------------------------------------------------------------------

interface PreviewInputProps {
  formState: FieldDefinitionFormState;
}

const PreviewInput: React.FC<PreviewInputProps> = ({ formState }) => {
  const { data_type, display_label, enum_options, is_mandatory, validation_rules } = formState;

  const label = display_label || 'Field Label';

  // Boolean toggle
  if (data_type === 'BOOLEAN') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-10 h-5 rounded-full relative cursor-pointer bg-ops-overlay">
          <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ops-base" />
        </div>
        <span className="text-sm text-ops-muted">{label}</span>
        {is_mandatory && <span className="text-red-400 text-xs">*</span>}
      </div>
    );
  }

  // Single enum dropdown
  if (data_type === 'SINGLE_ENUM' && enum_options?.length) {
    return (
      <div>
        <label className="block text-xs text-ops-muted mb-1">
          {label} {is_mandatory && <span className="text-red-400">*</span>}
        </label>
        <select className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary">
          <option value="">Select...</option>
          {enum_options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Multi enum checkboxes
  if (data_type === 'MULTI_ENUM' && enum_options?.length) {
    return (
      <div>
        <label className="block text-xs text-ops-muted mb-1">
          {label} {is_mandatory && <span className="text-red-400">*</span>}
        </label>
        <div className="space-y-1">
          {enum_options.map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <div className="w-4 h-4 border border-ops-subtle rounded bg-ops-overlay" />
              <span className="text-sm text-ops-primary">{opt}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Date picker
  if (data_type === 'DATE') {
    return (
      <div>
        <label className="block text-xs text-ops-muted mb-1">
          {label} {is_mandatory && <span className="text-red-400">*</span>}
        </label>
        <input
          type="date"
          className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary"
        />
      </div>
    );
  }

  // Numeric inputs (INTEGER, DECIMAL, CURRENCY)
  const inputType = data_type === 'INTEGER' || data_type === 'DECIMAL' || data_type === 'CURRENCY' ? 'number' : 'text';
  const prefix = data_type === 'CURRENCY' ? '£' : '';
  const step = data_type === 'INTEGER' ? '1' : '0.01';
  const placeholder = data_type === 'STRING'
    ? (validation_rules?.regex_pattern ? `Match: ${validation_rules.regex_pattern}` : 'Enter text...')
    : '0';

  return (
    <div>
      <label className="block text-xs text-ops-muted mb-1">
        {label} {is_mandatory && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ops-muted text-sm">
            {prefix}
          </span>
        )}
        <input
          type={inputType}
          step={step}
          min={validation_rules?.min}
          max={validation_rules?.max}
          className={clsx(
            'w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary',
            prefix && 'pl-6',
          )}
          placeholder={placeholder}
        />
      </div>
      {validation_rules?.min !== undefined || validation_rules?.max !== undefined ? (
        <p className="text-xs text-ops-muted mt-0.5">
          Range: {validation_rules?.min ?? '-∞'} to {validation_rules?.max ?? '∞'}
        </p>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Validation Test Panel
// ---------------------------------------------------------------------------

interface ValidationTestPanelProps {
  formState: FieldDefinitionFormState;
}

const ValidationTestPanel: React.FC<ValidationTestPanelProps> = ({ formState }) => {
  const [testInput, setTestInput] = useState<string>('');
  const [testResults, setTestResults] = useState<PreviewTestResult[]>([]);

  const validateInput = useCallback(
    (input: string): PreviewTestResult => {
      const { data_type, enum_options, validation_rules } = formState;

      if (data_type === 'STRING') {
        if (validation_rules?.regex_pattern) {
          try {
            const regex = new RegExp(validation_rules.regex_pattern);
            if (!regex.test(input)) {
              return { input, valid: false, error: `Does not match: ${validation_rules.regex_pattern}` };
            }
          } catch {
            return { input, valid: false, error: 'Invalid regex pattern' };
          }
        }
        return { input, valid: true, coerced: input };
      }

      if (data_type === 'INTEGER') {
        const num = Number(input);
        if (!Number.isInteger(num)) {
          return { input, valid: false, error: 'Expected a whole number' };
        }
        if (validation_rules?.min !== undefined && num < validation_rules.min) {
          return { input, valid: false, error: `Value must be >= ${validation_rules.min}` };
        }
        if (validation_rules?.max !== undefined && num > validation_rules.max) {
          return { input, valid: false, error: `Value must be <= ${validation_rules.max}` };
        }
        return { input, valid: true, coerced: num };
      }

      if (data_type === 'DECIMAL' || data_type === 'CURRENCY') {
        const num = parseFloat(input);
        if (isNaN(num)) {
          return { input, valid: false, error: 'Expected a decimal number' };
        }
        if (validation_rules?.min !== undefined && num < validation_rules.min) {
          return { input, valid: false, error: `Value must be >= ${validation_rules.min}` };
        }
        if (validation_rules?.max !== undefined && num > validation_rules.max) {
          return { input, valid: false, error: `Value must be <= ${validation_rules.max}` };
        }
        return { input, valid: true, coerced: num };
      }

      if (data_type === 'BOOLEAN') {
        if (input.toLowerCase() === 'true' || input === '1') {
          return { input, valid: true, coerced: true };
        }
        if (input.toLowerCase() === 'false' || input === '0') {
          return { input, valid: true, coerced: false };
        }
        return { input, valid: false, error: 'Expected true/false, 1/0' };
      }

      if (data_type === 'DATE') {
        const d = new Date(input);
        if (isNaN(d.getTime())) {
          return { input, valid: false, error: 'Expected a valid date (YYYY-MM-DD)' };
        }
        return { input, valid: true, coerced: input };
      }

      if (data_type === 'SINGLE_ENUM') {
        if (!enum_options?.includes(input)) {
          return { input, valid: false, error: `Must be one of: ${enum_options?.join(', ')}` };
        }
        return { input, valid: true, coerced: input };
      }

      if (data_type === 'MULTI_ENUM') {
        const values = input.split(',').map((s) => s.trim());
        const invalid = values.filter((v) => !enum_options?.includes(v));
        if (invalid.length > 0) {
          return { input, valid: false, error: `Invalid: ${invalid.join(', ')}` };
        }
        return { input, valid: true, coerced: values };
      }

      return { input, valid: false, error: 'Unknown data type' };
    },
    [formState],
  );

  const handleTest = useCallback(() => {
    if (!testInput.trim()) return;
    const result = validateInput(testInput.trim());
    setTestResults((prev) => [result, ...prev].slice(0, 10));
  }, [testInput, validateInput]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Send className="w-3 h-3 text-ops-muted" />
        <h5 className="text-xs font-semibold text-ops-primary">Validation Test</h5>
      </div>

      <div className="flex gap-1.5">
        <input
          type="text"
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleTest()}
          className="flex-1 bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-xs text-ops-primary"
          placeholder="Test value..."
        />
        <button
          type="button"
          onClick={handleTest}
          className="px-2 py-1 bg-ops-overlay border border-ops-subtle rounded text-xs text-ops-primary hover:bg-ops-surface transition-colors"
        >
          Test
        </button>
      </div>

      {testResults.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {testResults.map((result, idx) => (
            <div
              key={idx}
              className={clsx(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
                result.valid ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400',
              )}
            >
              {result.valid ? (
                <Check className="w-3 h-3 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              )}
              <span className="font-mono truncate">{result.input}</span>
              <span className="text-ops-muted ml-auto truncate">
                {result.valid ? `→ ${JSON.stringify(result.coerced)}` : result.error}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Live Field Preview Box Component
// ---------------------------------------------------------------------------

const LiveFieldPreviewBox: React.FC<LiveFieldPreviewBoxProps> = ({ formState }) => {
  const [simulatedClearance, setSimulatedClearance] = useState<ClearanceLevel>('TOP_SECRET');

  const isMasked = useMemo(
    () => CLEARANCE_RANK[simulatedClearance] < CLEARANCE_RANK[formState.read_clearance_level],
    [simulatedClearance, formState.read_clearance_level],
  );

  return (
    <div className="bg-ops-base border border-ops-subtle rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-sky-400" />
        <h4 className="text-sm font-semibold text-ops-primary">Live Preview</h4>
        <span className="ml-auto px-1.5 py-0.5 bg-ops-overlay rounded text-xs font-mono text-ops-muted">
          {DATA_TYPE_METADATA[formState.data_type].icon} {formState.data_type}
        </span>
      </div>

      {/* Clearance Emulator */}
      <ClearanceEmulator
        simulatedClearance={simulatedClearance}
        requiredClearance={formState.read_clearance_level}
        onChange={setSimulatedClearance}
      />

      {/* Rendered Preview Input */}
      <div className="p-3 bg-ops-surface rounded border border-ops-subtle">
        {isMasked ? (
          <MaskedFieldDisplay displayLabel={formState.display_label || 'Field'} />
        ) : (
          <PreviewInput formState={formState} />
        )}
      </div>

      {/* Validation Test */}
      <ValidationTestPanel formState={formState} />
    </div>
  );
};

export default LiveFieldPreviewBox;
