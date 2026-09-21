<script setup lang="ts">
import { ref, computed } from 'vue';
import { appProfiles, captureProfile, deleteProfile, applyProfile } from '../appProfiles';

const newName = ref('');
const captureFrom = ref('direct');
const windows = ref<DesktopWindowInfo[]>([]);
const profileNames = computed(() => Object.keys(appProfiles.profiles).sort());

async function refreshWindows() {
  windows.value = (await window.desktop?.windows()) ?? [];
}
refreshWindows();

async function saveNew() {
  const name = newName.value.trim();
  if (!name) { return; }
  if (await captureProfile(name, captureFrom.value)) { newName.value = ''; }
}

function addRule(cls?: string) {
  const match = cls ? '^' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$' : '';
  appProfiles.rules.push({ match, profile: profileNames.value[0] ?? '', enabled: true });
}
function removeRule(i: number) { appProfiles.rules.splice(i, 1); }
function moveRule(i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= appProfiles.rules.length) { return; }
  const [r] = appProfiles.rules.splice(i, 1);
  appProfiles.rules.splice(j, 0, r);
}
const isGame = (cls: string) => /^steam_app_/.test(cls);
</script>
<template>
  <div class="flex flex-col gap-4">
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-5 gap-3">
        <div class="flex items-center justify-between">
          <h2 class="mb-0">Automatic switching</h2>
          <label class="label cursor-pointer gap-2 py-0">
            <span class="label-text text-sm">{{ appProfiles.enabled ? 'On' : 'Off' }}</span>
            <input type="checkbox" class="toggle toggle-sm toggle-success" v-model="appProfiles.enabled"/>
          </label>
        </div>
        <p class="text-sm opacity-70">When the focused window matches a rule, its saved bindings are written to the mouse's direct profile. The onboard profile is never changed. Closing this window keeps it running in the tray.</p>
        <div class="grid grid-cols-[8rem_auto] gap-y-1 text-sm items-center">
          <span class="opacity-60">Focused window</span>
          <span class="font-mono truncate">{{ appProfiles.focused ? appProfiles.focused.cls : 'unknown' }}<span v-if="appProfiles.focused?.title" class="opacity-50"> — {{ appProfiles.focused.title }}</span></span>
          <span class="opacity-60">Applied profile</span>
          <span class="flex items-center gap-2">
            <span class="badge" :class="appProfiles.current ? 'badge-primary' : 'badge-ghost'">{{ appProfiles.current ?? 'none' }}</span>
            <span v-if="appProfiles.busy" class="loading loading-spinner loading-xs"></span>
            <button class="btn btn-xs btn-ghost" v-if="appProfiles.current" @click="applyProfile(appProfiles.current!, true)">Re-apply</button>
          </span>
          <span class="opacity-60">When nothing matches</span>
          <select class="select select-bordered select-sm w-56" v-model="appProfiles.defaultProfile">
            <option :value="null">leave as is</option>
            <option v-for="n in profileNames" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-5 gap-3">
        <h2 class="mb-0">Saved profiles</h2>
        <p class="text-sm opacity-70">A profile is a snapshot of every button binding plus the DPI stages. Set the mouse up in the Buttons and Basic tabs, then save it here.</p>
        <div class="flex items-center gap-2">
          <input type="text" class="input input-sm input-bordered flex-1" placeholder="Profile name, e.g. Dragonwilds" v-model="newName" @keyup.enter="saveNew"/>
          <span class="text-sm opacity-60">from</span>
          <select class="select select-bordered select-sm w-28 capitalize" v-model="captureFrom">
            <option value="direct">direct</option>
            <option value="white">white</option>
          </select>
          <button class="btn btn-sm btn-primary" :disabled="!newName.trim() || appProfiles.busy" @click="saveNew">Save</button>
        </div>
        <div v-if="!profileNames.length" class="text-sm opacity-50">No profiles saved yet.</div>
        <div v-for="n in profileNames" :key="n" class="flex items-center gap-2 text-sm">
          <span class="badge badge-outline w-44 justify-start truncate">{{ n }}</span>
          <span class="opacity-50 flex-1">{{ Object.keys(appProfiles.profiles[n].buttons).length / 2 }} buttons</span>
          <button class="btn btn-xs" :disabled="appProfiles.busy" @click="applyProfile(n, true)">Apply now</button>
          <button class="btn btn-xs btn-ghost" :disabled="appProfiles.busy" @click="captureProfile(n, captureFrom)">Update from mouse</button>
          <button class="btn btn-xs btn-ghost text-error" @click="deleteProfile(n)">Delete</button>
        </div>
      </div>
    </div>

    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-5 gap-3">
        <div class="flex items-center justify-between">
          <h2 class="mb-0">Rules</h2>
          <div class="flex items-center gap-2">
            <div class="dropdown dropdown-end">
              <button tabindex="0" class="btn btn-xs" @click="refreshWindows">From running window</button>
              <ul tabindex="0" class="dropdown-content menu menu-xs bg-base-200 rounded-box z-10 w-80 p-2 shadow max-h-72 overflow-auto flex-nowrap">
                <li v-for="w in windows" :key="w.cls + w.title"><a @click="addRule(w.cls)">
                  <span class="font-mono truncate">{{ w.cls }}</span>
                  <span v-if="isGame(w.cls)" class="badge badge-xs badge-success">game</span>
                </a></li>
                <li v-if="!windows.length" class="opacity-50 px-2">no windows found</li>
              </ul>
            </div>
            <button class="btn btn-xs btn-ghost" @click="addRule()">Add empty</button>
          </div>
        </div>
        <p class="text-sm opacity-70">Rules are checked top to bottom against the window class. Steam games appear as <span class="font-mono">steam_app_&lt;id&gt;</span>. Matching is a regular expression, case-insensitive.</p>
        <div v-if="!appProfiles.rules.length" class="text-sm opacity-50">No rules yet.</div>
        <div v-for="(r, i) in appProfiles.rules" :key="i" class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="toggle toggle-xs" v-model="r.enabled"/>
          <input type="text" class="input input-sm input-bordered font-mono flex-1" placeholder="^steam_app_1374490$" v-model="r.match"/>
          <span class="opacity-60">use</span>
          <select class="select select-bordered select-sm w-44" v-model="r.profile">
            <option v-for="n in profileNames" :key="n" :value="n">{{ n }}</option>
          </select>
          <button class="btn btn-xs btn-ghost" @click="moveRule(i, -1)" :disabled="i === 0">↑</button>
          <button class="btn btn-xs btn-ghost" @click="moveRule(i, 1)" :disabled="i === appProfiles.rules.length - 1">↓</button>
          <button class="btn btn-xs btn-ghost text-error" @click="removeRule(i)">✕</button>
        </div>
      </div>
    </div>

    <div class="card bg-base-100 shadow-sm" v-if="appProfiles.log.length">
      <div class="card-body p-5 gap-1">
        <h2>Activity</h2>
        <div v-for="(l, i) in appProfiles.log" :key="i" class="font-mono text-xs opacity-70">{{ l }}</div>
      </div>
    </div>
  </div>
</template>
