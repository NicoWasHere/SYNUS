// Global color constants for use with Colorize, GradientMap, chromaKey,
// or anywhere else a project wants a plain hex string - COLORS.RED etc.
const RAW_COLORS = {
  RED: '#ff0000',
  ORANGE: '#ff8000',
  YELLOW: '#ffff00',
  GREEN: '#00ff00',
  CYAN: '#00ffff',
  BLUE: '#0000ff',
  PURPLE: '#8000ff',
  PINK: '#ff00ff',
  WHITE: '#ffffff',
  BLACK: '#000000',
};

// Case-insensitive lookup (COLORS.white / COLORS.White / COLORS.WHITE all
// resolve the same way) - a plain object's property access is case-
// SENSITIVE, so a name that's off by case reads as plain `undefined`
// rather than throwing. That's a real, silent trap: something like
// chromaKey(src, { color: COLORS.white }) doesn't error, it just passes
// `undefined` through to toUniforms' own `color = '#00ff00'` destructuring
// default - which quietly keys out GREEN instead of white, with no
// indication anything was ever mistyped. This Proxy closes that off
// structurally instead of relying on every caller to remember the
// ALL-CAPS convention exactly.
export const COLORS = new Proxy(RAW_COLORS, {
  get(target, prop) {
    if (typeof prop === 'string') {
      const upper = prop.toUpperCase();
      if (upper in target) return target[upper];
    }
    return target[prop];
  },
});
