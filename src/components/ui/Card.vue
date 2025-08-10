<script setup>
defineProps({
  padding: {
    type: String,
    default: "md",
    validator: (value) => ["none", "sm", "md", "lg"].includes(value),
  },
});
</script>

<template>
  <div
    :class="[
      'rounded-lg border bg-white shadow-sm',
      // Padding variants
      padding === 'none' && '',
      padding === 'sm' && 'p-3',
      padding === 'md' && 'p-6',
      padding === 'lg' && 'p-8',
    ]"
  >
    <slot />
  </div>
</template>
