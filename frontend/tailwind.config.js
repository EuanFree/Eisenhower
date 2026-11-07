/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Background palette
        'bg-ops-base': 'var(--bg-ops-base)',
        'bg-ops-surface': 'var(--bg-ops-surface)',
        'bg-ops-overlay': 'var(--bg-ops-overlay)',
        // Border palette
        'border-ops-subtle': 'var(--border-ops-subtle)',
        'border-ops-strong': 'var(--border-ops-strong)',
        // Classification theme colors
        'cls-official': 'var(--cls-official)',
        'cls-official-sensitive': 'var(--cls-official-sensitive)',
        'cls-secret': 'var(--cls-secret)',
        'cls-top-secret': 'var(--cls-top-secret)',
        // Text palette
        'text-ops-primary': 'var(--text-ops-primary)',
        'text-ops-muted': 'var(--text-ops-muted)',
        // RAG metrics
        'rag-red': 'var(--rag-red)',
        'rag-amber': 'var(--rag-amber)',
        'rag-green': 'var(--rag-green)',
      },
      fontFamily: {
        'monospace': ['ui-monospace', 'JetBrains Mono', 'Cascadia Code', 'monospace'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
