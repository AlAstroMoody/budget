<script setup>
defineProps({
  variant: {
    type: String,
    default: "primary",
    validator: (value) => ["primary", "secondary", "outline", "ghost"].includes(value),
  },
  size: {
    type: String,
    default: "md",
    validator: (value) => ["sm", "md", "lg"].includes(value),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});
</script>

<template>
  <button
    :class="[
      'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
      // Variants
      variant === 'primary' &&
        'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
      variant === 'secondary' &&
        'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-500',
      variant === 'outline' &&
        'border border-gray-300 bg-transparent hover:bg-gray-50 focus-visible:ring-gray-500',
      variant === 'ghost' && 'hover:bg-gray-100 focus-visible:ring-gray-500',
      // Sizes
      size === 'sm' && 'h-8 px-3 text-sm',
      size === 'md' && 'h-10 px-4 py-2',
      size === 'lg' && 'h-12 px-8 text-lg',
    ]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>
