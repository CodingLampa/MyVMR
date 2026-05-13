import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Livery {
  title: string;
  icaoType: string | null;
  callsign: string | null;
}

export function parseCfgValue(raw: string): string {
  raw = raw.trim();
  if (raw.startsWith('"')) {
    const end = raw.indexOf('"', 1);
    return end > 0 ? raw.slice(1, end).trim() : raw.slice(1).trim();
  }
  if (raw.startsWith("'")) {
    const end = raw.indexOf("'", 1);
    return end > 0 ? raw.slice(1, end).trim() : raw.slice(1).trim();
  }
  for (const sep of [';', '//']) {
    const idx = raw.indexOf(sep);
    if (idx >= 0) raw = raw.slice(0, idx);
  }
  return raw.trim();
}

interface ParseOpts {
  ivaoMtl?: boolean;
  jft?: boolean;
}

export function parseAircraftCfg(filepath: string, opts: ParseOpts = {}): Livery[] {
  let content: string;
  try {
    content = fs.readFileSync(filepath, 'utf-8');
  } catch {
    try {
      content = fs.readFileSync(filepath).toString('latin1');
    } catch {
      return [];
    }
  }

  type Section = [string, Record<string, string>];
  const sections: Section[] = [];
  let currentName: string | null = null;
  let currentData: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('//')) continue;
    const secMatch = line.match(/^\[(.+)\]$/);
    if (secMatch) {
      if (currentName !== null) sections.push([currentName, currentData]);
      currentName = secMatch[1].trim().toLowerCase();
      currentData = {};
    } else if (currentName !== null && line.includes('=')) {
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = parseCfgValue(line.slice(idx + 1));
      currentData[key] = val;
    }
  }
  if (currentName !== null) sections.push([currentName, currentData]);

  let generalType: string | null = null;
  let generalCallsign: string | null = null;
  if (!opts.ivaoMtl) {
    for (const [name, data] of sections) {
      if (name === 'general') {
        const val = (data['icao_type_designator'] ?? '').trim().toUpperCase();
        if (val) generalType = val;
        if (opts.jft) {
          const cs = (data['icao_airline'] ?? '').trim().toUpperCase();
          if (cs) generalCallsign = cs;
        }
        break;
      }
    }
  }

  const liveries: Livery[] = [];
  for (const [name, data] of sections) {
    if (!name.startsWith('fltsim')) continue;
    const title = (data['title'] ?? '').trim();
    if (!title) continue;

    let icaoType: string | null = null;
    let callsign: string | null = null;

    if (opts.ivaoMtl) {
      icaoType = (data['ui_type'] ?? '').trim().toUpperCase() || null;
      const variation = data['ui_variation'] ?? '';
      const matches = [...variation.matchAll(/\(([A-Z]{3})\)/g)].map(m => m[1]);
      if (matches.length === 0) {
        const m = variation.match(/\(([A-Z]{3})\s*$/);
        if (m) matches.push(m[1]);
      }
      callsign = matches.length > 0 ? matches[matches.length - 1] : null;
    } else if (opts.jft) {
      const secType = (data['icao_type_designator'] ?? '').trim().toUpperCase();
      icaoType = secType || generalType;
      const secCs = (data['icao_airline'] ?? '').trim().toUpperCase();
      callsign = secCs || generalCallsign;
    } else {
      const secType = (data['icao_type_designator'] ?? '').trim().toUpperCase();
      icaoType = secType || generalType;
      const rawCs = (data['atc_parking_codes'] ?? '').trim().toUpperCase();
      const csPart = rawCs.split(/[,;\s]/)[0]?.trim() || null;
      callsign = csPart || null;
    }

    liveries.push({ title, icaoType, callsign });
  }
  return liveries;
}

function getMsfsComputedPath(): string {
  const local = process.env.LOCALAPPDATA ?? os.homedir();
  return path.join(local, 'Packages', 'Microsoft.Limitless_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community');
}

export async function scanCommunityTitles(): Promise<string[]> {
  const communityPath = getMsfsComputedPath();
  if (!fs.existsSync(communityPath)) return [];

  const models = new Set<string>();
  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.toLowerCase() === 'aircraft.cfg') {
        try {
          const content = await fs.promises.readFile(full, 'utf-8').catch(() =>
            fs.promises.readFile(full).then(b => b.toString('latin1'))
          );
          let inFltsim = false;
          for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith(';') || line.startsWith('//')) continue;
            const sec = line.match(/^\[(.+)\]$/);
            if (sec) {
              inFltsim = sec[1].trim().toLowerCase().startsWith('fltsim');
            } else if (inFltsim && /^title\s*=/i.test(line)) {
              const m = line.match(/^title\s*=\s*(.+)$/i);
              if (m) {
                const title = parseCfgValue(m[1]);
                if (title) models.add(title);
              }
            }
          }
        } catch { /* skip */ }
      }
    }
  }
  await walk(communityPath);
  return [...models].sort();
}

const VMR_RULE_RE = /<ModelMatchRule([^>]*)\/>/g;
const VMR_TC_RE = /TypeCode="([^"]*)"/;
const VMR_MN_RE = /ModelName="([^"]*)"/;
const VMR_CS_RE = /CallsignPrefix="([^"]*)"/;

export async function parseFsltlVmr(filepath: string): Promise<import('../../shared/types').LoadedVmr> {
  let content: string;
  try {
    content = await fs.promises.readFile(filepath, 'utf-8');
  } catch (e) {
    throw new Error(`Could not read VMR file: ${e}`);
  }

  const rules: import('../../shared/types').VmrRule[] = [];
  VMR_RULE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = VMR_RULE_RE.exec(content)) !== null) {
    const attrs = match[1];
    const tcM = VMR_TC_RE.exec(attrs);
    const mnM = VMR_MN_RE.exec(attrs);
    const csM = VMR_CS_RE.exec(attrs);
    if (!tcM?.[1] || !mnM?.[1]) continue;
    const models = mnM[1].split('//').map(m => m.trim()).filter(Boolean);
    rules.push({ typecode: tcM[1], callsign: csM?.[1] ?? '', models });
  }
  return { rules };
}
