<script setup lang="ts">
import { computed, ref } from 'vue';

import { RunPython } from '../main';
import { BridgeData, BridgeStatus, makeBridge } from './bridge';
import { hidConsumerCode, hidKeyboardCode } from './hidcode';
import { fromHexString, toHexString } from './hexString';

const props = defineProps<{
  py: RunPython;
  hard?: boolean; // should it interact with hardware or just dummy
  activeProfile: string;
  buttonsLayout?: (string | null)[];
  profileSlots?: number;
  unsupported?: string[];
}>();

const bridgeData = defineModel<BridgeData>('bridgeData', {default: {}});
const bridgeStatus = defineModel<BridgeStatus>('bridgeStatus', {default: {}});

const bridge = makeBridge(bridgeData, bridgeStatus, props);

const defaultButtonsLayout = [
  'aim', 'left', 'middle', 'right',
  'forward', 'wheel_up', 'middle_forward', 'wheel_left',
  'backward', 'wheel_down', 'middle_backward', 'wheel_right',
  'bottom'
];
// Grid cells; null = empty cell. Only real buttons get a bridge.
const buttonsGrid: (string | null)[] = props.buttonsLayout ?? defaultButtonsLayout;
// Pyodide hands Python None over as undefined, so test loosely.
const buttonsLayout: string[] = buttonsGrid.filter((b): b is string => b != null);

const selectedButton = ref(buttonsLayout.includes('left') ? 'left' : buttonsLayout[0]);
const selectedHypershift = ref(false);

const buttonFunctionMap: any = {};
for (let hs of [true, false]) {
  for (let b of buttonsLayout) {
    buttonFunctionMap[b + (hs ? '_hypershift' : '')] = bridge(b + (hs ? '_hypershift' : ''), ['disabled', {}],
`
def f(profile, button, hypershift):
  import struct
  bf = device.get_button_function(
    pt.Button[button.upper()],
    pt.Hypershift.ON if hypershift else pt.Hypershift.OFF,
    %p)
  try:
    ct = bf.get_category()
    if ct == 'mouse':
      m = bf.get_mouse()
      if 'fn' in m:
        m['fn'] = m['fn'].name.lower()
      return ct, m
    elif ct == 'keyboard':
      m = bf.get_keyboard()
      if 'modifier' in m:
        m['modifier'] = [x.name.lower() for x in list(m['modifier'])]
      return ct, m
    elif ct == 'macro':
      m = bf.get_macro()
      if 'mode' in m:
        m['mode'] = m['mode'].name.lower()
      return ct, m
    elif ct == 'system':
      m = bf.get_system()
      if 'fn' in m:
        m['fn'] = [x.name.lower() for x in list(m['fn'])]
      return ct, m
    elif ct == 'dpi_switch':
      m = bf.get_dpi_switch()
      if 'fn' in m:
        m['fn'] = m['fn'].name.lower()
      return ct, m
    elif ct == 'profile_switch':
      m = bf.get_profile_switch()
      if 'fn' in m:
        m['fn'] = m['fn'].name.lower()
      if 'profile' in m:
        m['profile'] = m['profile'].name.lower()
      return ct, m
    else:
      return ct, getattr(bf, 'get_' + ct)()
  except (IndexError, struct.error):
    return 'custom', {'fn_class': bf._fn_class, 'fn_value': list(bf.get_fn_value())}
f(profile, button, hypershift)
`, () => ({button: b, hypershift: hs}),
`
def f(profile, button, hypershift, value):
  from functools import reduce
  ct = value[0]
  m = value[1]
  if ct == 'mouse':
    if 'fn' in m:
      m['fn'] = pt.FnMouse[m['fn'].upper()]
  elif ct == 'keyboard':
    if 'modifier' in m:
      m['modifier'] = reduce((lambda x, y: x | y), [pt.FnKeyboardModifier[x.upper()] for x in list(m['modifier'])], pt.FnKeyboardModifier(0))
  elif ct == 'macro':
    if 'mode' in m:
      m['mode'] = pt.FnClass[m['mode'].upper()]
  elif ct == 'system':
    if 'fn' in m:
      m['fn'] = reduce((lambda x, y: x | y), [pt.FnSystem[x.upper()] for x in list(m['fn'])], pt.FnSystem(0))
  elif ct == 'dpi_switch':
    if 'fn' in m:
      m['fn'] = pt.FnDpiSwitch[m['fn'].upper()]
    if 'dpi' in m:
      m['dpi'] = [int(x) for x in m['dpi']]
  elif ct == 'profile_switch':
    if 'fn' in m:
      m['fn'] = pt.FnProfileSwitch[m['fn'].upper()]
    if 'profile' in m:
      m['profile'] = pt.Profile[m['profile'].upper()]
  bf = pt.ButtonFunction()
  if ct == 'custom':
    fn_class = m['fn_class']
    fn_value = bytes(m['fn_value'])
    bf._fn_class = fn_class
    bf.set_fn_value(fn_value)
  else:
    getattr(bf, 'set_' + ct)(**m)
  device.set_button_function(bf,
    pt.Button[button.upper()],
    pt.Hypershift.ON if hypershift else pt.Hypershift.OFF,
    %p)
f(profile, button, hypershift, value)
`, (value) => {
  return {button: b, hypershift: hs, value: value};
},
    );
  }
}
const functionCategoryList = [
  'disabled', 'mouse', 'keyboard', 'macro', 'dpi_switch', 'profile_switch',
  'system', 'consumer', 'hypershift_toggle', 'scroll_mode_toggle', 'custom',
].filter((c) => !(c === 'macro' && props.unsupported?.includes('macros'))
             && !(c === 'scroll_mode_toggle' && props.unsupported?.includes('scroll_mode')));

const selectedButtonFunction = computed({
  get: () => {
    if (selectedHypershift.value) {
      return buttonFunctionMap[selectedButton.value + '_hypershift'].value;
    }
    return buttonFunctionMap[selectedButton.value].value;
  },
  set: (value) => {
    if (selectedHypershift.value) {
      buttonFunctionMap[selectedButton.value + '_hypershift'].value = value;
    } else {
      buttonFunctionMap[selectedButton.value].value = value;
    }
  }
});

const fnMouse = ['left', 'right', 'middle', 'backward', 'forward', 'wheel_up', 'wheel_down', 'wheel_left', 'wheel_right'];
const fnKeyboardModifier = ['left_control', 'left_shift', 'left_alt', 'left_gui', 'right_control', 'right_shift', 'right_alt', 'right_gui'];
function resetFunctionCategory(newCategory: string) {
  if (selectedButtonFunction.value[0] === newCategory) {
    return;
  }
  if (newCategory === 'disabled') {
    selectedButtonFunction.value = ['disabled', {}];
  } else if (newCategory === 'mouse') {
    selectedButtonFunction.value = ['mouse', {'fn': 'left', 'double_click': false, 'turbo': null}];
  } else if (newCategory === 'keyboard') {
    selectedButtonFunction.value = ['keyboard', {'key': 0x04, 'modifier': [], 'turbo': null}];
  } else if (newCategory === 'macro') {
    selectedButtonFunction.value = ['macro', {'macro_id': 0x0000, mode: 'macro_fixed', times: 1}];
  } else if (newCategory === 'dpi_switch') {
    selectedButtonFunction.value = ['dpi_switch', {'fn': 'next_loop', dpi: [800, 800], stage: 1}];
  } else if (newCategory === 'profile_switch') {
    selectedButtonFunction.value = ['profile_switch', {'fn': 'next_loop'}];
  } else if (newCategory === 'consumer') {
    selectedButtonFunction.value = ['consumer', {'fn': 0xb0}];
  } else if (newCategory === 'system') {
    selectedButtonFunction.value = ['system', {'fn': ['power_down']}];
  } else if (newCategory === 'hypershift_toggle') {
    selectedButtonFunction.value = ['hypershift_toggle', {'fn': 1}];
  } else if (newCategory === 'scroll_mode_toggle') {
    selectedButtonFunction.value = ['scroll_mode_toggle', {'fn': 1}];
  } else if (newCategory === 'custom') {
    selectedButtonFunction.value = ['custom', {'fn_class': 0, 'fn_value': []}];
  }
}

function toggleKeyboardModifier(m: string) {
  if (selectedButtonFunction.value[1].modifier.includes(m)) {
    // included, remove
    const i = selectedButtonFunction.value[1].modifier.indexOf(m)
    selectedButtonFunction.value[1].modifier.splice(i, 1);
  } else {
    selectedButtonFunction.value[1].modifier.push(m);
  }
}

function toggleSystemFn(m: string) {
  if (selectedButtonFunction.value[1].fn.includes(m)) {
    // included, remove
    const i = selectedButtonFunction.value[1].fn.indexOf(m)
    selectedButtonFunction.value[1].fn.splice(i, 1);
  } else {
    selectedButtonFunction.value[1].fn.push(m);
  }
}

function parseIntDefault(s: string, defaultValue: number) {
  const num = parseInt(s);
  return isNaN(num) ? defaultValue : num;
}


// ---- display helpers ----
const categoryLabels: {[key: string]: string} = {
  disabled: 'Disabled', mouse: 'Mouse', keyboard: 'Keyboard', macro: 'Macro', dpi_switch: 'DPI',
  profile_switch: 'Profile', system: 'System', consumer: 'Media', hypershift_toggle: 'Hypershift',
  scroll_mode_toggle: 'Wheel mode', custom: 'Custom',
};
const categoryLabel = (c: string) => categoryLabels[c] ?? c;
const prettyName = (b: string) => b.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()).replace(/\bdpi\b/i, 'DPI');
const onboardProfiles = ['white', 'red', 'green', 'blue', 'cyan'].slice(0, props.profileSlots ?? 5);
function keyLabel(code: number): string {
  const raw = (hidKeyboardCode as {[key: number]: string})[code];
  if (!raw) { return '0x' + code.toString(16); }
  let name = raw.replace(/^Keyboard /, '').replace(/^Keypad /, 'KP ');
  const pair = name.match(/^(\S+) and (\S+)$/);
  if (pair) { name = /^[a-z]$/.test(pair[1]) ? pair[2] : pair[1]; }
  return name;
}
const modShort: {[key: string]: string} = {
  left_control: 'Ctrl', left_shift: 'Shift', left_alt: 'Alt', left_gui: 'Super',
  right_control: 'RCtrl', right_shift: 'RShift', right_alt: 'RAlt', right_gui: 'RSuper',
};
function summary(fn: any): string {
  if (!fn) { return ''; }
  const [cat, m] = fn;
  switch (cat) {
    case 'disabled': return 'off';
    case 'mouse': return prettyName(m.fn ?? '') + (m.double_click ? ' x2' : m.turbo != null ? ' turbo' : '');
    case 'keyboard': return [...(m.modifier ?? []).map((x: string) => modShort[x] ?? x), keyLabel(m.key ?? 0)].join('+') + (m.turbo != null ? ' turbo' : '');
    case 'macro': return 'macro 0x' + (m.macro_id ?? 0).toString(16).padStart(4, '0');
    case 'dpi_switch': return 'DPI ' + (m.fn ?? '').replace(/_/g, ' ');
    case 'profile_switch': return 'profile ' + (m.fn === 'fixed' ? m.profile : (m.fn ?? '').replace(/_/g, ' '));
    case 'system': return (m.fn ?? []).join(', ').replace(/_/g, ' ');
    case 'consumer': return (hidConsumerCode as {[key: number]: string})[m.fn] ?? ('media 0x' + (m.fn ?? 0).toString(16));
    case 'hypershift_toggle': return 'Hypershift';
    case 'scroll_mode_toggle': return 'wheel mode';
    default: return cat;
  }
}
</script>
<template>
  <div class="flex flex-col gap-4">
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-5">
        <div class="flex items-center justify-between">
          <h2 class="mb-0">Buttons</h2>
          <label class="label cursor-pointer gap-2 py-0">
            <span class="label-text text-sm">Hypershift layer</span>
            <input type="checkbox" class="toggle toggle-sm toggle-warning" v-model="selectedHypershift"/>
          </label>
        </div>
        <div class="grid grid-cols-4 gap-2 mt-3">
          <template v-for="(b, i) in buttonsGrid" :key="i">
            <button v-if="b != null"
              class="btn btn-sm h-auto min-h-0 py-2 px-3 flex flex-col items-start gap-0 text-left normal-case"
              :class="selectedButton === b ? (selectedHypershift ? 'btn-warning' : 'btn-primary') : 'btn-ghost bg-base-200'"
              @click="selectedButton = b">
              <span class="text-xs font-semibold leading-tight">{{ prettyName(b) }}</span>
              <span class="text-[11px] font-normal opacity-70 leading-tight truncate w-full">{{ summary(buttonFunctionMap[b + (selectedHypershift ? '_hypershift' : '')].value) }}</span>
            </button>
            <div v-else></div>
          </template>
        </div>
        <p class="text-xs opacity-60 mt-3">Each button has one function normally and another while Hypershift is held. Bind a button to Hypershift to make it the shift key.</p>
      </div>
    </div>

    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-5 gap-4">
        <div class="flex items-center gap-2">
          <h2 class="mb-0">{{ prettyName(selectedButton) }}</h2>
          <span v-if="selectedHypershift" class="badge badge-warning badge-sm">hypershift</span>
        </div>
        <div class="flex flex-wrap gap-1">
          <button class="btn btn-xs normal-case"
            v-for="b in functionCategoryList" :key="b"
            :class="selectedButtonFunction[0] === b ? 'btn-primary' : 'btn-ghost bg-base-200'"
            @click="resetFunctionCategory(b)">{{ categoryLabel(b) }}</button>
        </div>

        <div v-if="selectedButtonFunction[0] == 'disabled'" class="text-sm opacity-60">
          This button does nothing.
        </div>

        <div v-else-if="selectedButtonFunction[0] == 'mouse'" class="flex flex-col gap-3">
          <label class="flex items-center gap-3 text-sm">
            <span class="w-28">Click</span>
            <select class="select select-bordered select-sm w-48 capitalize" v-model="selectedButtonFunction[1].fn">
              <option v-for="fn in fnMouse" :value="fn">{{ prettyName(fn) }}</option>
            </select>
          </label>
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" class="radio radio-sm"
                :checked="selectedButtonFunction[1].turbo == null && !selectedButtonFunction[1].double_click"
                @change="selectedButtonFunction[1].turbo = null; selectedButtonFunction[1].double_click = false;" />
              <span>Single click</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" class="radio radio-sm"
                :checked="selectedButtonFunction[1].double_click"
                @change="selectedButtonFunction[1].turbo = null; selectedButtonFunction[1].double_click = true;" />
              <span>Double click</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" class="radio radio-sm"
                :checked="selectedButtonFunction[1].turbo != null"
                @change="selectedButtonFunction[1].turbo = 200; selectedButtonFunction[1].double_click = false;" />
              <span>Turbo</span>
            </label>
            <span class="flex items-center gap-2">
              every
              <input type="number" min="1" max="65535" class="input input-sm input-bordered w-20"
                :disabled="selectedButtonFunction[1].turbo == null"
                :value="selectedButtonFunction[1].turbo ?? 0"
                @change="(event) => {selectedButtonFunction[1].turbo = parseIntDefault((event.target as HTMLInputElement).value, 200)}"/>
              ms
              <span class="opacity-60">({{ isFinite(1000 / selectedButtonFunction[1].turbo) ? (1000 / selectedButtonFunction[1].turbo).toFixed(1) : '-' }}/s)</span>
            </span>
          </div>
        </div>

        <div v-else-if="selectedButtonFunction[0] == 'keyboard'" class="flex flex-col gap-3">
          <label class="flex items-center gap-3 text-sm">
            <span class="w-28">Key</span>
            <select class="select select-bordered select-sm w-64" v-model="selectedButtonFunction[1].key">
              <option v-for="[code, name] in Object.entries(hidKeyboardCode)" :value="parseInt(code)">{{ keyLabel(parseInt(code)) }} <span class="opacity-50">({{ name }})</span></option>
            </select>
            <span class="opacity-60">code</span>
            <input type="number" min="0" max="255" class="input input-sm input-bordered w-20"
              :value="selectedButtonFunction[1].key ?? 0"
              @change="(event) => {selectedButtonFunction[1].key = parseIntDefault((event.target as HTMLInputElement).value, 0x04)}"/>
          </label>
          <div class="flex items-start gap-3 text-sm">
            <span class="w-28 pt-1">Modifiers</span>
            <div class="grid grid-cols-4 gap-x-4 gap-y-1">
              <label class="flex items-center gap-2 cursor-pointer" v-for="m in fnKeyboardModifier" :key="m">
                <input type="checkbox" class="checkbox checkbox-sm"
                  :checked="selectedButtonFunction[1].modifier.includes(m)"
                  @change="toggleKeyboardModifier(m)" />
                <span>{{ modShort[m] }}</span>
              </label>
            </div>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <span class="w-28">Repeat</span>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" class="checkbox checkbox-sm"
                :checked="selectedButtonFunction[1].turbo != null"
                @change="(event) => selectedButtonFunction[1].turbo = (event.target as HTMLInputElement).checked ? 200 : null" />
              <span>Turbo while held</span>
            </label>
            <span class="flex items-center gap-2">
              every
              <input type="number" min="1" max="65535" class="input input-sm input-bordered w-20"
                :disabled="selectedButtonFunction[1].turbo == null"
                :value="selectedButtonFunction[1].turbo ?? 0"
                @change="(event) => {selectedButtonFunction[1].turbo = parseIntDefault((event.target as HTMLInputElement).value, 200)}"/>
              ms
            </span>
          </div>
        </div>

        <div v-else-if="selectedButtonFunction[0] == 'macro'" class="flex flex-col gap-3 text-sm">
          <p class="opacity-70">The macro must exist first. Create and edit macros in the Macros tab.</p>
          <label class="flex items-center gap-3">
            <span class="w-28">Macro ID</span>
            <input class="input input-sm input-bordered w-32 font-mono"
              :value="'0x' + (selectedButtonFunction[1].macro_id ?? 0).toString(16).padStart(4, '0')"
              @change="(event) => selectedButtonFunction[1].macro_id = parseIntDefault((event.target as HTMLInputElement).value, 0)"/>
          </label>
          <div class="flex items-start gap-3">
            <span class="w-28 pt-1">Mode</span>
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" class="radio radio-sm" :checked="selectedButtonFunction[1].mode === 'macro_fixed'" @change="selectedButtonFunction[1].mode = 'macro_fixed'" />
                <span>Play</span>
                <input class="input input-sm input-bordered w-16" :value="selectedButtonFunction[1].times.toString()" @change="(event) => selectedButtonFunction[1].times = parseIntDefault((event.target as HTMLInputElement).value, 1)"/>
                <span>times</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" class="radio radio-sm" :checked="selectedButtonFunction[1].mode === 'macro_hold'" @change="selectedButtonFunction[1].mode = 'macro_hold'" />
                <span>Repeat while held</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" class="radio radio-sm" :checked="selectedButtonFunction[1].mode === 'macro_toggle'" @change="selectedButtonFunction[1].mode = 'macro_toggle'" />
                <span>Toggle on and off</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" class="radio radio-sm" :checked="selectedButtonFunction[1].mode === 'macro_sequence'" @change="selectedButtonFunction[1].mode = 'macro_sequence'" />
                <span>Sequence</span>
              </label>
            </div>
          </div>
        </div>

        <div v-else-if="selectedButtonFunction[0] == 'dpi_switch'" class="flex flex-col gap-2 text-sm">
          <label class="flex items-center gap-2 cursor-pointer" v-for="[v, l] in [['next', 'Next stage'], ['prev', 'Previous stage'], ['next_loop', 'Next stage, looping'], ['prev_loop', 'Previous stage, looping']]" :key="v">
            <input type="radio" class="radio radio-sm" :checked="selectedButtonFunction[1].fn === v" @change="selectedButtonFunction[1].fn = v" />
            <span>{{ l }}</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" class="radio radio-sm" :checked="selectedButtonFunction[1].fn === 'fixed'"
              @change="selectedButtonFunction[1].fn = 'fixed'; selectedButtonFunction[1].stage = selectedButtonFunction[1].stage ?? 1" />
            <span>Jump to stage</span>
            <input type="number" min="1" max="5" step="1" class="input input-sm input-bordered w-16"
              :disabled="selectedButtonFunction[1].fn !== 'fixed'"
              :value="(selectedButtonFunction[1].stage ?? 1).toString()"
              @change="(event) => selectedButtonFunction[1].stage = parseIntDefault((event.target as HTMLInputElement).value, 1)"/>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" class="radio radio-sm" :checked="selectedButtonFunction[1].fn === 'aim'"
              @change="selectedButtonFunction[1].fn = 'aim'; selectedButtonFunction[1].dpi = selectedButtonFunction[1].dpi ?? [800, 800]" />
            <span>Hold for DPI</span>
            <span>X</span>
            <input type="number" min="100" max="25600" step="100" class="input input-sm input-bordered w-24"
              :disabled="selectedButtonFunction[1].fn !== 'aim'"
              :value="(selectedButtonFunction[1].dpi?.[0] ?? 800).toString()"
              @change="(event) => selectedButtonFunction[1].dpi[0] = parseIntDefault((event.target as HTMLInputElement).value, 800)"/>
            <span>Y</span>
            <input type="number" min="100" max="25600" step="100" class="input input-sm input-bordered w-24"
              :disabled="selectedButtonFunction[1].fn !== 'aim'"
              :value="(selectedButtonFunction[1].dpi?.[1] ?? 800).toString()"
              @change="(event) => selectedButtonFunction[1].dpi[1] = parseIntDefault((event.target as HTMLInputElement).value, 800)"/>
          </label>
        </div>

        <div v-else-if="selectedButtonFunction[0] == 'profile_switch'" class="flex flex-col gap-2 text-sm">
          <label class="flex items-center gap-2 cursor-pointer" v-for="[v, l] in [['next', 'Next profile'], ['prev', 'Previous profile'], ['next_loop', 'Next profile, looping'], ['prev_loop', 'Previous profile, looping']]" :key="v">
            <input type="radio" class="radio radio-sm" :checked="selectedButtonFunction[1].fn === v" @change="selectedButtonFunction[1].fn = v" />
            <span>{{ l }}</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" class="radio radio-sm" :checked="selectedButtonFunction[1].fn === 'fixed'"
              @change="selectedButtonFunction[1].fn = 'fixed'; selectedButtonFunction[1].profile = selectedButtonFunction[1].profile ?? 'white'" />
            <span>Switch to</span>
            <select class="select select-bordered select-sm w-32 capitalize"
              :disabled="selectedButtonFunction[1].fn !== 'fixed'"
              v-model="selectedButtonFunction[1].profile">
              <option v-for="profile in onboardProfiles" :value="profile">{{ profile }}</option>
            </select>
          </label>
        </div>

        <div v-else-if="selectedButtonFunction[0] == 'system'" class="flex flex-wrap gap-4 text-sm">
          <label class="flex items-center gap-2 cursor-pointer" v-for="m in ['power_down', 'sleep', 'wake_up']" :key="m">
            <input type="checkbox" class="checkbox checkbox-sm" :checked="selectedButtonFunction[1].fn.includes(m)" @change="toggleSystemFn(m)" />
            <span>{{ prettyName(m) }}</span>
          </label>
        </div>

        <div v-else-if="selectedButtonFunction[0] == 'consumer'" class="flex items-center gap-3 text-sm">
          <span class="w-28">Media key</span>
          <select class="select select-bordered select-sm w-64" v-model="selectedButtonFunction[1].fn">
            <option v-for="[code, name] in Object.entries(hidConsumerCode)" :value="parseInt(code)">{{ name }}</option>
          </select>
          <span class="opacity-60">code</span>
          <input type="number" min="0" max="65535" class="input input-sm input-bordered w-24"
            :value="selectedButtonFunction[1].fn ?? 0"
            @change="(event) => {selectedButtonFunction[1].fn = parseIntDefault((event.target as HTMLInputElement).value, 0xb0)}"/>
        </div>

        <div v-else-if="selectedButtonFunction[0] == 'hypershift_toggle'" class="text-sm opacity-70">
          Holding this button enables the Hypershift layer.
        </div>
        <div v-else-if="selectedButtonFunction[0] == 'scroll_mode_toggle'" class="text-sm opacity-70">
          Pressing this button switches the wheel between tactile and freespin.
        </div>

        <div v-else-if="selectedButtonFunction[0] == 'custom'" class="flex flex-col gap-2 text-sm">
          <p class="opacity-70">Raw function bytes. Rarely useful.</p>
          <label class="flex items-center gap-3">
            <span class="w-28">Class</span>
            <input type="number" min="0" max="255" class="input input-sm input-bordered w-24"
              :value="selectedButtonFunction[1].fn_class ?? 0"
              @change="(event) => {selectedButtonFunction[1].fn_class = parseIntDefault((event.target as HTMLInputElement).value, 0)}"/>
          </label>
          <label class="flex items-center gap-3">
            <span class="w-28">Value</span>
            <input type="text" class="input input-sm input-bordered font-mono w-64"
              :value="toHexString(selectedButtonFunction[1].fn_value)"
              @change="(event) => {selectedButtonFunction[1].fn_value = fromHexString((event.target as HTMLInputElement).value)}"/>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
