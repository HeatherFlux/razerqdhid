<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{
  messages: [Date, string][]
}>();

const consoleRef = ref<HTMLElement | null>(null);

const isAtBottom = (element: HTMLElement) => {
  return true;
};

function scrollToBottom() {
  if (consoleRef.value) {
    consoleRef.value.scrollTop = consoleRef.value.scrollHeight;
  }
}

defineExpose({scrollToBottom});

onMounted(() => {
  const observer = new MutationObserver(() => {
    if (consoleRef.value && isAtBottom(consoleRef.value)) {
      consoleRef.value.scrollTop = consoleRef.value.scrollHeight;
    }
  });

  if (consoleRef.value) {
    observer.observe(consoleRef.value, { childList: true });
  }

  onBeforeUnmount(() => {
    observer.disconnect();
  });
});
</script>

<template>
  <ul class="console bg-base-200 font-mono text-xs" ref="consoleRef">
    <li v-for="(item, index) in messages" :key="index">{{ item[0].toTimeString().split(' ')[0] }} {{ item[1] }}</li>
  </ul>
</template>

<style lang="scss" scoped>
.console {
  height: 14em;
  padding: 0.75em 1em;
  width: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  white-space: pre-wrap;
  border-top: 1px solid oklch(var(--b3));
}
</style>