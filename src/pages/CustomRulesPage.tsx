import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Plus, Edit2, Trash2, Upload, Search, X } from 'react-feather';
import { useCustomRulesStore, type Rule } from '../store/customRulesStore';
import styles from './CustomRulesPage.module.css';

// ── Rule Dialog ──────────────────────────────────────────────────────────────

interface RuleDialogProps {
  existing?: Rule;
  allModels: string[];
  usedModels: Set<string>;
  onSave: (rule: Rule) => void;
  onClose: () => void;
}

const RuleDialog = ({ existing, allModels, usedModels, onSave, onClose }: RuleDialogProps) => {
  const [typecode, setTypecode] = useState(existing?.typecode ?? '');
  const [callsign, setCallsign] = useState(existing?.callsign ?? '');
  const [model, setModel] = useState(existing?.model ?? '');
  const [search, setSearch] = useState(existing?.model ?? '');
  const [error, setError] = useState('');
  const searchAfterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filteredModels, setFilteredModels] = useState<string[]>([]);

  const availableModels = useMemo(
    () => allModels.filter(m => !usedModels.has(m) || m === existing?.model),
    [allModels, usedModels, existing]
  );

  useEffect(() => {
    if (searchAfterRef.current) clearTimeout(searchAfterRef.current);
    searchAfterRef.current = setTimeout(() => {
      const q = search.toLowerCase();
      setFilteredModels(
        q ? availableModels.filter(m => m.toLowerCase().includes(q)) : availableModels
      );
    }, 120);
  }, [search, availableModels]);

  const handleSave = () => {
    const tc = typecode.trim().toUpperCase();
    const cs = callsign.trim().toUpperCase();
    const m  = model.trim();
    if (!tc) { setError('TypeCode is required.'); return; }
    if (!m)  { setError('Model Name is required.'); return; }
    if (cs && cs.length > 3) { setError('CallsignPrefix must be 3 characters or fewer.'); return; }
    onSave({ typecode: tc, callsign: cs, model: m });
  };

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <span className={styles.dialogTitle}>{existing ? 'Edit Rule' : 'Add Rule'}</span>
        </div>

        <div className={styles.dialogBody}>
          <div className={styles.dialogRow}>
            <label className={styles.dialogLabel}>TypeCode</label>
            <input
              className="input"
              value={typecode}
              onChange={e => setTypecode(e.target.value.toUpperCase())}
              placeholder="e.g. B738"
              maxLength={10}
              style={{ width: 120 }}
            />
          </div>
          <div className={styles.dialogRow}>
            <label className={styles.dialogLabel}>CallsignPrefix</label>
            <input
              className="input"
              value={callsign}
              onChange={e => setCallsign(e.target.value.toUpperCase())}
              placeholder="e.g. BAW (leave blank for generic)"
              maxLength={3}
              style={{ width: 120 }}
            />
            <span className={styles.dialogHint}>leave blank for TypeCode-only rule</span>
          </div>

          <div className="section-header" style={{ margin: '12px 0 6px' }}>
            <span>Model Name</span>
            <hr />
          </div>

          <div className={styles.modelSearch}>
            <Search size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <input
              className="input"
              style={{ border: 'none', padding: '4px 0', fontSize: 12.5 }}
              placeholder="Search liveries..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className={styles.modelList}>
            {filteredModels.length === 0 ? (
              <div className={styles.modelListEmpty}>
                {availableModels.length === 0
                  ? 'No models loaded — use FS2020/FS2024 Models button to scan'
                  : 'No matches'}
              </div>
            ) : (
              filteredModels.slice(0, 2000).map(m => (
                <div
                  key={m}
                  className={`${styles.modelItem} ${model === m ? styles.modelItemSelected : ''}`}
                  onClick={() => { setModel(m); setSearch(m); }}
                  onDoubleClick={handleSave}
                >
                  {m}
                </div>
              ))
            )}
          </div>

          <div className={styles.dialogRow} style={{ marginTop: 10 }}>
            <label className={styles.dialogLabel}>Selected</label>
            <input
              className="input"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="Type or select from list above"
              style={{ flex: 1 }}
            />
          </div>

          {error && <div className={styles.dialogError}>{error}</div>}
        </div>

        <div className={styles.dialogFooter}>
          <button className="btn btn-primary" onClick={handleSave}>OK</button>
          <button className="btn btn-outline-info" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ── Bulk Edit Dialog ─────────────────────────────────────────────────────────

interface BulkEditDialogProps {
  count: number;
  onApply: (typecode: string, callsign: string) => void;
  onClose: () => void;
}

const BulkEditDialog = ({ count, onApply, onClose }: BulkEditDialogProps) => {
  const [typecode, setTypecode] = useState('');
  const [callsign, setCallsign] = useState('');
  const canApply = !!(typecode.trim() || callsign.trim());

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <span className={styles.dialogTitle}>
            Bulk Edit — {count} rule{count !== 1 ? 's' : ''}
          </span>
        </div>
        <div className={styles.dialogBody}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
            Leave a field blank to keep existing values unchanged.
          </p>
          <div className={styles.dialogRow}>
            <label className={styles.dialogLabel}>New TypeCode</label>
            <input
              className="input"
              value={typecode}
              onChange={e => setTypecode(e.target.value.toUpperCase())}
              placeholder="Leave blank to keep"
              maxLength={10}
              style={{ width: 160 }}
              autoFocus
            />
          </div>
          <div className={styles.dialogRow}>
            <label className={styles.dialogLabel}>New Callsign</label>
            <input
              className="input"
              value={callsign}
              onChange={e => setCallsign(e.target.value.toUpperCase())}
              placeholder="Leave blank to keep"
              maxLength={3}
              style={{ width: 160 }}
            />
          </div>
        </div>
        <div className={styles.dialogFooter}>
          <button
            className="btn btn-primary"
            onClick={() => onApply(typecode.trim(), callsign.trim())}
            disabled={!canApply}
          >
            Apply to {count}
          </button>
          <button className="btn btn-outline-info" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────

type SortCol = 'typecode' | 'callsign' | 'model' | null;
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const PAGE_SIZE = 200;

export const CustomRulesPage = () => {
  const store = useCustomRulesStore();
  const [filterTypecode, setFilterTypecode] = useState('');
  const [filterCallsign, setFilterCallsign] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterGenericOnly, setFilterGenericOnly] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>(null);
  const [sortDesc, setSortDesc] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const anchorPosRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoSave = useCallback(async (rules: Rule[]) => {
    if (!store.filePath) return;
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      await window.electronAPI.saveVmr(store.filePath, rules);
      setSaveStatus('saved');
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [store.filePath]);

  const visibleRules = useMemo(() => {
    const tcQ = filterTypecode.toLowerCase().trim();
    const csQ = filterCallsign.toLowerCase().trim();
    const mdQ = filterModel.toLowerCase().trim();

    let rows = store.rules.map((r, i) => ({ ...r, _idx: i }));
    if (tcQ) rows = rows.filter(r => r.typecode.toLowerCase().includes(tcQ));
    if (csQ) rows = rows.filter(r => r.callsign.toLowerCase().includes(csQ));
    if (mdQ) rows = rows.filter(r => r.model.toLowerCase().includes(mdQ));
    if (filterGenericOnly) rows = rows.filter(r => !r.callsign);

    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const v = a[sortCol].localeCompare(b[sortCol]);
        return sortDesc ? -v : v;
      });
    }
    return rows;
  }, [store.rules, filterTypecode, filterCallsign, filterModel, filterGenericOnly, sortCol, sortDesc]);

  const usedModels = useMemo(
    () => new Set(store.rules.map(r => r.model)),
    [store.rules]
  );

  const hasFilters = !!(filterTypecode || filterCallsign || filterModel || filterGenericOnly);

  useEffect(() => {
    setPage(0);
    anchorPosRef.current = null;
  }, [filterTypecode, filterCallsign, filterModel, filterGenericOnly, sortCol, sortDesc, store.rules.length]);

  const pageCount = Math.max(1, Math.ceil(visibleRules.length / PAGE_SIZE));
  const curPage = Math.min(page, pageCount - 1);
  const pageRules = visibleRules.slice(curPage * PAGE_SIZE, (curPage + 1) * PAGE_SIZE);

  const allVisibleSelected = visibleRules.length > 0 && visibleRules.every(r => selected.has(r._idx));

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDesc(d => !d);
    else { setSortCol(col); setSortDesc(false); }
  };

  const clearFilters = () => {
    setFilterTypecode('');
    setFilterCallsign('');
    setFilterModel('');
    setFilterGenericOnly(false);
  };

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const handleRangeSelect = (visPos: number) => {
    const anchor = anchorPosRef.current;
    if (anchor === null) return;
    const from = Math.min(anchor, visPos);
    const to   = Math.max(anchor, visPos);
    const rangeIdxs = visibleRules.slice(from, to + 1).map(r => r._idx);
    setSelected(prev => {
      const next = new Set(prev);
      for (const i of rangeIdxs) next.add(i);
      return next;
    });
  };

  const toggleSelectAll = () => {
    anchorPosRef.current = null;
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleRules.map(r => r._idx)));
    }
  };

  const openAdd = () => { setEditIndex(null); setDialogOpen(true); };
  const openEdit = (idx: number) => { setEditIndex(idx); setDialogOpen(true); };

  const handleSave = (rule: Rule) => {
    let newRules: Rule[];
    if (editIndex !== null) {
      newRules = store.rules.map((r, i) => i === editIndex ? rule : r);
      store.updateRule(editIndex, rule);
    } else {
      newRules = [...store.rules, rule];
      store.addRule(rule);
    }
    setDialogOpen(false);
    autoSave(newRules);
  };

  const handleDelete = (idx: number) => {
    const newRules = store.rules.filter((_, i) => i !== idx);
    store.deleteRule(idx);
    setSelected(prev => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      }
      return next;
    });
    autoSave(newRules);
  };

  const handleBulkDelete = () => {
    const sortedDesc = [...selected].sort((a, b) => b - a);
    const newRules = [...store.rules];
    for (const idx of sortedDesc) newRules.splice(idx, 1);
    store.setRules(newRules);
    setSelected(new Set());
    anchorPosRef.current = null;
    autoSave(newRules);
  };

  const handleBulkApply = (newTypecode: string, newCallsign: string) => {
    const newRules = store.rules.map((r, i) => {
      if (!selected.has(i)) return r;
      return {
        typecode: newTypecode || r.typecode,
        callsign: newCallsign || r.callsign,
        model: r.model,
      };
    });
    store.setRules(newRules);
    setBulkEditOpen(false);
    setSelected(new Set());
    autoSave(newRules);
  };

  const handleLoadVmr = async () => {
    const path = await window.electronAPI.selectFile([
      { name: 'VMR files', extensions: ['vmr'] },
      { name: 'All files', extensions: ['*'] },
    ]);
    if (!path) return;

    try {
      const loaded = await window.electronAPI.loadVmr(path);
      const newRules: Rule[] = [];
      for (const r of loaded.rules) {
        for (const m of r.models) {
          newRules.push({ typecode: r.typecode, callsign: r.callsign ?? '', model: m });
        }
      }
      store.setFilePath(path);
      store.setRules(newRules);
      store.setModels([]);
      setSelected(new Set());
      setSaveStatus('idle');
    } catch (e) {
      console.error('Failed to load VMR:', e);
    }
  };

  const handleLoadModels = async (version: 'fs2020' | 'fs2024') => {
    store.setModelsLoading(true);
    try {
      const models = await window.electronAPI.scanCommunity(version);
      store.setModels(models);
    } catch {
      store.setModelsLoading(false);
    }
  };

  const thClass = (col: SortCol) =>
    `${styles.th} ${sortCol === col ? styles.thActive : ''}`;

  const arrow = (col: SortCol) =>
    sortCol === col ? (sortDesc ? ' ▼' : ' ▲') : '';

  const editingRule = editIndex !== null ? store.rules[editIndex] : undefined;

  const fileName = store.filePath
    ? store.filePath.split(/[\\/]/).pop()
    : null;

  const saveLabel =
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved'  ? 'Saved' :
    saveStatus === 'error'  ? 'Save failed' : '';

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Custom Rules</h1>
        <div className={styles.headerActions}>
          <button
            className="btn btn-outline-info"
            onClick={handleLoadVmr}
            title="Open a VMR file to edit"
          >
            <Upload size={13} />
            Load VMR…
          </button>
          <button
            className="btn btn-outline-info"
            onClick={() => handleLoadModels('fs2020')}
            disabled={store.modelsLoading || !store.filePath}
            title="Scan FS2020 Community folder for available livery titles"
          >
            <Search size={13} />
            FS2020 Models
          </button>
          <button
            className="btn btn-outline-info"
            onClick={() => handleLoadModels('fs2024')}
            disabled={store.modelsLoading || !store.filePath}
            title="Scan FS2024 Community folder for available livery titles"
          >
            <Search size={13} />
            FS2024 Models
          </button>
        </div>
      </div>

      {/* File status bar */}
      {store.filePath ? (
        <div className={styles.fileBar}>
          <span className={styles.fileName} title={store.filePath}>{fileName}</span>
          {saveLabel && (
            <span className={`${styles.saveStatus} ${styles[`saveStatus_${saveStatus}`]}`}>
              {saveLabel}
            </span>
          )}
          {store.modelsLoaded && (
            <span className={styles.modelsCount}>
              · {store.models.length.toLocaleString()} models loaded
            </span>
          )}
        </div>
      ) : (
        <div className={styles.noFile}>
          Load a VMR file to start editing.
        </div>
      )}

      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>TC</span>
          <input
            className="input"
            style={{ border: 'none', padding: '3px 4px', fontSize: 12.5, width: 72 }}
            placeholder="B738…"
            value={filterTypecode}
            onChange={e => setFilterTypecode(e.target.value.toUpperCase())}
          />
        </div>
        <div className={styles.filterSep} />
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>CS</span>
          <input
            className="input"
            style={{ border: 'none', padding: '3px 4px', fontSize: 12.5, width: 60 }}
            placeholder="BAW…"
            value={filterCallsign}
            onChange={e => setFilterCallsign(e.target.value.toUpperCase())}
          />
        </div>
        <div className={styles.filterSep} />
        <div className={styles.filterGroup} style={{ flex: 1, minWidth: 0 }}>
          <Search size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            className="input"
            style={{ border: 'none', padding: '3px 4px', fontSize: 12.5, flex: 1, minWidth: 0 }}
            placeholder="Model name…"
            value={filterModel}
            onChange={e => setFilterModel(e.target.value)}
          />
        </div>
        <button
          className={`${styles.genericToggle} ${filterGenericOnly ? styles.genericToggleActive : ''}`}
          onClick={() => setFilterGenericOnly(v => !v)}
          title="Show only rules without a CallsignPrefix"
        >
          Generic
        </button>
        {hasFilters && (
          <button
            className="btn btn-outline-info"
            style={{ padding: '2px 8px', fontSize: 11 }}
            onClick={clearFilters}
          >
            <X size={11} />
            Clear
          </button>
        )}
        <span className={styles.filterCount}>
          {hasFilters
            ? `${visibleRules.length.toLocaleString()} of ${store.rules.length.toLocaleString()}`
            : `${store.rules.length.toLocaleString()} rules`
          }
        </span>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th} style={{ width: 36, cursor: 'default' }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  title="Select all visible"
                  className={styles.checkbox}
                />
              </th>
              <th className={thClass('typecode')} onClick={() => handleSort('typecode')} style={{ width: 90 }}>
                TypeCode{arrow('typecode')}
              </th>
              <th className={thClass('callsign')} onClick={() => handleSort('callsign')} style={{ width: 120 }}>
                CallsignPrefix{arrow('callsign')}
              </th>
              <th className={thClass('model')} onClick={() => handleSort('model')}>
                ModelName{arrow('model')}
              </th>
              <th className={styles.th} style={{ width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {visibleRules.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>
                  {!store.filePath
                    ? 'Load a VMR file to begin editing.'
                    : store.rules.length === 0
                    ? 'No rules in this VMR — click Add Rule to get started.'
                    : 'No rules match the filter.'}
                </td>
              </tr>
            ) : (
              pageRules.map((r, i) => {
                const visPos = curPage * PAGE_SIZE + i;
                return (
                <tr
                  key={r._idx}
                  className={`${i % 2 === 0 ? styles.rowEven : styles.rowOdd} ${selected.has(r._idx) ? styles.rowSelected : ''}`}
                  onDoubleClick={() => openEdit(r._idx)}
                >
                  <td className={styles.td}>
                    <input
                      type="checkbox"
                      checked={selected.has(r._idx)}
                      className={styles.checkbox}
                      readOnly
                      onClick={e => {
                        e.stopPropagation();
                        if (e.shiftKey) {
                          handleRangeSelect(visPos);
                        } else {
                          anchorPosRef.current = visPos;
                          toggleSelect(r._idx);
                        }
                      }}
                    />
                  </td>
                  <td className={styles.td}>{r.typecode}</td>
                  <td className={styles.td}>{r.callsign || <span className={styles.muted}>—</span>}</td>
                  <td className={`${styles.td} ${styles.modelCell}`}>{r.model}</td>
                  <td className={styles.td}>
                    <div className={styles.rowActions}>
                      <button className={styles.iconBtn} onClick={() => openEdit(r._idx)} title="Edit" disabled={!store.filePath}>
                        <Edit2 size={13} />
                      </button>
                      <button
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        onClick={() => handleDelete(r._idx)}
                        title="Delete"
                        disabled={!store.filePath}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className={styles.pagination}>
          <button
            className="btn btn-outline-info"
            style={{ padding: '2px 10px', fontSize: 11 }}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={curPage === 0}
          >
            ‹ Prev
          </button>
          <span className={styles.pageInfo}>
            {(curPage * PAGE_SIZE + 1).toLocaleString()}–{Math.min((curPage + 1) * PAGE_SIZE, visibleRules.length).toLocaleString()} of {visibleRules.length.toLocaleString()}
          </span>
          <button
            className="btn btn-outline-info"
            style={{ padding: '2px 10px', fontSize: 11 }}
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={curPage === pageCount - 1}
          >
            Next ›
          </button>
        </div>
      )}

      {/* Action bar */}
      <div className={styles.actionBar}>
        <button className="btn btn-outline-success" onClick={openAdd} disabled={!store.filePath}>
          <Plus size={13} />
          Add Rule
        </button>
        {selected.size > 0 && (
          <>
            <div className={styles.actionSep} />
            <button className="btn btn-outline-danger" onClick={handleBulkDelete}>
              <Trash2 size={13} />
              Delete {selected.size}
            </button>
            <button className="btn btn-outline-info" onClick={() => setBulkEditOpen(true)}>
              <Edit2 size={13} />
              Edit {selected.size}
            </button>
          </>
        )}
      </div>

      {/* Dialogs */}
      {dialogOpen && (
        <RuleDialog
          existing={editingRule}
          allModels={store.models}
          usedModels={usedModels}
          onSave={handleSave}
          onClose={() => setDialogOpen(false)}
        />
      )}
      {bulkEditOpen && (
        <BulkEditDialog
          count={selected.size}
          onApply={handleBulkApply}
          onClose={() => setBulkEditOpen(false)}
        />
      )}
    </div>
  );
};
