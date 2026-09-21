<script setup lang="ts">
import { ref } from 'vue';
import type { RunPython } from '../main';
import { until } from '@vueuse/core';
import { parse, stringify } from 'yaml';
const emit = defineEmits(['update']);
const props = defineProps<{
  py: RunPython;
  hard?: Boolean;
  isConfigAllIdle: boolean;
  profileSlots?: number; // onboard slots this model has (Basilisk V3: 5, Naga V2 HyperSpeed: 1)
}>();

const profileConfigData = defineModel<any>('profileConfigData');
const enableAllConfigSections = defineModel<boolean>('enableAllConfigSections');

const profileTextData = ref();

const allProfileList = ['direct', 'white', 'red', 'green', 'blue', 'cyan'];
const onboardSlots = allProfileList.slice(1, 1 + (props.profileSlots ?? 5));
const profileList = ref<string[]>([]);
const confirmDelete = ref<{ [key: string]: boolean }>(
  allProfileList.reduce((acc:{ [key: string]: boolean },curr)=> (acc[curr]=false,acc),{}));
  // all profile list as key, false as value
async function updateProfileList() {
  const newList = await props.py('[x.name.lower() for x in device.get_profile_list()]');
  profileList.value = newList;
  emit('update', newList);
}
if (props.hard) {
  updateProfileList();
}

async function newProfile(profile: string) {
  await props.py('device.new_profile(pt.Profile[profile.upper()])', {locals: {profile: profile}});
  await updateProfileList();
}

async function deleteProfile(profile: string) {
  confirmDelete.value[profile] = false;
  await props.py('device.delete_profile(pt.Profile[profile.upper()])', {locals: {profile: profile}});
  await updateProfileList();
}

async function exportConfig() {
  enableAllConfigSections.value = true;
  if (props.hard && props.isConfigAllIdle){
    await until(() => props.isConfigAllIdle).toBe(false, {timeout: 10000, throwOnTimeout: true});
  }
  await until(() => props.isConfigAllIdle).toBe(true, {timeout: 10000, throwOnTimeout: true});
  profileTextData.value = stringify(profileConfigData.value, {collectionStyle: 'flow'});
  enableAllConfigSections.value = false;
}

async function importConfig() {
  enableAllConfigSections.value = true;
  if (props.hard && props.isConfigAllIdle){
    await until(() => props.isConfigAllIdle).toBe(false, {timeout: 10000, throwOnTimeout: true});
  }
  await until(() => props.isConfigAllIdle).toBe(true, {timeout: 10000, throwOnTimeout: true});
  profileConfigData.value = parse(profileTextData.value);
  if (props.hard && props.isConfigAllIdle){
    await until(() => props.isConfigAllIdle).toBe(false, {timeout: 10000, throwOnTimeout: true});
  }
  await until(() => props.isConfigAllIdle).toBe(true, {timeout: 10000, throwOnTimeout: true});
  enableAllConfigSections.value = false;
}

</script>
<template>
  <div class="flex flex-col gap-4">
    <div class="card bg-base-100 shadow-sm" v-if="hard">
      <div class="card-body p-5">
        <h2>Onboard profiles</h2>
        <p class="text-sm opacity-70 mb-2">This mouse has {{ onboardSlots.length }} onboard {{ onboardSlots.length === 1 ? 'slot' : 'slots' }}. Direct is always available and is never saved.</p>
        <div class="flex flex-col gap-2">
          <div v-for="p in onboardSlots" :key="p" class="flex items-center gap-3">
            <span class="badge capitalize w-20" :class="profileList.includes(p) ? 'badge-primary' : 'badge-ghost'">{{ p }}</span>
            <span class="text-sm opacity-60 flex-1">{{ profileList.includes(p) ? 'stored on the mouse' : 'empty slot' }}</span>
            <button class="btn btn-sm btn-success min-w-24" v-if="!profileList.includes(p)" @click="newProfile(p)">Create</button>
            <button class="btn btn-sm btn-error min-w-24" v-else-if="confirmDelete[p]" @click="deleteProfile(p)">Confirm</button>
            <button class="btn btn-sm btn-ghost min-w-24" v-else @click="confirmDelete[p] = true">Delete</button>
          </div>
        </div>
      </div>
    </div>
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-5">
        <h2>Export and import</h2>
        <p class="text-sm opacity-70">Works on the profile selected at the top. Export, switch profile, import to clone it. Macros and sensor data are stored separately and are not included.</p>
        <textarea
          placeholder="Profile config (YAML)"
          class="textarea textarea-bordered textarea-sm font-mono w-full h-40 my-3"
          v-model="profileTextData"></textarea>
        <div class="flex gap-3">
          <button class="btn btn-sm flex-1" @click="exportConfig">Export</button>
          <button class="btn btn-sm btn-primary flex-1" @click="importConfig">Import</button>
        </div>
      </div>
    </div>
  </div>
</template>
