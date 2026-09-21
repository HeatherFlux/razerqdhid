<script setup lang="ts">
import { ref, computed } from 'vue';
import ConnectDevice from './components/ConnectDevice.vue';
import DeviceMain from './components/DeviceMain.vue';
import LogConsole from './components/LogConsole.vue';

const connected = ref(false);
const hard = ref(false);

const showConsole = ref(false);
const logConsole = ref<InstanceType<typeof LogConsole> | null>(null);

const logs = ref<[Date, string][]>([[new Date(), 'Ready']]);
function addLog(text: string) {
  logs.value.push([new Date(), text]);
}
// Protocol chatter (s:/r:/python: lines) stays in the log but is skipped in the status line.
const chatter = /^(s|r): |^python: \[\[/;
const lastLog = computed(() => {
  for (let i = logs.value.length - 1; i >= 0; i--) {
    if (!chatter.test(logs.value[i][1])) { return logs.value[i][1]; }
  }
  return '';
});
const lastIsError = computed(() => /\berror\b/i.test(lastLog.value));

var cl:Function, ce:Function, cw:Function;

if(window.console && console.log){
	cl = console.log;
	console.log = function(){
		addLog([...arguments].map(x => String(x)).join(', '));
		cl.apply(this, arguments)
	}
}

if(window.console && console.warn){
	cw = console.warn;
	console.warn = function(){
		addLog(['Warn', ...arguments].map(x => String(x)).join(', '));
		cw.apply(this, arguments)
	}
}

if(window.console && console.error){
	ce = console.error;
	console.error = function(){
	  addLog(['Error', ...arguments].map(x => String(x)).join(', '));
		ce.apply(this, arguments)
	}
}

window.addEventListener("error", (event) => {
  console.error(`${event.type}: ${event.message}`);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error(`${event.type}: ${event.reason}`);
});

function toggleConsole() {
  showConsole.value = !showConsole.value;
  if (logConsole.value) { logConsole.value.scrollToBottom(); }
}

</script>

<template>
  <div class="flex flex-col h-full bg-base-200">
    <header class="flex items-center gap-3 px-4 h-12 shrink-0 bg-base-100 border-b border-base-300">
      <img src="/snakemouse.svg" class="h-6 w-6" alt="" />
      <span class="font-semibold">Razer Onboard Config</span>
      <span class="ml-auto badge badge-sm"
        :class="hard ? 'badge-success' : connected ? 'badge-warning' : 'badge-ghost'">
        {{ hard ? 'Connected' : connected ? 'Demo mode' : 'Not connected' }}
      </span>
    </header>
    <main class="flex-1 min-h-0 flex flex-col">
      <ConnectDevice v-if="!connected" @device-created="connected = true; hard = true;" @device-not-created="connected = true; hard = false;"/>
      <DeviceMain v-else :hard="hard" />
    </main>
    <footer class="shrink-0 bg-base-100 border-t border-base-300">
      <div class="flex items-center gap-3 px-4 h-8 text-xs">
        <button class="btn btn-ghost btn-xs" @click="toggleConsole">{{ showConsole ? 'Hide log' : 'Log' }}</button>
        <span class="truncate font-mono" :class="lastIsError ? 'text-error' : 'opacity-60'">{{ lastLog }}</span>
      </div>
      <LogConsole v-show="showConsole" ref="logConsole" :messages="logs" />
    </footer>
  </div>
</template>
