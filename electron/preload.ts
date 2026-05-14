import { contextBridge, ipcRenderer } from 'electron';
import type { GenerateOptions, GenerateResult, DetectedPaths, LoadedVmr } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('vmr:select-folder'),

  selectFile: (filters: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('vmr:select-file', filters),

  saveFile: (): Promise<string | null> =>
    ipcRenderer.invoke('vmr:save-file'),

  detectPaths: (version: 'fs2020' | 'fs2024'): Promise<DetectedPaths> =>
    ipcRenderer.invoke('vmr:detect-paths', version),

  generate: (options: GenerateOptions): Promise<GenerateResult> =>
    ipcRenderer.invoke('vmr:generate', options),

  scanCommunity: (version: 'fs2020' | 'fs2024'): Promise<string[]> =>
    ipcRenderer.invoke('vmr:scan-community', version),

  loadVmr: (filePath: string): Promise<LoadedVmr> =>
    ipcRenderer.invoke('vmr:load-vmr', filePath),

  onLog: (callback: (message: string) => void) => {
    ipcRenderer.on('vmr:log', (_event, message: string) => callback(message));
    return () => ipcRenderer.removeAllListeners('vmr:log');
  },

  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  saveVmr: (filePath: string, rules: { typecode: string; callsign: string; model: string }[]) =>
    ipcRenderer.invoke('vmr:save-vmr', filePath, rules),
});
