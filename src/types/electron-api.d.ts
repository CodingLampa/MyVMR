import type { GenerateOptions, GenerateResult, DetectedPaths, LoadedVmr } from '../../shared/types';

declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>;
      selectFile: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>;
      saveFile: () => Promise<string | null>;
      detectPaths: (version: 'fs2020' | 'fs2024') => Promise<DetectedPaths>;
      generate: (options: GenerateOptions) => Promise<GenerateResult>;
      scanCommunity: () => Promise<string[]>;
      loadVmr: (filePath: string) => Promise<LoadedVmr>;
      onLog: (callback: (message: string) => void) => () => void;
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;
    };
  }
}

export {};
