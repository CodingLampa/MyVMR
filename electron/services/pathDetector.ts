import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { DetectedPaths } from '../../shared/types';

function getAppData(): string {
  return process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
}

function getLocalAppData(): string {
  return process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
}

function userCfgCandidates(version: 'fs2020' | 'fs2024'): string[] {
  const appData = getAppData();
  const local = getLocalAppData();
  if (version === 'fs2020') {
    return [
      path.join(appData, 'Microsoft Flight Simulator', 'UserCfg.opt'),
      path.join(local, 'Packages', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'UserCfg.opt'),
    ];
  }
  return [
    path.join(appData, 'Microsoft Flight Simulator 2024', 'UserCfg.opt'),
    path.join(local, 'Packages', 'Microsoft.Limitless_8wekyb3d8bbwe', 'LocalCache', 'UserCfg.opt'),
  ];
}

function resolveCommunity(cfgCandidates: string[]): string | null {
  for (const cfgPath of cfgCandidates) {
    try {
      if (!fs.existsSync(cfgPath)) continue;
      const text = fs.readFileSync(cfgPath, 'utf-8');
      const m = text.match(/InstalledPackagesPath\s+"([^"]+)"/i);
      if (!m?.[1]) continue;
      const pkgs = path.normalize(m[1].trim());
      const community = path.join(pkgs, 'Community');
      if (fs.existsSync(community)) return community;
      if (fs.existsSync(pkgs)) return pkgs;
    } catch {
      continue;
    }
  }
  return null;
}

export function detectPaths(version: 'fs2020' | 'fs2024'): DetectedPaths {
  const community = resolveCommunity(userCfgCandidates(version));
  if (!community) return {};

  const result: DetectedPaths = {};
  const candidates: Record<keyof DetectedPaths, string> = {
    fsltl:    path.join(community, 'fsltl-traffic-base'),
    fsltlVmr: path.join(community, 'fsltl-traffic-base', 'FSLTL_Rules.vmr'),
    aig:      path.join(community, 'aig-aitraffic-oci'),
    ivao:     path.join(community, 'IVAO_MTL'),
    jft:      path.join(community, 'justflight-fstraffic-module'),
  };
  for (const [key, p] of Object.entries(candidates) as [keyof DetectedPaths, string][]) {
    if (fs.existsSync(p)) result[key] = p;
  }
  return result;
}
