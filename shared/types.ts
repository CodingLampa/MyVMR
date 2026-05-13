export interface DetectedPaths {
  fsltl?: string;
  fsltlVmr?: string;
  aig?: string;
  ivao?: string;
  jft?: string;
}

export interface GenerateOptions {
  fsltlFolder: string;
  aigFolder: string;
  ivaoFolder: string;
  jftFolder: string;
  fsltlVmr: string;
  outputPath: string;
  skipFsltl: boolean;
  preference: 'none' | 'fsltl' | 'aig' | 'ivao' | 'jft';
}

export interface GenerateResult {
  success: boolean;
  error?: string;
}

export interface VmrRule {
  typecode: string;
  callsign: string;
  models: string[];
}

export interface LoadedVmr {
  rules: VmrRule[];
}
