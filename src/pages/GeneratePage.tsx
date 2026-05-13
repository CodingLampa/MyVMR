import { useEffect, useRef, useCallback, useState } from 'react';
import { Search, Folder, FileText, Play, CheckSquare, Square, Terminal, X } from 'react-feather';
import { useGenerateStore } from '../store/generateStore';
import styles from './GeneratePage.module.css';

type Pref = 'none' | 'fsltl' | 'aig' | 'ivao' | 'jft';

interface FolderRowProps {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isFile?: boolean;
  fileFilters?: { name: string; extensions: string[] }[];
  hint?: string;
}

const FolderRow = ({
  label,
  required,
  value,
  onChange,
  disabled,
  placeholder,
  isFile,
  fileFilters,
  hint,
}: FolderRowProps) => {
  const browse = async () => {
    let result: string | null = null;
    if (isFile && fileFilters) {
      result = await window.electronAPI.selectFile(fileFilters);
    } else {
      result = await window.electronAPI.selectFolder();
    }
    if (result) onChange(result);
  };

  return (
    <div className={styles.formRow}>
      <label className={styles.formLabel}>
        {label}
        {required && <span className={styles.required}> *</span>}
        {hint && <span className={`${styles.hintTag} ${disabled ? styles.muted : ''}`}> {hint}</span>}
      </label>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? (isFile ? 'Select file...' : 'Select folder...')}
        disabled={disabled}
      />
      <button
        className="btn btn-primary"
        onClick={browse}
        disabled={disabled}
        title={isFile ? 'Browse for file' : 'Browse for folder'}
      >
        {isFile ? <FileText size={13} /> : <Folder size={13} />}
        Browse
      </button>
    </div>
  );
};

export const GeneratePage = () => {
  const store = useGenerateStore();
  const logRef = useRef<HTMLDivElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const [showLog, setShowLog] = useState(false);

  // Auto-scroll log when modal is open
  useEffect(() => {
    const el = logRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [store.logLines, showLog]);

  // Subscribe to IPC log events
  useEffect(() => {
    const unsub = window.electronAPI.onLog((msg: string) => {
      store.appendLog(msg);
    });
    unsubRef.current = unsub;
    return () => {
      unsubRef.current?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDetect = useCallback(async (version: 'fs2020' | 'fs2024') => {
    const paths = await window.electronAPI.detectPaths(version);
    const patch: Partial<Parameters<typeof store.set>[0]> = {};
    if (paths.fsltl) patch.fsltlFolder = paths.fsltl;
    if (paths.fsltlVmr) patch.fsltlVmr = paths.fsltlVmr;
    if (paths.aig) patch.aigFolder = paths.aig;
    if (paths.ivao) patch.ivaoFolder = paths.ivao;
    if (paths.jft) patch.jftFolder = paths.jft;
    store.set(patch);
    const found = Object.keys(paths).length;
    const label = version === 'fs2020' ? 'FS2020' : 'FS2024';
    store.appendLog(found > 0 ? `Auto-detect (${label}): found ${found} path(s).` : `Auto-detect (${label}): no known paths found.`);
  }, [store]);

  const handleGenerate = useCallback(async () => {
    if (!store.outputPath) {
      store.appendLog('ERROR: Please set an output path.');
      return;
    }
    store.clearLog();
    store.set({ generating: true });

    try {
      const result = await window.electronAPI.generate({
        fsltlFolder: store.fsltlFolder,
        aigFolder: store.aigFolder,
        ivaoFolder: store.ivaoFolder,
        jftFolder: store.jftFolder,
        fsltlVmr: store.fsltlVmr,
        outputPath: store.outputPath,
        skipFsltl: store.skipFsltl,
        preference: store.preference,
      });

      if (result.success) {
        store.appendLog('\nDone! VMR file generated successfully.');
      } else {
        store.appendLog(`\nERROR: ${result.error ?? 'Unknown error'}`);
      }
    } catch (e) {
      store.appendLog(`\nERROR: ${String(e)}`);
    } finally {
      store.set({ generating: false });
    }
  }, [store]);

  const handleBrowseOutput = async () => {
    const result = await window.electronAPI.saveFile();
    if (result) store.set({ outputPath: result });
  };

  const prefOptions: { value: Pref; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'fsltl', label: 'FSLTL' },
    { value: 'aig', label: 'AIG OCI' },
    { value: 'ivao', label: 'IVAO MTL' },
    { value: 'jft', label: 'JustFlight' },
  ];

  const getLogLineClass = (line: string): string => {
    if (line.startsWith('ERROR') || line.includes('ERROR:')) return styles.logLineError;
    if (line.startsWith('Done!') || line.includes('successfully')) return styles.logLineSuccess;
    return styles.logLine;
  };

  const hasLog = store.logLines.length > 0;

  return (
    <div className={styles.page}>
      {/* Header row */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Generate VMR</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={() => handleDetect('fs2020')}
            disabled={store.generating}
            title="Auto-detect FS2020 traffic packages via UserCfg.opt"
          >
            <Search size={13} />
            FS2020 Paths
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleDetect('fs2024')}
            disabled={store.generating}
            title="Auto-detect FS2024 traffic packages via UserCfg.opt"
          >
            <Search size={13} />
            FS2024 Paths
          </button>
        </div>
      </div>

      {/* Required section */}
      <div className={styles.card}>
        <div className="section-header">
          <span>Source Folders</span>
          <hr />
        </div>

        <FolderRow
          label="FSLTL Traffic Base"
          value={store.fsltlFolder}
          onChange={(v) => store.set({ fsltlFolder: v })}
          disabled={store.generating}
          placeholder="e.g. ...Community\fsltl-traffic-base"
        />
        <FolderRow
          label="AIG OCI"
          value={store.aigFolder}
          onChange={(v) => store.set({ aigFolder: v })}
          disabled={store.generating}
          placeholder="e.g. ...Community\aig-aitraffic-oci"
        />
        <FolderRow
          label="IVAO MTL"
          value={store.ivaoFolder}
          onChange={(v) => store.set({ ivaoFolder: v })}
          disabled={store.generating}
          placeholder="e.g. ...Community\IVAO_MTL"
        />
        <FolderRow
          label="JustFlight FSTraffic"
          value={store.jftFolder}
          onChange={(v) => store.set({ jftFolder: v })}
          disabled={store.generating}
          placeholder="e.g. ...Community\justflight-fstraffic-module"
        />
      </div>

      {/* Optional section */}
      <div className={styles.card}>
        <div className="section-header">
          <span>FSLTL VMR Options</span>
          <hr />
        </div>

        <div className={styles.checkRow}>
          <button
            className={styles.checkBtn}
            onClick={() => store.set({ skipFsltl: !store.skipFsltl })}
            disabled={store.generating}
            aria-pressed={store.skipFsltl}
          >
            {store.skipFsltl ? <CheckSquare size={15} color="var(--accent)" /> : <Square size={15} color="var(--muted)" />}
            <span className={store.skipFsltl ? styles.checkLabelActive : styles.checkLabel}></span>
          </button>
          <div className={styles.vmrMessage}>
              <span style={{ fontWeight: "bold" }}>Skip FSLTL VMR Merge. </span><br />
              May cause unmatched traffic to default to Asobo models, instead of FSLTL generic models.
          </div>
        </div>

        <FolderRow
          label="FSLTL VMR File"
          value={store.fsltlVmr}
          onChange={(v) => store.set({ fsltlVmr: v })}
          disabled={store.skipFsltl || store.generating}
          isFile
          fileFilters={[{ name: 'VMR files', extensions: ['vmr'] }, { name: 'All files', extensions: ['*'] }]}
          placeholder="e.g. FSLTL_Rules.vmr"
          hint={store.skipFsltl ? '(skipped)' : undefined}
        />

        <div className="section-header" style={{ marginTop: 14 }}>
          <span>Model Provider Preference</span>
          <hr />
        </div>
        <p className={styles.prefHint}>
          When a model match is found from multiple providers, keep only the preferred provider's models and discard the other ones.
        </p>
        <div className={styles.radioGroup}>
          {prefOptions.map((o) => (
            <label key={o.value} className={styles.radioLabel}>
              <input
                type="radio"
                name="preference"
                value={o.value}
                checked={store.preference === o.value}
                onChange={() => store.set({ preference: o.value })}
                disabled={store.generating}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      {/* Output section */}
      <div className={styles.card}>
        <div className="section-header">
          <span>Output</span>
          <hr />
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            Output Path <span className={styles.required}>*</span>
          </label>
          <input
            className="input"
            value={store.outputPath}
            onChange={(e) => store.set({ outputPath: e.target.value })}
            placeholder="e.g. C:\Users\you\generated.vmr"
            disabled={store.generating}
          />
          <button
            className="btn btn-primary"
            onClick={handleBrowseOutput}
            disabled={store.generating}
          >
            <FileText size={13} />
            Save As
          </button>
        </div>
      </div>

      {/* Generate + View Log buttons */}
      <div className={styles.generateRow}>
        <button
          className={`btn btn-primary ${styles.generateBtn}`}
          onClick={handleGenerate}
          disabled={store.generating || !store.outputPath}
        >
          <Play size={14} />
          {store.generating ? 'Generating...' : 'Generate VMR'}
        </button>
        {hasLog && !store.generating && (
          <button
            className={`btn btn-secondary ${styles.viewLogBtn}`}
            onClick={() => setShowLog(true)}
          >
            <Terminal size={14} />
            View Log
          </button>
        )}
      </div>

      {/* Log modal */}
      {showLog && (
        <div className={styles.modalOverlay} onClick={() => setShowLog(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Log Output</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-outline-info"
                  style={{ padding: '3px 10px', fontSize: 11 }}
                  onClick={() => { store.clearLog(); setShowLog(false); }}
                >
                  Clear
                </button>
                <button className={styles.modalClose} onClick={() => setShowLog(false)}>
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className={styles.log} ref={logRef}>
              {store.logLines.map((line, i) => (
                <span key={i} className={getLogLineClass(line)}>
                  {line}
                  {'\n'}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Credits footer */}
      <div className={styles.footer}>
        <span>Created by <strong>Laurie Cooper</strong></span>
        <span>Credit to <strong>BAVirtual Livery Manager</strong> by Pavel Sergienko</span>
      </div>
    </div>
  );
};
