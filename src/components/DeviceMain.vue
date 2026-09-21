<script setup lang="ts">
import { inject, ref, computed, onMounted } from 'vue';
import type { Ref } from 'vue';
import MouseInfo from './MouseInfo.vue';
import BasicConfig from './BasicConfig.vue';
import type { RunPython } from '../main';
import ProfileConfig from './ProfileConfig.vue';
import ButtonConfig from './ButtonConfig.vue';
import MacroConfig from './MacroConfig.vue';
import SensorConfig from './SensorConfig.vue';
import LedConfig from './LedConfig.vue';
import PythonRunner from './PythonRunner.vue';

const props = defineProps<{
  hard?: boolean;
}>();

const allProfileList = ['direct', 'white', 'red', 'green', 'blue', 'cyan'];
const runPython = inject<Ref<RunPython | null>>('runPython');
const activeProfile = ref('direct');
const activeTab = ref('basic');
const refreshKey = ref(0);
const hasProfileList = ref(['direct', 'white']);
function hasProfile(name: string) {
  return hasProfileList.value.indexOf(name) !== -1;
}
function updateHasProfileList(value: string[]) {
  value = ['direct'].concat(value);
  hasProfileList.value = value;
  if (!value.includes(activeProfile.value)) {
    activeProfile.value = 'direct';
  }
}
const profileConfigData = ref({
  basic: {},
  button: {},
  led: {},
});
const profileConfigStatus = ref({
  basic: {},
  button: {},
  led: {},
});
const isConfigAllIdle = computed(() => {
  for (let [sectionName, sectionValue] of Object.entries(profileConfigStatus.value)) {
    for (let [name, status] of Object.entries(sectionValue)) {
      if (status !== 'idle') {
        return false;
      }
    }
  }
  return true;
});
const enableAllConfigSections = ref(false);

// Per-device UI data, read from the connected Python device object.
const deviceName = ref('Razer Basilisk V3');
const buttonsLayout = ref<(string | null)[] | undefined>(undefined);
const unsupported = ref<string[]>([]);
const deviceInfoLoaded = ref(!props.hard);
onMounted(async () => {
  if (!props.hard || !runPython?.value) { return; }
  try {
    const info = await runPython.value(`
{'name': getattr(device, 'model_name', 'Razer mouse'), 'layout': list(getattr(device, 'buttons_layout', [])), 'unsupported': list(getattr(device, 'unsupported', ()))}
    `);
    deviceName.value = info.name;
    if (info.layout && info.layout.length) { buttonsLayout.value = info.layout; }
    unsupported.value = info.unsupported ?? [];
  } catch (e) {
    console.error('could not read device layout: ' + e);
  } finally {
    deviceInfoLoaded.value = true;
  }
});


</script>
<template>
  <h1><img src="/snakemouse.svg" class="inline h-[1em]" />{{ deviceName }} Onboard Memory Tools</h1>
  <div>
    Profile:
    <div class="join">
      <button class="btn btn-sm join-item"
        v-for="p in allProfileList"
        :class="{'btn-active': activeProfile === p}" :disabled="!hasProfile(p)"
        @click="activeProfile = p">{{ p }}</button>
    </div>
    <span class="loading loading-spinner loading-sm" v-if="!isConfigAllIdle"></span>
  </div>
  <main class="flex flex-row">
    <div class="join join-vertical">
      <button class="btn join-item" :class="{'btn-active': activeTab === 'basic'}" @click="activeTab = 'basic'; refreshKey++; ">Basic</button>
      <button class="btn join-item" :class="{'btn-active': activeTab === 'button'}" @click="activeTab = 'button'; refreshKey++; ">Button</button>
      <button class="btn join-item" :class="{'btn-active': activeTab === 'led'}" @click="activeTab = 'led'; refreshKey++; ">LED</button>
      <button class="btn join-item" :class="{'btn-active': activeTab === 'profile'}" @click="activeTab = 'profile'; refreshKey++; ">Profile</button>
      <button class="btn join-item" :class="{'btn-active': activeTab === 'macro'}" @click="activeTab = 'macro'; refreshKey++; ">Macro</button>
      <button class="btn join-item" :class="{'btn-active': activeTab === 'sensor'}" @click="activeTab = 'sensor'; refreshKey++; ">Sensor</button>
      <button class="btn join-item" :class="{'btn-active': activeTab === 'info'}" @click="activeTab = 'info'; refreshKey++; ">Info</button>
    </div>
    <div class="w-md p-2">
      <div v-if="!runPython">Python is not loaded</div>
      <div v-else>
        <Suspense>
          <div>
            <BasicConfig v-if="deviceInfoLoaded && (activeTab === 'basic' || enableAllConfigSections)" v-show="!enableAllConfigSections"
              :key="refreshKey" :py="runPython" :active-profile="activeProfile" :hard="hard" :unsupported="unsupported"
              v-model:bridge-data="profileConfigData.basic" v-model:bridge-status="profileConfigStatus.basic"/>
            <ButtonConfig v-if="deviceInfoLoaded && (activeTab === 'button' || enableAllConfigSections)" v-show="!enableAllConfigSections"
              :key="refreshKey" :py="runPython" :active-profile="activeProfile" :hard="hard" :buttons-layout="buttonsLayout"
              v-model:bridge-data="profileConfigData.button" v-model:bridge-status="profileConfigStatus.button"/>
            <LedConfig v-if="activeTab === 'led' || enableAllConfigSections" v-show="!enableAllConfigSections"
              :key="refreshKey" :py="runPython" :active-profile="activeProfile" :hard="hard"
              v-model:bridge-data="profileConfigData.led" v-model:bridge-status="profileConfigStatus.led"/>
            <MacroConfig v-if="activeTab === 'macro'"
              :key="refreshKey" :py="runPython" :active-profile="activeProfile" :hard="hard"/>
            <SensorConfig v-if="activeTab === 'sensor'"
              :key="refreshKey" :py="runPython" :active-profile="activeProfile" :hard="hard"/>
            <MouseInfo v-if="activeTab === 'info' && hard"
              :key="refreshKey" :py="runPython"/>
            <div v-if="activeTab === 'info' && !hard">No hardware connected</div>
            <PythonRunner v-if="activeTab === 'info'" :py="runPython" />
            <!-- v-show is used to load available profiles when initially loaded -->
            <ProfileConfig v-show="activeTab === 'profile'"
              :key="refreshKey" :py="runPython" :hard="hard" @update="updateHasProfileList"
              :is-config-all-idle="isConfigAllIdle"
              v-model:profile-config-data="profileConfigData" v-model:enable-all-config-sections="enableAllConfigSections"/>
          </div>
          <template #fallback>
            <div>Loading...</div>
          </template>
        </Suspense>
      </div>
    </div>
  </main>
</template>
