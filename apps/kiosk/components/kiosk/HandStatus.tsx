'use client';

import { CameraOff, Hand, MousePointer2, SunDim } from 'lucide-react';
import { useInputMode } from '@/components/providers/InputModeProvider';
import { isVisionReady, useVision } from '@/components/providers/VisionProvider';

/** Small pill that tells the customer whether their hand is being tracked. */
export function HandStatus({ compact = false }: { compact?: boolean }) {
  const { mode, cameraFallback } = useInputMode();
  const { state } = useVision();

  if (mode === 'mouse') {
    return compact ? null : (
      <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-base text-crema-300">
        <MousePointer2 className="size-5" aria-hidden /> Touch / mouse mode
      </span>
    );
  }

  if (cameraFallback) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-caramel-500/15 px-4 py-2 text-base text-caramel-300 ring-1 ring-caramel-400/30">
        <MousePointer2 className="size-5" aria-hidden />
        {compact ? 'Camera off · mouse' : 'Camera off — using mouse / touch'}
      </span>
    );
  }

  if (!isVisionReady(state)) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-berry-500/15 px-4 py-2 text-base text-berry-300 ring-1 ring-berry-400/30">
        <CameraOff className="size-5" aria-hidden />
        {compact
          ? 'Camera offline'
          : state.connection === 'connected'
            ? 'Camera unavailable'
            : 'Connecting to camera…'}
      </span>
    );
  }

  // Covered camera / lights off: say so instead of silently not seeing the hand.
  if (state.lowLight && !state.handDetected) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full bg-caramel-500/15 px-4 py-2 text-base text-caramel-300 ring-1 ring-caramel-400/30"
        role="status"
      >
        <SunDim className="size-5" aria-hidden />
        {compact ? 'Camera too dark' : 'Camera too dark — add light or uncover the camera'}
      </span>
    );
  }

  return state.handDetected ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-mint-500/15 px-4 py-2 text-base text-mint-300 ring-1 ring-mint-400/40">
      <span className="relative flex size-3">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint-400 opacity-60" />
        <span className="relative inline-flex size-3 rounded-full bg-mint-400" />
      </span>
      Hand detected
    </span>
  ) : (
    <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-base text-crema-300">
      <Hand className="size-5 animate-float" aria-hidden />
      {compact ? 'Raise your hand' : 'Looking for your hand…'}
    </span>
  );
}
