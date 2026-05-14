import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { parseAircraftCfg, parseFsltlVmr, scanCommunityTitles } from '../services/cfgParser';
import { generateVmr } from '../services/vmrGenerator';
import { detectPaths, getCommunityPath } from '../services/pathDetector';
import type { GenerateOptions, GenerateResult, LoadedVmr } from '../../shared/types';

type AirlineRules = Map<string, string[]>;   // key = "CS:TC"
type ModelSources = Map<string, Map<string, string>>; // key = "CS:TC", value = title->source
type GenericRules = Map<string, string[]>;   // key = TC
type DroppedEntry = { title: string; typecode: string; callsign: string; reason: string };
type Dropped = Record<string, DroppedEntry[]>;

function makeKey(cs: string, tc: string): string {
  return `${cs}:${tc}`;
}

async function walkCfgFiles(folder: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.toLowerCase() === 'aircraft.cfg') {
        results.push(full);
      }
    }
  }
  await walk(folder);
  return results;
}

async function scanFolder(
  folder: string,
  ivaoMtl: boolean,
  jft: boolean,
  sourceName: string,
  airlineRules: AirlineRules,
  modelSources: ModelSources,
  genericOut: GenericRules | null,
  droppedOut: DroppedEntry[],
  log: (msg: string) => void
): Promise<void> {
  const cfgFiles = await walkCfgFiles(folder);
  let modelCount = 0;

  for (const cfgPath of cfgFiles) {
    const liveries = parseAircraftCfg(cfgPath, { ivaoMtl, jft });
    for (const liv of liveries) {
      let { title, icaoType: tp, callsign: cs } = liv;
      if (cs && cs.length > 3) cs = cs.slice(0, 3);

      if (!tp) {
        droppedOut.push({ title, typecode: '', callsign: cs ?? '', reason: 'no TypeCode' });
        continue;
      }
      if (!cs) {
        if (ivaoMtl && genericOut !== null) {
          const list = genericOut.get(tp) ?? [];
          if (!list.includes(title)) { list.push(title); genericOut.set(tp, list); modelCount++; }
        } else {
          droppedOut.push({ title, typecode: tp, callsign: '', reason: 'no CallsignPrefix' });
        }
        continue;
      }

      const key = makeKey(cs, tp);
      const existing = airlineRules.get(key) ?? [];
      if (!existing.includes(title)) { existing.push(title); airlineRules.set(key, existing); modelCount++; }
      const srcMap = modelSources.get(key) ?? new Map<string, string>();
      srcMap.set(title, sourceName);
      modelSources.set(key, srcMap);
    }
  }
  log(`    ${cfgFiles.length} aircraft.cfg file(s) found, ${modelCount} model name(s) added`);
}

async function runGenerate(options: GenerateOptions, log: (msg: string) => void): Promise<GenerateResult> {
  const airlineRules: AirlineRules = new Map();
  const modelSources: ModelSources = new Map();
  const ivaoGeneric: GenericRules = new Map();
  const dropped: Dropped = { FSLTL: [], 'AIG OCI': [], IVAO_MTL: [], JustFlight: [] };

  // --- Pass 1 ---
  log('=== Pass 1: Scanning folders ===');
  if (options.fsltlFolder) {
    log(`FSLTL Traffic Base: ${options.fsltlFolder}`);
    await scanFolder(options.fsltlFolder, false, false, 'FSLTL', airlineRules, modelSources, null, dropped['FSLTL'], log);
  }
  if (options.aigFolder) {
    log(`AIG OCI: ${options.aigFolder}`);
    await scanFolder(options.aigFolder, false, false, 'AIG OCI', airlineRules, modelSources, null, dropped['AIG OCI'], log);
  }
  if (options.ivaoFolder) {
    log(`IVAO_MTL: ${options.ivaoFolder}`);
    await scanFolder(options.ivaoFolder, true, false, 'IVAO_MTL', airlineRules, modelSources, ivaoGeneric, dropped['IVAO_MTL'], log);
  }
  if (options.jftFolder) {
    log(`JustFlight FSTraffic: ${options.jftFolder}`);
    await scanFolder(options.jftFolder, false, true, 'JustFlight', airlineRules, modelSources, null, dropped['JustFlight'], log);
  }
  log(`\nPass 1 total: ${airlineRules.size} (CallsignPrefix+TypeCode) pair(s)`);

  // --- Preference filter ---
  const prefLabels: Record<string, string> = { fsltl: 'FSLTL', aig: 'AIG OCI', ivao: 'IVAO_MTL', jft: 'JustFlight' };
  if (options.preference !== 'none') {
    const prefSource = prefLabels[options.preference];
    log(`\n=== Applying preference: ${prefSource} ===`);
    let removedCount = 0;
    for (const [key, models] of airlineRules) {
      const [csKey, tcKey] = key.split(':', 2);
      const srcMap = modelSources.get(key) ?? new Map<string, string>();
      const prefModels = models.filter(m => srcMap.get(m) === prefSource);
      if (prefModels.length > 0) {
        for (const m of models) {
          if (srcMap.get(m) !== prefSource) {
            const src = srcMap.get(m) ?? '';
            if (src in dropped) {
              dropped[src].push({ title: m, typecode: tcKey, callsign: csKey, reason: `preference filter (${prefSource} preferred)` });
            }
          }
        }
        removedCount += models.length - prefModels.length;
        airlineRules.set(key, prefModels);
      }
    }
    log(`  ${removedCount} non-preferred model(s) removed where ${prefSource} has coverage`);
  }

  // --- Pass 2: FSLTL VMR ---
  const genericRules: GenericRules = new Map();
  if (options.skipFsltl) {
    log('\n(Pass 2 skipped — FSLTL VMR not used)');
  } else {
    log('\n=== Pass 2: Merging FSLTL VMR ===');
    try {
      const loaded = await parseFsltlVmr(options.fsltlVmr);
      let added = 0;
      for (const rule of loaded.rules) {
        if (!rule.callsign) {
          genericRules.set(rule.typecode, rule.models);
          added++;
        }
        // Airline rules (with CallsignPrefix) from the FSLTL VMR are intentionally ignored
      }
      log(`  ${added} generic (TypeCode-only) rule(s) merged from FSLTL VMR`);
    } catch (e) {
      log(`  WARNING: Could not read FSLTL VMR — ${e}`);
    }
  }

  // --- IVAO generic ---
  if (ivaoGeneric.size > 0) {
    let addedGeneric = 0;
    for (const [tc, models] of ivaoGeneric) {
      const existing = genericRules.get(tc) ?? [];
      for (const m of models) {
        if (!existing.includes(m)) { existing.push(m); addedGeneric++; }
      }
      genericRules.set(tc, existing);
    }
    log(`\n  ${addedGeneric} TypeCode-only IVAO_MTL model(s) added as generic rules`);
  }

  // --- Deduplication ---
  let dupes = 0;
  for (const [key, models] of airlineRules) {
    const deduped = [...new Set(models)];
    dupes += models.length - deduped.length;
    airlineRules.set(key, deduped);
  }
  for (const [tc, models] of genericRules) {
    const deduped = [...new Set(models)];
    dupes += models.length - deduped.length;
    genericRules.set(tc, deduped);
  }
  if (dupes > 0) log(`\nSanity check: removed ${dupes} duplicate model name(s)`);

  log(`\nFinal total: ${genericRules.size} generic + ${airlineRules.size} airline rule(s)`);

  // --- Cross-reference dropped vs output ---
  const allOutputModels = new Set<string>();
  for (const models of airlineRules.values()) models.forEach(m => allOutputModels.add(m));
  for (const models of genericRules.values()) models.forEach(m => allOutputModels.add(m));

  let recovered = 0;
  for (const source of Object.keys(dropped)) {
    const before = dropped[source].length;
    dropped[source] = dropped[source].filter(e => !allOutputModels.has(e.title));
    recovered += before - dropped[source].length;
  }
  if (recovered > 0) log(`\n  ${recovered} skipped model(s) were recovered via FSLTL VMR generics — removed from debug report`);

  // --- Debug report ---
  const totalDropped = Object.values(dropped).reduce((n, v) => n + v.length, 0);
  if (totalDropped > 0) {
    log(`\n=== Debug: ${totalDropped} livery/liveries not added ===`);
    for (const [source, entries] of Object.entries(dropped)) {
      if (entries.length === 0) continue;
      const counts: Record<string, number> = {};
      entries.forEach(e => { counts[e.reason] = (counts[e.reason] ?? 0) + 1; });
      log(`  ${source}: ${entries.length} skipped`);
      Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([r, c]) => log(`    ${r}: ${c}`));
    }
    const debugPath = options.outputPath + '.dropped.txt';
    try {
      const lines: string[] = [
        'Debug Report — Liveries Not Added',
        `VMR: ${options.outputPath}`,
        'NOTE: Only models from the 4 configured source folders are tracked here.',
        '',
      ];
      for (const [source, entries] of Object.entries(dropped)) {
        if (entries.length === 0) continue;
        lines.push(`=== ${source} (${entries.length}) ===`);
        lines.push(`${'Title'.padEnd(55)} ${'TypeCode'.padEnd(10)} ${'Callsign'.padEnd(14)} Reason`);
        lines.push('-'.repeat(100));
        entries.sort((a, b) => a.reason.localeCompare(b.reason)).forEach(e =>
          lines.push(`${e.title.padEnd(55)} ${e.typecode.padEnd(10)} ${e.callsign.padEnd(14)} ${e.reason}`)
        );
        lines.push('');
      }
      fs.writeFileSync(debugPath, lines.join('\n'), 'utf-8');
      log(`  Full report: ${debugPath}`);
    } catch (e) {
      log(`  Could not save debug report: ${e}`);
    }
  }

  if (airlineRules.size === 0 && genericRules.size === 0) {
    log('Nothing to write.');
    return { success: false, error: 'No rules generated.' };
  }

  // --- Write VMR ---
  const xml = generateVmr(airlineRules, genericRules);
  try {
    fs.writeFileSync(options.outputPath, xml, 'utf-8');
    log(`\nVMR written to: ${options.outputPath}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export function registerHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('vmr:select-folder', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('vmr:select-file', async (_e, filters: { name: string; extensions: string[] }[]) => {
    const r = await dialog.showOpenDialog(mainWindow, { filters, properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('vmr:save-file', async () => {
    const r = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'generated.vmr',
      filters: [{ name: 'VMR files', extensions: ['vmr'] }, { name: 'All files', extensions: ['*'] }],
    });
    return r.canceled ? null : r.filePath;
  });

  ipcMain.handle('vmr:detect-paths', (_e, version: 'fs2020' | 'fs2024') => detectPaths(version));

  ipcMain.handle('vmr:scan-community', async (_e, version: 'fs2020' | 'fs2024') => {
    const community = getCommunityPath(version);
    if (!community) return [];
    return scanCommunityTitles(community);
  });

  ipcMain.handle('vmr:load-vmr', (_e, filePath: string): Promise<LoadedVmr> => parseFsltlVmr(filePath));

  ipcMain.handle('vmr:generate', async (event, options: GenerateOptions): Promise<GenerateResult> => {
    return runGenerate(options, (msg: string) => event.sender.send('vmr:log', msg));
  });

  ipcMain.handle('window:minimize', () => mainWindow.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('window:close', () => mainWindow.close());

  ipcMain.handle('shell:open-external', (_e, url: string) => shell.openExternal(url));

  ipcMain.handle('vmr:save-vmr', (_e, filePath: string, rules: { typecode: string; callsign: string; model: string }[]) => {
    const grouped = new Map<string, string[]>();
    for (const r of rules) {
      const key = `${r.callsign.trim().toUpperCase()}:${r.typecode.trim().toUpperCase()}`;
      const models = grouped.get(key) ?? [];
      const m = r.model.trim();
      if (m && !models.includes(m)) models.push(m);
      grouped.set(key, models);
    }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = ['<?xml version="1.0" encoding="utf-8"?>', '<ModelMatchRuleSet>'];
    const sorted = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [key, models] of sorted) {
      if (!models.length) continue;
      const colon = key.indexOf(':');
      const cs = key.slice(0, colon);
      const tc = key.slice(colon + 1);
      if (cs) {
        lines.push(`  <ModelMatchRule CallsignPrefix="${esc(cs)}" TypeCode="${esc(tc)}" ModelName="${esc(models.join('//'))}"/>`);
      } else {
        lines.push(`  <ModelMatchRule TypeCode="${esc(tc)}" ModelName="${esc(models.join('//'))}"/>`);
      }
    }
    lines.push('</ModelMatchRuleSet>');
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  });
}
