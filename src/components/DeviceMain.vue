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

const onboardProfileNames = ['white', 'red', 'green', 'blue', 'cyan'];
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
function selectTab(id: string) {
  activeTab.value = id;
  refreshKey.value++;
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
  for (const sectionValue of Object.values(profileConfigStatus.value)) {
    for (const status of Object.values(sectionValue)) {
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
const profileSlots = ref(5);
const deviceInfoLoaded = ref(!props.hard);
onMounted(async () => {
  if (!props.hard || !runPython?.value) { return; }
  try {
    const info = await runPython.value(`
def _info():
  try:
    slots = int(device.get_profile_total_count())
  except Exception:
    slots = 5
  return {
    'name': getattr(device, 'model_name', 'Razer mouse'),
    'layout': list(getattr(device, 'buttons_layout', [])),
    'unsupported': list(getattr(device, 'unsupported', ())),
    'profile_slots': slots,
  }
_info()
    `);
    deviceName.value = info.name;
    if (info.layout && info.layout.length) { buttonsLayout.value = info.layout.map((b: string | null | undefined) => b ?? null); }
    unsupported.value = info.unsupported ?? [];
    profileSlots.value = info.profile_slots ?? 5;
  } catch (e) {
    console.error('could not read device info: ' + e);
  } finally {
    deviceInfoLoaded.value = true;
  }
});

const visibleProfiles = computed(() => ['direct', ...onboardProfileNames.slice(0, profileSlots.value)]);

const tabs = computed(() => [
  { id: 'basic', label: 'Basic' },
  { id: 'button', label: 'Buttons' },
  ...(unsupported.value.includes('led') ? [] : [{ id: 'led', label: 'Lighting' }]),
  { id: 'profile', label: 'Profiles' },
  ...(unsupported.value.includes('macros') ? [] : [{ id: 'macro', label: 'Macros' }]),
  { id: 'sensor', label: 'Sensor' },
  { id: 'info', label: 'Device' },
]);

</script>
<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <div class="shrink-0 flex flex-wrap items-center gap-4 px-6 py-3 bg-base-100 border-b border-base-300">
      <div class="flex items-center gap-2">
        <span class="text-lg font-semibold">{{ deviceName }}</span>
        <span v-if="!hard" class="badge badge-warning badge-sm">demo</span>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <span class="text-sm opacity-60">Profile</span>
        <div class="join">
          <button class="btn btn-sm join-item capitalize"
            v-for="p in visibleProfiles" :key="p"
            :class="{'btn-primary': activeProfile === p}" :disabled="!hasProfile(p)"
            @click="activeProfile = p">{{ p }}</button>
        </div>
        <span class="loading loading-spinner loading-sm" :class="{'invisible': isConfigAllIdle}"></span>
      </div>
    </div>
    <div class="flex-1 min-h-0 flex">
      <aside class="w-44 shrink-0 bg-base-100 border-r border-base-300 p-2 flex flex-col">
        <ul class="menu menu-sm gap-1 p-0">
          <li v-for="t in tabs" :key="t.id">
            <a :class="{'active': activeTab === t.id}" @click="selectTab(t.id)">{{ t.label }}</a>
          </li>
        </ul>
        <div class="mt-auto p-2 text-xs opacity-60 leading-snug" v-if="activeProfile === 'direct'">
          <b>Direct</b> applies instantly but is lost when the mouse powers off. Pick an onboard profile to keep changes.
        </div>
      </aside>
      <section class="flex-1 min-w-0 overflow-auto p-6">
        <div class="max-w-3xl">
          <div v-if="!runPython">Python is not loaded</div>
          <div v-else>
            <Suspense>
              <div>
                <BasicConfig v-if="deviceInfoLoaded && (activeTab === 'basic' || enableAllConfigSections)" v-show="!enableAllConfigSections"
                  :key="refreshKey" :py="runPython" :active-profile="activeProfile" :hard="hard" :unsupported="unsupported"
                  v-model:bridge-data="profileConfigData.basic" v-model:bridge-status="profileConfigStatus.basic"/>
                <ButtonConfig v-if="deviceInfoLoaded && (activeTab === 'button' || enableAllConfigSections)" v-show="!enableAllConfigSections"
                  :key="refreshKey" :py="runPython" :active-profile="activeProfile" :hard="hard" :buttons-layout="buttonsLayout" :profile-slots="profileSlots" :unsupported="unsupported"
                  v-model:bridge-data="profileConfigData.button" v-model:bridge-status="profileConfigStatus.button"/>
                <LedConfig v-if="deviceInfoLoaded && !unsupported.includes('led') && (activeTab === 'led' || enableAllConfigSections)" v-show="!enableAllConfigSections"
                  :key="refreshKey" :py="runPython" :active-profile="activeProfile" :hard="hard"
                  v-model:bridge-data="profileConfigData.led" v-model:bridge-status="profileConfigStatus.led"/>
                <MacroConfig v-if="activeTab === 'macro'"
                  :key="refreshKey" :py="runPython" :active-profile="activeProfile" :hard="hard"/>
                <SensorConfig v-if="activeTab === 'sensor'"
                  :key="refreshKey" :py="runPython" :active-profile="activeProfile" :hard="hard"/>
                <MouseInfo v-if="activeTab === 'info' && hard"
                  :key="refreshKey" :py="runPython" :unsupported="unsupported"/>
                <div v-if="activeTab === 'info' && !hard" class="opacity-60">No hardware connected</div>
                <PythonRunner v-if="activeTab === 'info'" :py="runPython" />
                <!-- v-show is used to load available profiles when initially loaded -->
                <ProfileConfig v-show="activeTab === 'profile'"
                  :key="refreshKey" :py="runPython" :hard="hard" :profile-slots="profileSlots" @update="updateHasProfileList"
                  :is-config-all-idle="isConfigAllIdle"
                  v-model:profile-config-data="profileConfigData" v-model:enable-all-config-sections="enableAllConfigSections"/>
              </div>
              <template #fallback>
                <div class="flex items-center gap-2 opacity-60"><span class="loading loading-spinner loading-sm"></span>Loading</div>
              </template>
            </Suspense>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
