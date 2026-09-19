/**
 * Utility to prevent unwanted viewport zooming and touch distortion on mobile touchscreens.
 * Keeps the application securely fitted within the screen touch bounds and prevents
 * accidental pinch-to-zoom or double-tap zoom issues across the UI, while explicitly
 * allowing full zooming and panning gestures inside map containers.
 */
export function initTouchZoomPrevention(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  // Helper to check if event target is inside an interactive map
  const isInsideMap = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest('.leaflet-container') ||
      target.closest('.leaflet-pane') ||
      target.closest('.leaflet-control-container') ||
      target.closest('#hotspots-map')
    );
  };

  // 1. Prevent iOS Safari multi-touch pinch gesture zoom, except on maps
  const preventGesture = (e: Event) => {
    if (isInsideMap(e.target)) {
      return; // Allow gesture zooming on maps
    }
    e.preventDefault();
  };
  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });

  // 2. Prevent multi-touch pinch on the viewport (2 or more fingers), except on maps
  const handleTouchStart = (e: TouchEvent) => {
    if (isInsideMap(e.target)) {
      return; // Allow multi-finger pinch-to-zoom on maps
    }
    if (e.touches && e.touches.length > 1) {
      // Prevent browser viewport pinch zoom
      e.preventDefault();
    }
  };
  document.addEventListener('touchstart', handleTouchStart, { passive: false });

  // 3. Prevent rapid double-tap to zoom on buttons, cards, and UI surfaces, except on maps
  let lastTouchEndTime = 0;
  const handleTouchEnd = (e: TouchEvent) => {
    if (isInsideMap(e.target)) {
      return; // Allow map double-tap zoom
    }
    const now = Date.now();
    const target = e.target as HTMLElement | null;
    const isInputElement =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

    if (!isInputElement && now - lastTouchEndTime <= 300) {
      e.preventDefault();
    }
    lastTouchEndTime = now;
  };
  document.addEventListener('touchend', handleTouchEnd, { passive: false });

  // 4. Prevent Ctrl + Wheel / Cmd + Wheel browser zooming, except on maps
  const handleWheel = (e: WheelEvent) => {
    if (isInsideMap(e.target)) {
      return; // Allow map wheel zoom
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  };
  window.addEventListener('wheel', handleWheel, { passive: false });

  // 5. Prevent keyboard zoom shortcuts (Ctrl/Cmd + '+', '-', '0')
  const handleKeyDown = (e: KeyboardEvent) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')
    ) {
      e.preventDefault();
    }
  };
  window.addEventListener('keydown', handleKeyDown, { passive: false });

  return () => {
    document.removeEventListener('gesturestart', preventGesture);
    document.removeEventListener('gesturechange', preventGesture);
    document.removeEventListener('gestureend', preventGesture);
    document.removeEventListener('touchstart', handleTouchStart);
    document.removeEventListener('touchend', handleTouchEnd);
    window.removeEventListener('wheel', handleWheel);
    window.removeEventListener('keydown', handleKeyDown);
  };
}
