/**
 * CoPilot Panel Component
 *
 * Docked side panel (280-400px) with header, context bar, message list,
 * and input area. Resizable via drag handle on the left edge.
 */

import { useEffect } from 'react';
import { useCopilotStore } from '../../stores/useCopilotStore';
import { CopilotHeader } from './CopilotHeader';
import { CopilotContextBar } from './CopilotContextBar';
import { CopilotMessageList } from './CopilotMessageList';
import { CopilotInput } from './CopilotInput';

export const CopilotPanel = () => {
  const {
    panel,
    setPanelWidth,
    startResizing,
    stopResizing,
    fetchProviderInfo,
    fetchAvailableTools,
  } = useCopilotStore();

  // Fetch provider info on mount
  useEffect(() => {
    if (panel.isOpen) {
      fetchProviderInfo();
      fetchAvailableTools();
    }
  }, [panel.isOpen, fetchProviderInfo, fetchAvailableTools]);

  // Handle panel resizing
  useEffect(() => {
    if (!panel.isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      stopResizing();
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [panel.isResizing, setPanelWidth, stopResizing]);

  if (!panel.isOpen) return null;

  return (
    <div
      className="flex flex-col h-full bg-gray-900 border-l border-gray-700"
      style={{ width: panel.width }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500/30 transition-colors z-50"
        onMouseDown={startResizing}
        style={{ transform: 'translateX(-1px)' }}
      />

      {/* Header */}
      <CopilotHeader />

      {/* Context bar */}
      <CopilotContextBar />

      {/* Messages */}
      <CopilotMessageList />

      {/* Input */}
      <CopilotInput />
    </div>
  );
};

export default CopilotPanel;
