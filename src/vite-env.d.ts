/// <reference types="vite/client" />
declare module 'virtual:vite-plugin-service-worker' {
  export const serviceWorkerFile: string
}

// Provided by electron/preload.cjs when running as the desktop app.
interface DesktopWindowInfo { cls: string; title: string; workspace?: number }
interface DesktopApi {
  onActiveWindow(cb: (win: DesktopWindowInfo) => void): () => void;
  activeWindow(): Promise<DesktopWindowInfo | null>;
  windows(): Promise<DesktopWindowInfo[]>;
  loadStore(): Promise<any>;
  saveStore(data: any): Promise<boolean>;
  quit(): Promise<void>;
}
interface Window { desktop?: DesktopApi }
