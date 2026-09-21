<script setup lang="ts">
import { computed, ref } from 'vue';

import { RunPython } from '../main';
import { BridgeData, BridgeStatus, makeBridge } from './bridge';

const props = defineProps<{
  py: RunPython;
  hard?: boolean; // should it interact with hardware or just dummy
  activeProfile: string;
  unsupported?: string[]; // settings the connected model rejects (see Device.unsupported)
}>();
const has = (feature: string) => !(props.unsupported ?? []).includes(feature);

const bridgeData = defineModel<BridgeData>('bridgeData', {default: {}});
const bridgeStatus = defineModel<BridgeStatus>('bridgeStatus', {default: {}});

const bridge = makeBridge(bridgeData, bridgeStatus, props);

const scrollMode = has('scroll_mode') ? bridge<string>('scrollMode', 'tactile',
  'device.get_scroll_mode(%p).name.lower()', () => ({}),
  'device.set_scroll_mode(pt.ScrollMode[x.upper()], %p)', (value) => ({x: value}),
) : ref('tactile');
const scrollModeToggle = computed({
  get: () => scrollMode.value === 'freespin',
  set: (value) => scrollMode.value = value ? 'freespin' : 'tactile'
});

const scrollAcceleration = has('scroll_acceleration') ? bridge<Boolean>('scrollAcceleration', false,
  'device.get_scroll_acceleration(%p)', () => ({}),
  'device.set_scroll_acceleration(x, %p)', (value) => ({x: value}),
) : ref(false);

const scrollSmartReel = has('scroll_smart_reel') ? bridge<Boolean>('scrollSmartReel', false,
  'device.get_scroll_smart_reel(%p)', () => ({}),
  'device.set_scroll_smart_reel(x, %p)', (value) => ({x: value}),
) : ref(false);

const pollingRate = bridge<number>('pollingRate', 1,
  'device.get_polling_rate(%p)', () => ({}),
  'device.set_polling_rate(x, %p)', (value) => ({x: value}),
);
const pollingRateInput = computed({
  get: () => pollingRate.value?.toString(),
  set: (value) => {pollingRate.value = parseInt(value ?? '1')},
});
const pollingRateRange = computed({
  get: () => ({1:4, 2:3, 4:2, 8:1}[pollingRate.value ?? 0] ?? 0),
  set: (value) => {pollingRate.value = {4:1, 3:2, 2:4, 1:8, 0:16}[value] ?? 1},
});

const dpiXy = bridge<[number, number]>('dpiXy', [800, 800],
  'device.get_dpi_xy(%p)', () => ({}),
  'device.set_dpi_xy((x, y), %p)', (value) => ({x: value[0], y: value[1]}),
);

const dpiStages = bridge<[[number, number][], number]>('dpiStages', [[[800, 800]], 1],
  'device.get_dpi_stages(%p)', () => ({}),
  'device.set_dpi_stages(ds, acs, %p)', (value) => ({ds: JSON.parse(JSON.stringify(value[0])), acs: value[1]}),
);

const dpiStageCount = computed({
  get: () => dpiStages.value?.[0].length ?? 0,
  set: (value) => {
    if (!dpiStages.value) { dpiStages.value = [Array.from({length: value}, () => [800, 800]), 1] }
    dpiStages.value[0] = dpiStages.value[0].slice(0, value);
    dpiStages.value[0] = dpiStages.value[0].concat(Array.from({length: value - dpiStages.value[0].length}, () => [800, 800]));
  }
});

function dpiCopyXY() {
  for (let it of dpiStages.value[0]) {
    it[1] = it[0];
  }
}

</script>
<template>
  <div class="flex flex-col gap-4">
    <div class="card bg-base-100 shadow-sm" v-if="has('scroll_mode') || has('scroll_acceleration') || has('scroll_smart_reel')">
      <div class="card-body p-5">
        <h2>Scroll wheel</h2>
        <div class="grid grid-cols-[10rem_auto] items-center gap-y-2">
          <template v-if="has('scroll_mode')">
            <span class="text-sm">Wheel mode</span>
            <label class="label cursor-pointer justify-start gap-3 py-0">
              <span class="label-text">Tactile</span>
              <input type="checkbox" class="toggle toggle-sm" v-model="scrollModeToggle"/>
              <span class="label-text">Freespin</span>
            </label>
          </template>
          <template v-if="has('scroll_acceleration')">
            <span class="text-sm">Acceleration</span>
            <label class="label cursor-pointer justify-start py-0">
              <input type="checkbox" class="toggle toggle-sm" v-model="scrollAcceleration"/>
            </label>
          </template>
          <template v-if="has('scroll_smart_reel')">
            <span class="text-sm">Smart Reel</span>
            <label class="label cursor-pointer justify-start py-0">
              <input type="checkbox" class="toggle toggle-sm" v-model="scrollSmartReel"/>
            </label>
          </template>
        </div>
      </div>
    </div>

    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-5">
        <h2>Polling rate</h2>
        <div class="flex items-center gap-4">
          <div class="text-sm whitespace-nowrap">Report every <input type="number" min="1" max="255" class="input input-sm input-bordered w-16 mx-1" v-model.lazy="pollingRateInput"/> ms</div>
          <div class="flex-1">
            <input type="range" min="0" max="4" value="0" class="range range-sm" step="1" v-model.lazy="pollingRateRange" />
            <div class="input-label">
              <span>63</span><span>125</span><span>250</span><span>500</span><span>1000</span>
            </div>
          </div>
          <span class="w-16 text-right font-mono text-sm">{{ (1000 / (pollingRate ?? 1)).toFixed(0) }} Hz</span>
        </div>
      </div>
    </div>

    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-5">
        <h2>DPI</h2>
        <div class="grid grid-rows-2 grid-flow-col place-items-baseline justify-start gap-x-1">
          <span class="mr-2 text-sm">X</span>
          <span class="mr-2 text-sm">Y</span>
          <template v-for="(xy, index) in dpiStages[0]" :key="index">
            <input type="number" min="100" max="25600" step="100" class="input input-sm input-bordered min-w-20" :class="{'input-primary': index + 1 == dpiStages[1]}" v-model.lazy="xy[0]"/>
            <input type="number" min="100" max="25600" step="100" class="input input-sm input-bordered min-w-20" :class="{'input-primary': index + 1 == dpiStages[1]}" v-model.lazy="xy[1]"/>
          </template>
          <span></span>
          <span><button class="btn btn-sm btn-ghost" @click="dpiCopyXY">Y = X</button></span>
        </div>
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-2 items-baseline text-sm">
          <label class="flex items-center gap-2">Stages <input type="number" min="1" max="5" step="1" class="input input-sm input-bordered w-16" v-model.lazy="dpiStageCount"/></label>
          <label class="flex items-center gap-2">Active <input type="number" min="1" max="5" step="1" class="input input-sm input-bordered w-16" v-model.lazy="dpiStages[1]"/></label>
          <label class="flex items-center gap-2">Current X <input type="number" min="100" max="25600" step="100" class="input input-sm input-bordered w-24" v-model.lazy.number="dpiXy[0]"/></label>
          <label class="flex items-center gap-2">Y <input type="number" min="100" max="25600" step="100" class="input input-sm input-bordered w-24" v-model.lazy.number="dpiXy[1]"/></label>
        </div>
      </div>
    </div>
  </div>
</template>
<style lang="scss" scoped>
.input-label {
  @apply flex w-full justify-between text-xs;
  span {
    @apply w-6 inline-flex justify-center;
  }
}
</style>