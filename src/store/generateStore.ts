import { create } from 'zustand';

interface GenerateState {
  fsltlFolder: string;
  fsltlVmr: string;
  aigFolder: string;
  ivaoFolder: string;
  jftFolder: string;
  outputPath: string;
  skipFsltl: boolean;
  preference: 'none' | 'fsltl' | 'aig' | 'ivao' | 'jft';
  logLines: string[];
  generating: boolean;
  set: (patch: Partial<Omit<GenerateState, 'set' | 'appendLog' | 'clearLog'>>) => void;
  appendLog: (line: string) => void;
  clearLog: () => void;
}

export const useGenerateStore = create<GenerateState>((set) => ({
  fsltlFolder: '',
  fsltlVmr: '',
  aigFolder: '',
  ivaoFolder: '',
  jftFolder: '',
  outputPath: '',
  skipFsltl: false,
  preference: 'none',
  logLines: [],
  generating: false,
  set: (patch) => set(patch),
  appendLog: (line) => set((s) => ({ logLines: [...s.logLines, line] })),
  clearLog: () => set({ logLines: [] }),
}));
