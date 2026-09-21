// Per-app profiles: saved snapshots of the mouse's bindings, and rules that pick
// one whenever the focused window changes. Only available in the desktop app,
// which forwards Hyprland's activewindow events through window.desktop.
//
// Everything is written to the DIRECT profile (immediate, RAM only), so the
// onboard profile the mouse boots with is never touched.
import { reactive, watch } from 'vue';
import type { RunPython } from './main';

export type Snapshot = {
  buttons: { [key: string]: string }; // 'BUTTON|HYPERSHIFT' -> 7 hex bytes
  dpi: { stages: number[][]; active: number } | null;
};
export type Rule = { match: string; profile: string; enabled: boolean };

export const appProfiles = reactive({
  available: false,
  ready: false,
  enabled: true,
  profiles: {} as { [name: string]: Snapshot },
  rules: [] as Rule[],
  defaultProfile: null as string | null,
  current: null as string | null,
  focused: null as DesktopWindowInfo | null,
  busy: false,
  log: [] as string[],
});

const OWN_CLASS = 'razer-onboard-config';
let py: RunPython | null = null;
let applied: Snapshot | null = null;
let pendingTarget: string | null | undefined = undefined;
let verifyTimer: number | null = null;

function note(msg: string) {
  appProfiles.log.unshift(new Date().toTimeString().slice(0, 8) + '  ' + msg);
  appProfiles.log.splice(30);
}

export function hasDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.desktop;
}

const SNAPSHOT_PY = `
def _snap(profile):
    out = {'buttons': {}, 'dpi': None}
    for hs in pt.Hypershift:
        for b in device.buttons():
            out['buttons'][b.name + '|' + hs.name] = bytes(device.get_button_function(b, hs, profile=profile)).hex()
    stages, active = device.get_dpi_stages(profile=profile)
    out['dpi'] = {'stages': [list(s) for s in stages], 'active': active}
    return out
_snap(pt.Profile[profile])
`;

const APPLY_PY = `
def _apply(entries, dpi):
    for key, h in entries.items():
        bname, hname = key.split('|')
        device.set_button_function(pt.ButtonFunction.from_buffer_copy(bytes.fromhex(h)),
                                   pt.Button[bname], pt.Hypershift[hname], profile=pt.Profile.DIRECT)
    if dpi:
        device.set_dpi_stages([tuple(s) for s in dpi['stages']], dpi['active'], profile=pt.Profile.DIRECT)
    return len(entries)
_apply(entries, dpi)
`;

const VERIFY_PY = `
def _verify(key):
    bname, hname = key.split('|')
    return bytes(device.get_button_function(pt.Button[bname], pt.Hypershift[hname], profile=pt.Profile.DIRECT)).hex()
_verify(key)
`;

export async function captureProfile(name: string, fromProfile = 'direct'): Promise<boolean> {
  if (!py || appProfiles.busy) { return false; }
  appProfiles.busy = true;
  try {
    const snap: Snapshot = await py(SNAPSHOT_PY, { locals: { profile: fromProfile.toUpperCase() } });
    appProfiles.profiles[name] = JSON.parse(JSON.stringify(snap));
    note(`saved "${name}" from ${fromProfile}`);
    return true;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    note(`could not read the mouse for "${name}": ` + (/TIMEOUT/.test(msg) ? 'no answer from the mouse (asleep? move it and retry)' : msg.split('\n').filter((l) => l.trim()).slice(-1)[0]));
    return false;
  } finally {
    appProfiles.busy = false;
  }
}

export function deleteProfile(name: string) {
  delete appProfiles.profiles[name];
  appProfiles.rules = appProfiles.rules.filter((r) => r.profile !== name);
  if (appProfiles.defaultProfile === name) { appProfiles.defaultProfile = null; }
  if (appProfiles.current === name) { appProfiles.current = null; applied = null; }
}

export async function applyProfile(name: string, force = false): Promise<void> {
  if (!py) { return; }
  const snap = appProfiles.profiles[name];
  if (!snap) { return; }
  if (appProfiles.busy) { pendingTarget = name; return; }
  appProfiles.busy = true;
  try {
    // Only write what differs from what we last wrote; a full write is ~40 reports.
    const entries: { [key: string]: string } = {};
    for (const [k, v] of Object.entries(snap.buttons)) {
      if (force || !applied || applied.buttons[k] !== v) { entries[k] = v; }
    }
    const dpiChanged = force || !applied || JSON.stringify(applied.dpi) !== JSON.stringify(snap.dpi);
    const n = await py(APPLY_PY, { locals: JSON.parse(JSON.stringify({ entries, dpi: dpiChanged ? snap.dpi : null })) });
    applied = JSON.parse(JSON.stringify(snap));
    appProfiles.current = name;
    note(`applied "${name}" (${n} button${n === 1 ? '' : 's'}${dpiChanged ? ', DPI' : ''})`);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    note(`failed to apply "${name}": ` + (/TIMEOUT/.test(msg) ? 'no answer from the mouse (asleep?)' : msg.split('\n').filter((l) => l.trim()).slice(-1)[0]));
    applied = null; // unknown state now; next apply writes everything
  } finally {
    appProfiles.busy = false;
    if (pendingTarget !== undefined) {
      const next = pendingTarget; pendingTarget = undefined;
      if (next && next !== appProfiles.current) { applyProfile(next); }
    }
  }
}

function targetFor(win: DesktopWindowInfo | null): string | null {
  if (!win) { return appProfiles.defaultProfile; }
  for (const r of appProfiles.rules) {
    if (!r.enabled || !r.match) { continue; }
    try {
      if (new RegExp(r.match, 'i').test(win.cls) && appProfiles.profiles[r.profile]) { return r.profile; }
    } catch { /* bad regex: ignore the rule */ }
  }
  return appProfiles.defaultProfile;
}

async function onFocus(win: DesktopWindowInfo) {
  appProfiles.focused = win;
  if (!appProfiles.enabled || win.cls === OWN_CLASS) { return; }
  const target = targetFor(win);
  if (target && target !== appProfiles.current) {
    note(`${win.cls} focused, switching to "${target}"`);
    await applyProfile(target);
  }
}

// The direct profile is RAM only and resets when the mouse sleeps. Every 30 s
// read one binding back; if it no longer matches, write the profile again.
async function verifyApplied() {
  if (!py || !applied || !appProfiles.current || appProfiles.busy) { return; }
  const key = Object.keys(applied.buttons)[0];
  if (!key) { return; }
  try {
    const now = await py(VERIFY_PY, { locals: { key } });
    if (now !== applied.buttons[key]) {
      note('mouse lost the direct profile (sleep?), re-applying');
      await applyProfile(appProfiles.current, true);
    }
  } catch { /* transient */ }
}

export async function startAppProfiles(runPython: RunPython) {
  if (!hasDesktop() || appProfiles.ready) { return; }
  py = runPython;
  appProfiles.available = true;
  const saved = await window.desktop!.loadStore();
  if (saved) {
    appProfiles.enabled = saved.enabled ?? true;
    appProfiles.profiles = saved.profiles ?? {};
    appProfiles.rules = saved.rules ?? [];
    appProfiles.defaultProfile = saved.defaultProfile ?? null;
  }
  appProfiles.ready = true;
  let saveTimer: number | null = null;
  watch(() => [appProfiles.enabled, appProfiles.profiles, appProfiles.rules, appProfiles.defaultProfile],
    () => {
      if (saveTimer) { clearTimeout(saveTimer); }
      saveTimer = window.setTimeout(() => {
        window.desktop!.saveStore(JSON.parse(JSON.stringify({
          enabled: appProfiles.enabled,
          profiles: appProfiles.profiles,
          rules: appProfiles.rules,
          defaultProfile: appProfiles.defaultProfile,
        })));
      }, 300);
    }, { deep: true });
  window.desktop!.onActiveWindow(onFocus);
  const active = await window.desktop!.activeWindow();
  if (active) { onFocus(active); }
  verifyTimer = window.setInterval(verifyApplied, 30000);
}

export function stopAppProfiles() {
  if (verifyTimer) { clearInterval(verifyTimer); verifyTimer = null; }
}
