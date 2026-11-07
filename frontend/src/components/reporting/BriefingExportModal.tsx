/**
 * BriefingExportModal Component
 *
 * Modal dialog for generating executive briefing slide decks (.pptx).
 *
 * Features
 * --------
 * - Toggle switches to include/exclude specific briefing slides:
 *   1. Executive Program Health (CPI/SPI dials and RAG status)
 *   2. Comparative Gantt Chart Snapshot (with Jagged Status Drop Line)
 *   3. Cumulative EVM S-Curve
 *   4. Monte Carlo Tornado Sensitivity Chart
 *   5. 5x5 Program Risk Matrix
 * - Download trigger calling POST /api/v1/reports/briefing/generate-deck
 * - Progress indicator during deck generation
 * - Classification stamp preview
 * - Export-control disclaimer toggle
 *
 * @example
 * ```tsx
 * <BriefingExportModal
 *   isOpen={showBriefingModal}
 *   onClose={() => setShowBriefingModal(false)}
 *   projectId="..."
 *   statusDate="2026-10-24"
 * />
 * ```
 */

import React, { useState, useCallback } from 'react';
import {
  X,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Calendar,
  TrendingUp,
  Activity,
  Grid3X3,
  Shield,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import type {
  BriefingGenerateRequest,
  BriefingGenerateResponse,
  BriefingSlideDefinition,
} from '../../types/reporting';

// ---------------------------------------------------------------------------
// Slide Definitions
// ---------------------------------------------------------------------------

/**
 * The 5 standard briefing slides with their metadata.
 */
const BRIEFING_SLIDES: BriefingSlideDefinition[] = [
  {
    slide_number: 1,
    title: 'Executive Program Health',
    description: 'CPI/SPI dials, RAG status indicators, and overall programme health summary.',
    icon: 'BarChart3',
  },
  {
    slide_number: 2,
    title: 'Comparative Gantt Snapshot',
    description: 'Top-level WBS nodes with live forecast bars, B₀ baseline tracks, and jagged status drop line.',
    icon: 'Calendar',
  },
  {
    slide_number: 3,
    title: 'Cumulative EVM S-Curve',
    description: 'Historical and projected PV, EV, and AC curves through contract completion.',
    icon: 'TrendingUp',
  },
  {
    slide_number: 4,
    title: 'Monte Carlo Tornado Chart',
    description: 'Top 5 schedule drivers ranked by Monte Carlo Criticality Index.',
    icon: 'Activity',
  },
  {
    slide_number: 5,
    title: '5×5 Program Risk Matrix',
    description: 'Active risks plotted by likelihood vs consequence with mitigation owners.',
    icon: 'Grid3X3',
  },
];

/**
 * Map icon identifiers to Lucide React components.
 */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3,
  Calendar,
  TrendingUp,
  Activity,
  Grid3X3,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BriefingExportModalProps {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** UUID of the root PortfolioNode for the programme */
  projectId: string;
  /** Reporting cut-off date (ISO format) */
  statusDate: string;
  /** Optional: programme name for display */
  programmeName?: string;
  /** Optional: classification marking override */
  classificationOverride?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const BriefingExportModal: React.FC<BriefingExportModalProps> = ({
  isOpen,
  onClose,
  projectId,
  statusDate,
  programmeName,
  classificationOverride,
}) => {
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(
    new Set([1, 2, 3, 4, 5]),
  );
  const [includeDisclaimer, setIncludeDisclaimer] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<BriefingGenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Toggle a slide's inclusion in the briefing deck.
   *
   * @param slideNumber - Slide number (1-5) to toggle
   */
  const toggleSlide = useCallback((slideNumber: number) => {
    setSelectedSlides((prev) => {
      const next = new Set(prev);
      if (next.has(slideNumber)) {
        next.delete(slideNumber);
      } else {
        next.add(slideNumber);
      }
      return next;
    });
  }, []);

  /**
   * Select all slides.
   */
  const selectAllSlides = useCallback(() => {
    setSelectedSlides(new Set([1, 2, 3, 4, 5]));
  }, []);

  /**
   * Deselect all slides.
   */
  const deselectAllSlides = useCallback(() => {
    setSelectedSlides(new Set());
  }, []);

  /**
   * Generate and download the briefing deck.
   *
   * Calls POST /api/v1/reports/briefing/generate-deck with the selected
   * slides and triggers a file download of the .pptx output.
   */
  const handleGenerate = useCallback(async () => {
    if (selectedSlides.size === 0) {
      setError('Please select at least one slide to include.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGenerationResult(null);

    try {
      const request: BriefingGenerateRequest = {
        project_id: projectId,
        status_date: statusDate,
        slide_selection: Array.from(selectedSlides).sort((a, b) => a - b),
        include_export_disclaimer: includeDisclaimer,
        ...(classificationOverride && { classification_override: classificationOverride }),
        ...(programmeName && { title_override: programmeName }),
      };

      const response = await api.post('/api/v1/reports/briefing/generate-deck', request, {
        responseType: 'blob',
      });

      // Extract metadata from response headers if available
      const deckId = response.headers['x-deck-id'] || `deck-${Date.now()}`;
      const title = response.headers['x-deck-title'] || 'Executive Briefing Deck';
      const classification = response.headers['x-classification'] || 'OFFICIAL-SENSITIVE';

      const result: BriefingGenerateResponse = {
        deck_id: deckId,
        title,
        slide_count: selectedSlides.size,
        slides: Array.from(selectedSlides).map((num) => {
          const def = BRIEFING_SLIDES.find((s) => s.slide_number === num);
          return {
            slide_number: num,
            slide_title: def?.title || `Slide ${num}`,
            data_points: 0,
          };
        }),
        file_size_bytes: response.data.size,
        classification,
        generated_at: new Date().toISOString(),
        message: `Briefing deck generated with ${selectedSlides.size} slides.`,
      };

      setGenerationResult(result);

      // Trigger file download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${statusDate}.pptx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (err: any) {
      const message = err?.response?.data?.detail || err?.message || 'Failed to generate briefing deck.';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedSlides, projectId, statusDate, includeDisclaimer, classificationOverride, programmeName]);

  /**
   * Close the modal and reset state.
   */
  const handleClose = useCallback(() => {
    setIsGenerating(false);
    setGenerationResult(null);
    setError(null);
    setSelectedSlides(new Set([1, 2, 3, 4, 5]));
    setIncludeDisclaimer(true);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  // Get icon component by name
  const getIcon = (iconName: string) => {
    const IconComponent = ICON_MAP[iconName];
    return IconComponent ? <IconComponent className="w-5 h-5" /> : null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefing-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-2xl mx-4 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-cls-secret" />
            <div>
              <h2
                id="briefing-modal-title"
                className="text-lg font-semibold text-text-ops-primary"
              >
                Executive Briefing Deck
              </h2>
              <p className="text-xs text-text-ops-muted">
                Generate classification-stamped .pptx presentation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Classification Preview */}
          <div className="mb-4 px-3 py-2 bg-red-900/20 border border-red-800/50 rounded-md">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-400" />
              <span className="text-sm font-mono font-bold text-red-400">
                {classificationOverride || 'OFFICIAL-SENSITIVE // UK EYES ONLY'}
              </span>
            </div>
            <p className="text-xs text-text-ops-muted mt-1">
              Every slide will be stamped with this classification marking.
            </p>
          </div>

          {/* Status Date */}
          <div className="mb-4 flex items-center gap-2 text-sm text-text-ops-muted">
            <Calendar className="w-4 h-4" />
            <span>Status Date: <span className="font-mono text-text-ops-primary">{statusDate}</span></span>
          </div>

          {/* Slide Selection */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-text-ops-primary">
                Slide Selection
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllSlides}
                  className="text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors"
                >
                  Select All
                </button>
                <span className="text-text-ops-muted">/</span>
                <button
                  type="button"
                  onClick={deselectAllSlides}
                  className="text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {BRIEFING_SLIDES.map((slide) => {
                const isSelected = selectedSlides.has(slide.slide_number);
                return (
                  <button
                    key={slide.slide_number}
                    type="button"
                    onClick={() => toggleSlide(slide.slide_number)}
                    className={clsx(
                      'w-full flex items-start gap-3 p-3 rounded-md border transition-colors text-left',
                      isSelected
                        ? 'bg-bg-ops-overlay border-border-ops-strong'
                        : 'bg-transparent border-border-ops-subtle opacity-60 hover:opacity-80',
                    )}
                  >
                    {/* Toggle Indicator */}
                    <div
                      className={clsx(
                        'mt-0.5 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors',
                        isSelected
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-border-ops-subtle',
                      )}
                    >
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>

                    {/* Icon */}
                    <div className="mt-0.5 flex-shrink-0 text-text-ops-muted">
                      {getIcon(slide.icon)}
                    </div>

                    {/* Title & Description */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-text-ops-muted">
                          Slide {slide.slide_number}
                        </span>
                        <span className="text-sm font-medium text-text-ops-primary truncate">
                          {slide.title}
                        </span>
                      </div>
                      <p className="text-xs text-text-ops-muted mt-0.5 line-clamp-2">
                        {slide.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-text-ops-muted mt-2">
              {selectedSlides.size} of 5 slides selected
            </p>
          </div>

          {/* Export Control Disclaimer */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setIncludeDisclaimer((prev) => !prev)}
              className={clsx(
                'w-full flex items-center gap-3 p-3 rounded-md border transition-colors text-left',
                includeDisclaimer
                  ? 'bg-bg-ops-overlay border-border-ops-strong'
                  : 'bg-transparent border-border-ops-subtle',
              )}
            >
              <div
                className={clsx(
                  'flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors',
                  includeDisclaimer
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-border-ops-subtle',
                )}
              >
                {includeDisclaimer && <CheckCircle2 className="w-4 h-4 text-white" />}
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium text-text-ops-primary">
                  Include Export-Control Disclaimer
                </span>
                <p className="text-xs text-text-ops-muted mt-0.5">
                  Add ITAR/EAR disclaimer on the title slide for export-controlled programmes.
                </p>
              </div>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800/50 rounded-md flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">Generation Failed</p>
                <p className="text-xs text-text-ops-muted mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {generationResult && (
            <div className="mb-4 p-3 bg-green-900/20 border border-green-800/50 rounded-md flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">Deck Generated Successfully</p>
                <p className="text-xs text-text-ops-muted mt-0.5">
                  {generationResult.message} ({(generationResult.file_size_bytes / 1024).toFixed(1)} KB)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-text-ops-muted bg-bg-ops-overlay rounded-md border border-border-ops-subtle hover:text-text-ops-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || selectedSlides.size === 0}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              isGenerating || selectedSlides.size === 0
                ? 'bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700',
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download Briefing Deck
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BriefingExportModal;
