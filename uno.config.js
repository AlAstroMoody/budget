import { defineConfig, presetWind3, presetAttributify, presetIcons } from "unocss";

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
  ],
  theme: {
    colors: {
      primary: {
        50: "#eff6ff",
        100: "#dbeafe",
        200: "#bfdbfe",
        300: "#93c5fd",
        400: "#60a5fa",
        500: "#3b82f6",
        600: "#2563eb",
        700: "#1d4ed8",
        800: "#1e40af",
        900: "#1e3a8a",
      },
      success: {
        500: "#10b981",
        600: "#059669",
      },
      danger: {
        500: "#ef4444",
        600: "#dc2626",
      },
      warning: {
        500: "#f59e0b",
        600: "#d97706",
      },
    },
  },
  shortcuts: {
    // Buttons
    btn: "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    "btn-primary":
      "btn bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500",
    "btn-secondary": "btn bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-500",
    "btn-outline":
      "btn border border-gray-300 bg-transparent hover:bg-gray-50 focus-visible:ring-gray-500",
    "btn-ghost": "btn hover:bg-gray-100 focus-visible:ring-gray-500",

    // Sizes
    "btn-sm": "h-8 px-3 text-sm",
    "btn-md": "h-10 px-4 py-2",
    "btn-lg": "h-12 px-8 text-lg",

    // Cards
    card: "rounded-lg border bg-white shadow-sm",
    "card-header": "flex flex-col space-y-1.5 p-6",
    "card-title": "text-2xl font-semibold leading-none tracking-tight",
    "card-description": "text-sm text-gray-500",
    "card-content": "p-6 pt-0",
    "card-footer": "flex items-center p-6 pt-0",

    // Inputs
    input:
      "flex w-full rounded-md border border-gray-300 bg-white px-3 font-medium transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
    "input-sm": "h-8 text-sm",
    "input-md": "h-10",
    "input-lg": "h-12 text-lg",

    // Tables
    table: "w-full caption-bottom text-sm",
    "table-header": "border-b bg-gray-50",
    "table-header-cell": "px-4 py-3 text-left text-sm font-medium text-gray-900",
    "table-body": "divide-y divide-gray-200",
    "table-row": "hover:bg-gray-50 transition-colors",
    "table-cell": "px-4 py-3 text-sm",

    // Table cell variants
    "table-cell-date": "px-3 py-2 text-sm w-24 text-center",
    "table-cell-description": "px-4 py-2 text-sm max-w-xs break-words",
    "table-cell-amount": "px-3 py-2 text-sm w-28 text-right font-medium",
    "table-cell-category": "px-3 py-2 text-sm w-32 break-words",
  },
  rules: [
    // Custom rules if needed
  ],
});
