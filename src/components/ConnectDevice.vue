<script setup lang="ts">
import { ref, inject, computed } from 'vue';
import type { Ref } from 'vue';
import PythonRunner from './PythonRunner.vue';
const emit = defineEmits(['deviceCreated', 'deviceNotCreated']);
const runPython = inject<Ref<Function | null>>('runPython');

const customPath = ref(null);
const connectError = ref<string | null>(null);
const isElectron = /Electron/.test(navigator.userAgent);
const busy = ref(false);

async function requestDevice(){
  if (!runPython?.value) {
    return;
  }
  connectError.value = null;
  busy.value = true;
  try {
  await runPython.value(`
    import hid
    hid.set_await_js(await_js)
    import qdrazer.protocol as pt
    # Import all device classes; the connect loop below tries each in turn
    from basilisk_v3.device import BasiliskV3ProDevice, BasiliskV3Device
    from naga_v2.device import NagaV2HyperSpeedDevice
    if 'original_sr_with' not in globals():
        globals()['original_sr_with'] = BasiliskV3Device.sr_with
        def sr_with(self, *args, **kwargs):
            print(f's: {hex(args[0])} {args[1:]}, {kwargs}')
            r = original_sr_with(self, *args, **kwargs)
            print(f'r: {r}')
            return r
        BasiliskV3Device.sr_with = sr_with

    # Try connecting with the new PID (0x00AB) first, then fall back to old PID (0x0099)
    hid.webhid_request_device()
    device = None
    for DeviceClass in [NagaV2HyperSpeedDevice, BasiliskV3ProDevice, BasiliskV3Device]:
        try:
            device = DeviceClass()
            device.connect(path=custom_path)
            print('Connected with device:', DeviceClass.__name__)
            break
        except Exception as e:
            print(f'Failed to connect with {DeviceClass.__name__}: {e}')
            continue
    else:
        raise RuntimeError('Could not connect to any device')

    print('Connected:', getattr(device, 'model_name', type(device).__name__))
  `, {add: {custom_path: customPath.value}});
  emit('deviceCreated');
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/NotAllowedError|Failed to open/.test(msg)) {
      connectError.value = 'The mouse was found but could not be opened. On Linux this usually means your user has no access to its hidraw device; add a udev rule granting access, then try again.';
    } else if (/Could not connect to any device|No device/.test(msg)) {
      connectError.value = 'No supported mouse was selected.';
    } else {
      connectError.value = msg.split('\n').filter((l) => l.trim()).slice(-1)[0] ?? msg;
    }
    console.error('connect failed: ' + msg);
  } finally {
    busy.value = false;
  }
}
async function noHardwareMode(){
  if (!runPython?.value) {
    return;
  }
  await runPython.value(`
    import hid
    hid.set_await_js(await_js)
    import qdrazer.protocol as pt
    print('no hardware mode')
  `);
  emit('deviceNotCreated');
}

function hasHid(){
  return Boolean(navigator.hid);
}

const customVid = ref(0);
const customPid = ref(0);

async function setCustomVidPid() {
  await runPython.value(`
    from basilisk_v3.device import BasiliskV3Device, BasiliskV3ProDevice
    BasiliskV3Device.vid = int(vid)
    BasiliskV3Device.pid = int(pid)
    BasiliskV3ProDevice.vid = int(vid)
    BasiliskV3ProDevice.pid = int(pid)
  `, {locals: {vid: customVid.value, pid: customPid.value}});
}

const isPythonReady = computed(() => {
  return Boolean(runPython?.value);
});

</script>
<template>
  <div class="flex-1 flex items-center justify-center p-6">
    <div class="card bg-base-100 shadow-xl w-full max-w-lg">
      <div class="card-body gap-5">
        <div class="flex items-center gap-4">
          <img src="/snakemouse.svg" class="h-12 w-12" alt="" />
          <div>
            <h1>Connect your mouse</h1>
            <p class="text-sm opacity-70">Settings are read from, and written to, the mouse's own memory.</p>
          </div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-wider opacity-60 mb-2">Supported</div>
          <div class="flex flex-wrap gap-2">
            <span class="badge badge-outline">Basilisk V3</span>
            <span class="badge badge-outline">Basilisk V3 Pro</span>
            <span class="badge badge-outline">Naga V2 HyperSpeed</span>
          </div>
        </div>
        <div v-if="!hasHid()" role="alert" class="alert alert-error text-sm">
          <span>This browser has no WebHID. Use Chrome, Edge, or the desktop app.</span>
        </div>
        <p v-else-if="!isElectron" class="text-sm opacity-70">In the device picker, choose the entry listed as a mouse, not the keyboard one.</p>
        <div v-if="connectError" role="alert" class="alert alert-error text-sm">
          <span>{{ connectError }}</span>
        </div>
        <div class="flex flex-col gap-2">
          <button class="btn btn-primary w-full" :disabled="!isPythonReady || busy" @click="requestDevice">
            <span v-if="!isPythonReady || busy" class="loading loading-spinner loading-sm"></span>
            {{ !isPythonReady ? 'Loading runtime' : busy ? 'Connecting' : 'Connect to mouse' }}
          </button>
          <button class="btn btn-ghost btn-sm w-full" :disabled="!isPythonReady" @click="noHardwareMode">Try without a mouse</button>
        </div>
        <details class="collapse collapse-arrow bg-base-200 text-sm">
          <summary class="collapse-title min-h-0 py-2 text-xs opacity-60">Advanced</summary>
          <div class="collapse-content flex flex-col gap-3">
            <div class="text-xs opacity-70">Only change these if you know what you are doing. Wrong values can damage a mouse.</div>
            <div class="flex items-center gap-2">
              <span class="w-24">VID</span>
              <input type="text" class="input input-bordered input-sm w-32" @change="(event) => customVid = parseInt((event.target as HTMLInputElement).value) ?? 0"/>
              <span class="w-8 text-right">PID</span>
              <input type="text" class="input input-bordered input-sm w-32" @change="(event) => customPid = parseInt((event.target as HTMLInputElement).value) ?? 0"/>
              <button class="btn btn-sm btn-error" @click="setCustomVidPid">Set</button>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-24">Custom path</span>
              <input type="text" class="input input-bordered input-sm flex-1" @change="(event) => customPath = JSON.parse((event.target as HTMLInputElement).value)"/>
            </div>
            <PythonRunner :py="runPython ?? (() => null)" />
          </div>
        </details>
      </div>
    </div>
  </div>
</template>
