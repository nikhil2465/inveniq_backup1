import { Chart } from 'chart.js/auto';

export const MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

export const PALETTE = {
  green:  '#0f766e',
  blue:   '#2563eb',
  amber:  '#d97706',
  red:    '#dc2626',
  purple: '#9333ea',
  teal:   '#0d9488',
  gray:   '#9ca3af',
  orange: '#ea580c',
};

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substring(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Returns a Chart.js backgroundColor callback that renders a vertical gradient.
 * Use as: backgroundColor: gradientFill('#0f766e')
 */
export function gradientFill(hexColor, topAlpha = 0.22) {
  return (ctx) => {
    const { ctx: c, chartArea } = ctx.chart;
    if (!chartArea) return hexToRgba(hexColor, topAlpha);
    const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, hexToRgba(hexColor, topAlpha));
    gradient.addColorStop(1, hexToRgba(hexColor, 0));
    return gradient;
  };
}

/**
 * Professional base chart options.
 * Merges `plugins` deeply so custom legend/tooltip options stack on the defaults.
 * All other extra keys (scales, cutout, etc.) are spread at top level.
 */
export function baseOpts(extra = {}) {
  const { plugins: extraPlugins, ...restExtra } = extra;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 380, easing: 'easeInOutQuart' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#f8fafc',
        bodyColor: '#94a3b8',
        borderColor: '#334155',
        borderWidth: 1,
        padding: { x: 12, y: 10 },
        cornerRadius: 8,
        titleFont: { family: "'JetBrains Mono', monospace", size: 11, weight: '700' },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
      },
      ...(extraPlugins ?? {}),
    },
    ...restExtra,
  };
}

/** Returns axis colors appropriate for the current dark/light mode */
export function axisColors() {
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark-mode');
  return {
    grid:  dark ? 'rgba(29,50,37,.45)' : '#e2e6ec',
    tick:  dark ? '#5c7a62'            : '#9ca3af',
    label: dark ? '#8aab91'            : '#4b5563',
  };
}

/** Standard XY scale config with mono ticks — dark-mode aware */
export function scaleXY(yCallback) {
  const c = axisColors();
  return {
    x: {
      grid: { color: c.grid },
      ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' } },
    },
    y: {
      grid: { color: c.grid },
      ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: yCallback },
    },
  };
}

/** Create a Chart.js chart on a canvas ref, returns cleanup function */
export function createChart(canvasRef, config) {
  if (!canvasRef.current) return () => {};
  const chart = new Chart(canvasRef.current, config);
  return () => chart.destroy();
}
