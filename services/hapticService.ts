export const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignore errors if vibration is not supported or blocked
    }
  }
};

export const HapticPatterns = {
  click: 20,              // Short tick for buttons
  heavyClick: 40,         // Heavier tick for major actions
  success: [50, 50, 50],  // Double pulse
  error: [50, 100, 50, 100, 50], // Triple rough pulse
  scan: [30, 50, 30, 50, 30] // Rapid tick pulse for processing
};