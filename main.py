"""
MyVMR — vPilot Model Match Rule Generator
"""

import os
import queue
import re
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext
from xml.dom import minidom
import xml.etree.ElementTree as ET
from collections import defaultdict

try:
    import ttkbootstrap as ttk
    from ttkbootstrap.constants import *
    _BOOTSTRAP = True
except ImportError:
    from tkinter import ttk
    _BOOTSTRAP = False

# ---------------------------------------------------------------------------
# Design tokens — mirror bav-livery-manager's palette
# ---------------------------------------------------------------------------
C_BG     = "#ffffff"
C_PANEL  = "#f8f9fa"
C_CARD   = "#ffffff"
C_BORDER = "#dee2e6"
C_TEXT   = "#212529"
C_MUTED  = "#6c757d"
C_ACCENT = "#4a9eff"
C_DANGER = "#dc3545"
C_OK     = "#28a745"


# ---------------------------------------------------------------------------
# MSFS Community folder detection
# ---------------------------------------------------------------------------

def _msfs_community():
    local = os.environ.get("LOCALAPPDATA", "")
    return os.path.join(local, "Packages",
                        "Microsoft.Limitless_8wekyb3d8bbwe",
                        "LocalCache", "Packages", "Community")

COMMUNITY = _msfs_community()

AUTO_DETECT_PATHS = {
    "fsltl":     os.path.join(COMMUNITY, "fsltl-traffic-base"),
    "fsltl_vmr": os.path.join(COMMUNITY, "fsltl-traffic-base", "FSLTL_Rules.vmr"),
    "aig":       os.path.join(COMMUNITY, "aig-aitraffic-oci"),
    "ivao":      os.path.join(COMMUNITY, "IVAO_MTL"),
    "jft":       os.path.join(COMMUNITY, "justflight-fstraffic-module"),
}


# ---------------------------------------------------------------------------
# CFG parsing
# ---------------------------------------------------------------------------

def parse_cfg_value(raw):
    raw = raw.strip()
    if raw.startswith('"'):
        end = raw.find('"', 1)
        return raw[1:end].strip() if end > 0 else raw[1:].strip()
    if raw.startswith("'"):
        end = raw.find("'", 1)
        return raw[1:end].strip() if end > 0 else raw[1:].strip()
    for sep in (";", "//"):
        idx = raw.find(sep)
        if idx >= 0:
            raw = raw[:idx]
    return raw.strip()


def parse_aircraft_cfg(filepath, ivao_mtl=False, jft=False):
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError:
        return []

    sections = []
    current_name = None
    current_data = {}
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith(";") or line.startswith("//"):
            continue
        m = re.match(r"^\[(.+)\]$", line)
        if m:
            if current_name is not None:
                sections.append((current_name, current_data))
            current_name = m.group(1).strip().lower()
            current_data = {}
        elif current_name is not None and "=" in line:
            key, _, val = line.partition("=")
            current_data[key.strip().lower()] = parse_cfg_value(val)
    if current_name is not None:
        sections.append((current_name, current_data))

    general_type     = None
    general_callsign = None
    if not ivao_mtl:
        for name, data in sections:
            if name == "general":
                val = data.get("icao_type_designator", "").strip().upper()
                if val:
                    general_type = val
                if jft:
                    cs = data.get("icao_airline", "").strip().upper()
                    if cs:
                        general_callsign = cs
                break

    liveries = []
    for name, data in sections:
        if not name.startswith("fltsim"):
            continue
        title = data.get("title", "").strip()
        if not title:
            continue

        if ivao_mtl:
            icao_type = data.get("ui_type", "").strip().upper() or None
            variation  = data.get("ui_variation", "")
            matches    = re.findall(r'\(([A-Z]{3})\)', variation)
            if not matches:
                m = re.search(r'\(([A-Z]{3})\s*$', variation)
                if m:
                    matches = [m.group(1)]
            callsign = matches[-1] if matches else None
        elif jft:
            sec_type  = data.get("icao_type_designator", "").strip().upper()
            icao_type = sec_type if sec_type else general_type
            sec_cs    = data.get("icao_airline", "").strip().upper()
            callsign  = sec_cs if sec_cs else general_callsign
        else:
            sec_type  = data.get("icao_type_designator", "").strip().upper()
            icao_type = sec_type if sec_type else general_type
            raw_cs    = data.get("atc_parking_codes", "").strip().upper()
            callsign  = re.split(r"[,;\s]", raw_cs)[0].strip() or None

        liveries.append({"title": title, "icao_type": icao_type, "callsign": callsign})

    return liveries


# ---------------------------------------------------------------------------
# Folder scanning
# ---------------------------------------------------------------------------

def scan_folder(folder, ivao_mtl, jft, airline_rules, model_sources, source_name, log,
                generic_out=None, dropped_out=None):
    cfg_count   = 0
    model_count = 0
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fname in files:
            if fname.lower() != "aircraft.cfg":
                continue
            liveries = parse_aircraft_cfg(os.path.join(root, fname), ivao_mtl, jft)
            if liveries:
                cfg_count += 1
            for liv in liveries:
                title, tp, cs = liv["title"], liv["icao_type"], liv["callsign"]
                if cs and len(cs) > 3:
                    cs = cs[:3]
                if not tp:
                    if dropped_out is not None:
                        dropped_out.append((title, "", cs or "", "no TypeCode"))
                    continue
                if not cs:
                    if ivao_mtl and generic_out is not None:
                        if title not in generic_out[tp]:
                            generic_out[tp].append(title)
                            model_count += 1
                    else:
                        if dropped_out is not None:
                            dropped_out.append((title, tp, "", "no CallsignPrefix"))
                    continue
                key = (cs, tp)
                if title not in airline_rules[key]:
                    airline_rules[key].append(title)
                    model_count += 1
                model_sources[key][title] = source_name
    log(f"    {cfg_count} aircraft.cfg file(s) found, {model_count} model name(s) added")


# ---------------------------------------------------------------------------
# FSLTL VMR parsing
# ---------------------------------------------------------------------------

def parse_fsltl_vmr(filepath):
    generic = {}
    airline = {}
    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
    except ET.ParseError as e:
        raise ValueError(f"Could not parse VMR file: {e}")

    for rule in root.findall("ModelMatchRule"):
        tc  = (rule.get("TypeCode") or "").strip()
        mn  = (rule.get("ModelName") or "").strip()
        cs  = (rule.get("CallsignPrefix") or "").strip()
        if not tc or not mn:
            continue
        models = [m.strip() for m in mn.split("//") if m.strip()]
        if cs:
            airline[(cs, tc)] = models
        else:
            generic[tc] = models

    return generic, airline


# ---------------------------------------------------------------------------
# VMR generation
# ---------------------------------------------------------------------------

def generate_vmr(airline_rules, generic_rules=None):
    root_el = ET.Element("ModelMatchRuleSet")

    if generic_rules:
        for tc in sorted(generic_rules):
            rule = ET.SubElement(root_el, "ModelMatchRule")
            rule.set("TypeCode", tc)
            rule.set("ModelName", "//".join(generic_rules[tc]))

    for (cs, tc) in sorted(airline_rules):
        rule = ET.SubElement(root_el, "ModelMatchRule")
        rule.set("CallsignPrefix", cs)
        rule.set("TypeCode", tc)
        rule.set("ModelName", "//".join(airline_rules[(cs, tc)]))

    raw    = ET.tostring(root_el, encoding="unicode")
    pretty = minidom.parseString(raw).toprettyxml(indent="  ")
    lines  = pretty.splitlines()
    lines[0] = '<?xml version="1.0" encoding="utf-8"?>'
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# UI helpers
# ---------------------------------------------------------------------------

def _section_header(parent, text: str):
    """Bold section label with a divider line."""
    frm = ttk.Frame(parent)
    frm.pack(fill="x", pady=(12, 4))
    ttk.Label(frm, text=text.upper(),
              font=("Segoe UI", 8, "bold")).pack(side="left")
    ttk.Separator(frm, orient="horizontal").pack(
        side="left", fill="x", expand=True, padx=(8, 0), pady=(1, 0))
    return frm


def _grid_section_header(parent, text: str, row: int):
    """Bold section label for grid layouts."""
    lbl = ttk.Label(parent, text=text.upper(), font=("Segoe UI", 8, "bold"))
    lbl.grid(row=row, column=0, columnspan=3, sticky="w", pady=(12, 2))


def _btn(parent, text, cmd, style="info", **kw):
    """Single button factory; falls back gracefully without ttkbootstrap."""
    if _BOOTSTRAP:
        return ttk.Button(parent, text=text, command=cmd,
                          bootstyle=style, **kw)
    return ttk.Button(parent, text=text, command=cmd, **kw)


# ---------------------------------------------------------------------------
# Add/Edit Rule dialog
# ---------------------------------------------------------------------------

class _RuleDialog(tk.Toplevel):
    def __init__(self, parent, all_models, existing=None):
        super().__init__(parent)
        self.title("Edit Rule" if existing else "Add Rule")
        self.resizable(True, True)
        self.minsize(580, 540)
        self.configure(bg=C_PANEL)
        self.grab_set()
        self.result = None
        self._all_models   = all_models
        self._search_after = None
        self._build(existing or {})
        self.wait_window()

    def _build(self, existing):
        pad = {"padx": 16, "pady": 5}

        # TypeCode
        row0 = ttk.Frame(self)
        row0.pack(fill="x", **pad)
        ttk.Label(row0, text="TypeCode", width=16, anchor="w").pack(side="left")
        self.var_tc = tk.StringVar(value=existing.get("typecode", ""))
        ttk.Entry(row0, textvariable=self.var_tc, width=14).pack(side="left")

        # CallsignPrefix
        row1 = ttk.Frame(self)
        row1.pack(fill="x", **pad)
        ttk.Label(row1, text="CallsignPrefix", width=16, anchor="w").pack(side="left")
        self.var_cs = tk.StringVar(value=existing.get("callsign", ""))
        ttk.Entry(row1, textvariable=self.var_cs, width=8).pack(side="left")
        ttk.Label(row1, text="  leave blank for TypeCode-only rule",
                  foreground=C_MUTED).pack(side="left")

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=16, pady=(6, 10))

        # Model search
        ttk.Label(self, text="MODEL NAME", font=("Segoe UI", 8, "bold"),
                  foreground=C_MUTED).pack(anchor="w", padx=16)

        srch_row = ttk.Frame(self)
        srch_row.pack(fill="x", padx=16, pady=(4, 0))
        ttk.Label(srch_row, text="Search:").pack(side="left")
        self.var_search = tk.StringVar()
        self.var_search.trace_add("write", self._on_search_trace)
        ttk.Entry(srch_row, textvariable=self.var_search).pack(
            side="left", fill="x", expand=True, padx=(8, 0))

        list_outer = ttk.Frame(self)
        list_outer.pack(fill="both", expand=True, padx=16, pady=(6, 0))
        self.listbox = tk.Listbox(
            list_outer, selectmode="single", activestyle="none",
            font=("Consolas", 9),
            bg=C_BG, fg=C_TEXT,
            selectbackground=C_ACCENT, selectforeground="#ffffff",
            highlightthickness=1, highlightbackground=C_BORDER,
            relief="flat", borderwidth=0)
        vsb = ttk.Scrollbar(list_outer, orient="vertical", command=self.listbox.yview)
        self.listbox.configure(yscrollcommand=vsb.set)
        vsb.pack(side="right", fill="y")
        self.listbox.pack(side="left", fill="both", expand=True)
        self.listbox.bind("<<ListboxSelect>>", self._on_list_select)
        self.listbox.bind("<Double-Button-1>", lambda _: self._ok())

        sel_row = ttk.Frame(self)
        sel_row.pack(fill="x", padx=16, pady=(8, 0))
        ttk.Label(sel_row, text="Selected:", width=10, anchor="w").pack(side="left")
        self.var_model = tk.StringVar(value=existing.get("model", ""))
        ttk.Entry(sel_row, textvariable=self.var_model).pack(
            side="left", fill="x", expand=True)

        self._populate(self._all_models)
        if existing.get("model"):
            self.var_search.set(existing["model"])

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=16, pady=(12, 0))
        btn_row = ttk.Frame(self)
        btn_row.pack(pady=12)
        _btn(btn_row, "OK",     self._ok,      "info", width=12).pack(side="left", padx=6)
        _btn(btn_row, "Cancel", self.destroy,  "info", width=12).pack(side="left", padx=6)

    def _populate(self, models):
        self.listbox.delete(0, tk.END)
        for m in models[:2000]:
            self.listbox.insert(tk.END, m)

    def _on_search_trace(self, *_):
        if self._search_after:
            self.after_cancel(self._search_after)
        self._search_after = self.after(120, self._do_search)

    def _do_search(self):
        q = self.var_search.get().lower()
        filtered = [m for m in self._all_models if q in m.lower()] if q else self._all_models
        self._populate(filtered)

    def _on_list_select(self, *_):
        sel = self.listbox.curselection()
        if sel:
            self.var_model.set(self.listbox.get(sel[0]))

    def _ok(self):
        tc    = self.var_tc.get().strip().upper()
        cs    = self.var_cs.get().strip().upper()
        model = self.var_model.get().strip()
        if not tc:
            messagebox.showwarning("Required", "TypeCode is required.", parent=self)
            return
        if not model:
            messagebox.showwarning("Required", "Model Name is required.", parent=self)
            return
        if cs and len(cs) > 3:
            messagebox.showwarning("Invalid",
                                   "CallsignPrefix must be 3 characters or fewer.",
                                   parent=self)
            return
        self.result = {"typecode": tc, "callsign": cs, "model": model}
        self.destroy()


# ---------------------------------------------------------------------------
# Custom Rules tab
# ---------------------------------------------------------------------------

class CustomRulesTab(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self._models_cache: list[str] | None = None
        self._scan_queue   = queue.Queue()
        self._scanning     = False
        self._data: list[tuple[str, str, str]] = []
        self._sort_col     = None
        self._sort_reverse = False
        self._filter_after = None
        self._build_ui()

    # ------------------------------------------------------------------
    # UI
    # ------------------------------------------------------------------

    def _build_ui(self):
        # ---- Top bar ----
        top = ttk.Frame(self)
        top.pack(fill="x", padx=14, pady=(12, 6))

        _btn(top, "Load VMR to Edit…", self._load_vmr,
             "info").pack(side="left", padx=(0, 8))

        self._status_lbl = ttk.Label(top,
                                     text="Model list not loaded — click Load Models to search liveries.",
                                     foreground=C_MUTED)
        self._status_lbl.pack(side="left")

        self._load_models_btn = _btn(top, "Load Models from Community", self._start_load,
                                     "info")
        self._load_models_btn.pack(side="right")

        # ---- Filter bar ----
        fbar = ttk.Frame(self)
        fbar.pack(fill="x", padx=14, pady=(0, 6))
        ttk.Label(fbar, text="Filter:", foreground=C_MUTED).pack(side="left")
        self.var_filter = tk.StringVar()
        self.var_filter.trace_add("write", self._on_filter_trace)
        ttk.Entry(fbar, textvariable=self.var_filter).pack(
            side="left", fill="x", expand=True, padx=(8, 6))
        _btn(fbar, "✕", lambda: self.var_filter.set(""),
             "info", width=3).pack(side="left")
        self._filter_lbl = ttk.Label(fbar, text="", foreground=C_MUTED,
                                     width=22, anchor="e")
        self._filter_lbl.pack(side="left", padx=(10, 0))

        # ---- Table ----
        tree_outer = ttk.Frame(self)
        tree_outer.pack(fill="both", expand=True, padx=14, pady=(0, 6))

        cols = ("TypeCode", "CallsignPrefix", "ModelName")
        self.tree = ttk.Treeview(tree_outer, columns=cols, show="headings",
                                  selectmode="browse")
        self.tree.tag_configure("odd",  background="#f8f9fa")
        self.tree.tag_configure("even", background="#ffffff")

        for col in cols:
            self.tree.heading(col, text=col,
                              command=lambda c=col: self._sort_by(c))
        self.tree.column("TypeCode",       width=90,  minwidth=70,  stretch=False)
        self.tree.column("CallsignPrefix", width=120, minwidth=80,  stretch=False)
        self.tree.column("ModelName",      width=530, minwidth=200, stretch=True)

        vsb = ttk.Scrollbar(tree_outer, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        vsb.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)
        self.tree.bind("<Double-Button-1>", lambda _: self._edit_rule())

        # ---- Action buttons ----
        bot = ttk.Frame(self)
        bot.pack(fill="x", padx=14, pady=(0, 14))

        _btn(bot, "＋  Add Rule",    self._add_rule,    "success-outline").pack(side="left", padx=(0, 6))
        _btn(bot, "✎  Edit Rule",   self._edit_rule,   "info-outline").pack(side="left", padx=(0, 6))
        _btn(bot, "✕  Delete Rule", self._delete_rule, "danger-outline").pack(side="left")

        ttk.Label(bot,
                  text="Custom rules are merged into the VMR on generation.",
                  foreground=C_MUTED).pack(side="right")

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------

    def _start_load(self):
        if self._scanning:
            return
        self._scanning = True
        self._load_models_btn.configure(state="disabled", text="Scanning…")
        self._status_lbl.configure(
            text="Scanning Community folder for liveries…", foreground=C_MUTED)
        threading.Thread(target=self._scan_worker, daemon=True).start()
        self._poll_scan()

    def _scan_worker(self):
        models = set()
        if os.path.isdir(COMMUNITY):
            for root, dirs, files in os.walk(COMMUNITY):
                dirs[:] = [d for d in dirs if not d.startswith(".")]
                for fname in files:
                    if fname.lower() != "aircraft.cfg":
                        continue
                    try:
                        with open(os.path.join(root, fname), "r",
                                  encoding="utf-8", errors="replace") as f:
                            content = f.read()
                    except OSError:
                        continue
                    in_fltsim = False
                    for line in content.splitlines():
                        line = line.strip()
                        if not line or line.startswith(";") or line.startswith("//"):
                            continue
                        sec = re.match(r"^\[(.+)\]$", line)
                        if sec:
                            in_fltsim = sec.group(1).strip().lower().startswith("fltsim")
                        elif in_fltsim and line.lower().startswith("title"):
                            m = re.match(r"^title\s*=\s*(.+)$", line, re.IGNORECASE)
                            if m:
                                title = parse_cfg_value(m.group(1))
                                if title:
                                    models.add(title)
        self._scan_queue.put(sorted(models))

    def _poll_scan(self):
        try:
            result = self._scan_queue.get_nowait()
            self._models_cache = result
            self._scanning = False
            self._load_models_btn.configure(state="normal", text="Reload Models")
            self._status_lbl.configure(
                text=f"{len(result):,} model names loaded from Community folder.",
                foreground=C_OK)
        except queue.Empty:
            self.after(150, self._poll_scan)

    def _get_models(self):
        return self._models_cache or []

    # ------------------------------------------------------------------
    # Tree refresh
    # ------------------------------------------------------------------

    def _refresh_tree(self, view: list[tuple[str, str, str]]):
        self.tree.delete(*self.tree.get_children())
        for i, row in enumerate(view):
            tag = "odd" if i % 2 else "even"
            self.tree.insert("", tk.END, values=row, tags=(tag,))

    # ------------------------------------------------------------------
    # Filter
    # ------------------------------------------------------------------

    def _on_filter_trace(self, *_):
        if self._filter_after:
            self.after_cancel(self._filter_after)
        self._filter_after = self.after(150, self._apply_filter)

    def _apply_filter(self, *_):
        q = self.var_filter.get().lower().strip()
        view = [r for r in self._data if q in (r[0] + r[1] + r[2]).lower()] if q else list(self._data)
        self._refresh_tree(view)
        total = len(self._data)
        shown = len(view)
        self._filter_lbl.configure(
            text=f"{shown:,} of {total:,} shown" if q else f"{total:,} rules")

    # ------------------------------------------------------------------
    # Sort
    # ------------------------------------------------------------------

    def _sort_by(self, col: str):
        col_idx = {"TypeCode": 0, "CallsignPrefix": 1, "ModelName": 2}[col]
        if self._sort_col == col:
            self._sort_reverse = not self._sort_reverse
        else:
            self._sort_col     = col
            self._sort_reverse = False

        self._data.sort(key=lambda r: r[col_idx].lower(), reverse=self._sort_reverse)

        for c in ("TypeCode", "CallsignPrefix", "ModelName"):
            arrow = (" ▼" if self._sort_reverse else " ▲") if c == col else ""
            self.tree.heading(c, text=c + arrow,
                              command=lambda _c=c: self._sort_by(_c))
        self._apply_filter()

    # ------------------------------------------------------------------
    # Load VMR
    # ------------------------------------------------------------------

    def _load_vmr(self):
        path = filedialog.askopenfilename(
            filetypes=[("VMR files", "*.vmr"), ("All files", "*.*")])
        if not path:
            return
        try:
            generic, airline = parse_fsltl_vmr(path)
        except (ValueError, OSError) as e:
            messagebox.showerror("Error", f"Could not read VMR:\n{e}")
            return

        if self._data:
            answer = messagebox.askyesnocancel(
                "Load VMR",
                f"The table already has {len(self._data)} row(s).\n\n"
                "Yes — Replace all existing rows\n"
                "No — Append to existing rows")
            if answer is None:
                return
            if answer:
                self._data.clear()
                self.var_filter.set("")

        for tc in sorted(generic):
            for model in generic[tc]:
                self._data.append((tc, "", model))
        for (cs, tc) in sorted(airline):
            for model in airline[(cs, tc)]:
                self._data.append((tc, cs, model))

        self._apply_filter()

    # ------------------------------------------------------------------
    # Rule actions
    # ------------------------------------------------------------------

    def _used_models(self, exclude_row=None):
        return {r[2] for r in self._data if r[2] and r != exclude_row}

    def _available_models(self, exclude_row=None):
        used = self._used_models(exclude_row)
        return [m for m in self._get_models() if m not in used]

    def _add_rule(self):
        if self._models_cache is None and os.path.isdir(COMMUNITY):
            if messagebox.askyesno(
                    "Load Models",
                    "Model list not loaded yet. Load it now?\n"
                    "(You can still type a model name manually.)"):
                self._start_load()
        dlg = _RuleDialog(self, self._available_models())
        if dlg.result:
            r = dlg.result
            self._data.append((r["typecode"], r["callsign"], r["model"]))
            self._apply_filter()

    def _edit_rule(self):
        sel = self.tree.selection()
        if not sel:
            return
        vals    = self.tree.item(sel[0], "values")
        old_row = (vals[0], vals[1], vals[2])
        dlg     = _RuleDialog(self, self._available_models(exclude_row=old_row),
                              {"typecode": vals[0], "callsign": vals[1], "model": vals[2]})
        if dlg.result:
            r   = dlg.result
            idx = next((i for i, d in enumerate(self._data) if d == old_row), None)
            if idx is not None:
                self._data[idx] = (r["typecode"], r["callsign"], r["model"])
            self._apply_filter()

    def _delete_rule(self):
        sel = self.tree.selection()
        if not sel:
            return
        vals = self.tree.item(sel[0], "values")
        row  = (vals[0], vals[1], vals[2])
        idx  = next((i for i, d in enumerate(self._data) if d == row), None)
        if idx is not None:
            self._data.pop(idx)
        self._apply_filter()

    def get_rules(self):
        return [{"typecode": r[0], "callsign": r[1], "model": r[2]} for r in self._data]


# ---------------------------------------------------------------------------
# Main application
# ---------------------------------------------------------------------------

class App(ttk.Window if _BOOTSTRAP else tk.Tk):
    def __init__(self):
        if _BOOTSTRAP:
            super().__init__(themename="flatly")
        else:
            super().__init__()
        self.title("MyVMR — vPilot Model Match Rule Generator")
        self.resizable(True, True)
        self.minsize(800, 740)
        self._build_ui()

    # ------------------------------------------------------------------
    # Brand header
    # ------------------------------------------------------------------

    def _build_header(self):
        hdr = tk.Frame(self, bg=C_PANEL, height=58)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)

        # Thin accent line at bottom of header
        tk.Frame(hdr, bg=C_BORDER, height=1).place(relx=0, rely=1.0,
                                                    anchor="sw", relwidth=1)

        inner = tk.Frame(hdr, bg=C_PANEL)
        inner.place(relx=0.5, rely=0.5, anchor="center")

        tk.Label(inner, text="MyVMR", bg=C_PANEL, fg=C_TEXT,
                 font=("Segoe UI", 18, "bold")).pack(side="left")

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _build_ui(self):
        self._build_header()

        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=8, pady=(6, 8))

        tab1 = ttk.Frame(nb, padding=6)
        nb.add(tab1, text="  Generate VMR  ")
        self._build_generate_tab(tab1)

        self.custom_tab = CustomRulesTab(nb)
        nb.add(self.custom_tab, text="  Custom Rules  ")

    # ------------------------------------------------------------------
    # Generate tab
    # ------------------------------------------------------------------

    def _build_generate_tab(self, parent):
        # ---- Folders & Files card ----
        folders_card = ttk.LabelFrame(parent, text="Folders & Files")
        folders_card.pack(fill="x", pady=(2, 8))
        fc = ttk.Frame(folders_card)
        fc.pack(fill="x", padx=12, pady=8)
        fc.columnconfigure(1, weight=1)

        _btn(fc, "⚡  Auto-Detect Paths", self._auto_detect,
             "info").grid(row=0, column=0, columnspan=3, sticky="w", pady=(0, 8))

        _grid_section_header(fc, "Required", 1)

        self._fsltl_lbl = ttk.Label(fc, text="FSLTL Traffic Base", anchor="w",
                                    width=22, foreground="#e05252")
        self._fsltl_lbl.grid(row=2, column=0, sticky="w", padx=(0, 8), pady=3)
        self.var_fsltl    = tk.StringVar()
        self._fsltl_entry = ttk.Entry(fc, textvariable=self.var_fsltl)
        self._fsltl_entry.grid(row=2, column=1, sticky="ew", pady=3)
        self._fsltl_btn = _btn(fc, "Browse…",
                               lambda: self._pick_folder(self.var_fsltl),
                               "info", width=9)
        self._fsltl_btn.grid(row=2, column=2, padx=(8, 0), pady=3)

        self._fsltl_vmr_lbl = ttk.Label(fc, text="FSLTL VMR File", anchor="w",
                                        width=22, foreground="#e05252")
        self._fsltl_vmr_lbl.grid(row=3, column=0, sticky="w", padx=(0, 8), pady=3)
        self.var_fsltl_vmr    = tk.StringVar()
        self._fsltl_vmr_entry = ttk.Entry(fc, textvariable=self.var_fsltl_vmr)
        self._fsltl_vmr_entry.grid(row=3, column=1, sticky="ew", pady=3)
        self._fsltl_vmr_btn = _btn(
            fc, "Browse…", width=9,
            cmd=lambda: self._pick_file(self.var_fsltl_vmr,
                                        [("VMR files", "*.vmr"), ("All files", "*.*")]),
            style="info")
        self._fsltl_vmr_btn.grid(row=3, column=2, padx=(8, 0), pady=3)

        self.var_skip_fsltl = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            fc,
            text="Skip FSLTL — I understand some generic models may be missing",
            variable=self.var_skip_fsltl,
            command=self._on_skip_fsltl_toggle,
        ).grid(row=4, column=0, columnspan=3, sticky="w", pady=(6, 2))

        _grid_section_header(fc, "Optional", 5)
        self.var_aig  = self._folder_row(fc, "AIG OCI",              6)
        self.var_ivao = self._folder_row(fc, "IVAO_MTL",             7)
        self.var_jft  = self._folder_row(fc, "JustFlight FSTraffic", 8)

        _grid_section_header(fc, "Output", 9)
        ttk.Label(fc, text="Output VMR File", anchor="w", width=22).grid(
            row=10, column=0, sticky="w", padx=(0, 8), pady=3)
        self.var_out = tk.StringVar(value=os.path.expanduser("~/generated.vmr"))
        ttk.Entry(fc, textvariable=self.var_out).grid(row=10, column=1, sticky="ew", pady=3)
        _btn(fc, "Browse…", self._pick_output,
             "info", width=9).grid(row=10, column=2, padx=(8, 0), pady=3)

        # ---- Preference card ----
        pref_card = ttk.LabelFrame(parent, text="Model Provider Preference")
        pref_card.pack(fill="x", pady=(0, 8))
        pc = ttk.Frame(pref_card)
        pc.pack(fill="x", padx=12, pady=8)

        ttk.Label(pc,
                  text="Where a TypeCode+Callsign match exists in the preferred provider, "
                       "all other providers' models are removed.",
                  foreground=C_MUTED).pack(anchor="w")

        self.var_preference = tk.StringVar(value="none")
        radio_row = ttk.Frame(pc)
        radio_row.pack(anchor="w", pady=(8, 0))

        ttk.Radiobutton(radio_row, text="No preference",
                        variable=self.var_preference, value="none").pack(side="left", padx=(0, 16))
        self._pref_fsltl_btn = ttk.Radiobutton(radio_row, text="FSLTL",
                                                variable=self.var_preference, value="fsltl")
        self._pref_fsltl_btn.pack(side="left", padx=16)
        self._pref_aig_btn = ttk.Radiobutton(radio_row, text="AIG OCI",
                                              variable=self.var_preference, value="aig")
        self._pref_aig_btn.pack(side="left", padx=16)
        ttk.Radiobutton(radio_row, text="IVAO_MTL",
                        variable=self.var_preference, value="ivao").pack(side="left", padx=16)
        ttk.Radiobutton(radio_row, text="JustFlight FSTraffic",
                        variable=self.var_preference, value="jft").pack(side="left", padx=16)

        # ---- Generate button ----
        gen_row = ttk.Frame(parent)
        gen_row.pack(fill="x", pady=(0, 6))
        _btn(gen_row, "  Generate VMR  ", self._generate,
             "info").pack(ipadx=16, ipady=5)

        # ---- Log ----
        ttk.Label(parent, text="LOG", font=("Segoe UI", 8, "bold"),
                  foreground=C_MUTED).pack(anchor="w", pady=(4, 2))
        self.log_box = scrolledtext.ScrolledText(
            parent, height=10, state="disabled", wrap="word",
            font=("Consolas", 9),
            bg=C_PANEL, fg=C_TEXT,
            insertbackground=C_TEXT,
            selectbackground=C_ACCENT,
            relief="flat", borderwidth=0)
        self.log_box.pack(fill="both", expand=True)

    # ------------------------------------------------------------------
    # Row helper
    # ------------------------------------------------------------------

    def _folder_row(self, parent, label, row):
        ttk.Label(parent, text=label, anchor="w", width=22).grid(
            row=row, column=0, sticky="w", padx=(0, 8), pady=3)
        var = tk.StringVar()
        ttk.Entry(parent, textvariable=var).grid(row=row, column=1, sticky="ew", pady=3)
        _btn(parent, "Browse…", lambda v=var: self._pick_folder(v),
             "info", width=9).grid(row=row, column=2, padx=(8, 0), pady=3)
        return var

    # ------------------------------------------------------------------
    # Skip-FSLTL toggle
    # ------------------------------------------------------------------

    def _on_skip_fsltl_toggle(self):
        skip  = self.var_skip_fsltl.get()
        state = "disabled" if skip else "normal"
        fg    = C_MUTED    if skip else "#e05252"
        if skip:
            self.var_fsltl.set("")
            self.var_fsltl_vmr.set("")
            if self.var_preference.get() == "fsltl":
                self.var_preference.set("none")
            self._pref_fsltl_btn.pack_forget()
        else:
            self._pref_fsltl_btn.pack(side="left", padx=16,
                                      before=self._pref_aig_btn)
        self._fsltl_lbl.configure(foreground=fg)
        self._fsltl_entry.configure(state=state)
        self._fsltl_btn.configure(state=state)
        self._fsltl_vmr_lbl.configure(foreground=fg)
        self._fsltl_vmr_entry.configure(state=state)
        self._fsltl_vmr_btn.configure(state=state)

    # ------------------------------------------------------------------
    # Auto-detect
    # ------------------------------------------------------------------

    def _auto_detect(self):
        var_map = {
            "fsltl":     self.var_fsltl,
            "fsltl_vmr": self.var_fsltl_vmr,
            "aig":       self.var_aig,
            "ivao":      self.var_ivao,
            "jft":       self.var_jft,
        }
        labels = {
            "fsltl":     "FSLTL Traffic Base",
            "fsltl_vmr": "FSLTL VMR File",
            "aig":       "AIG OCI",
            "ivao":      "IVAO_MTL",
            "jft":       "JustFlight FSTraffic",
        }
        missing = []
        for key, path in AUTO_DETECT_PATHS.items():
            if self.var_skip_fsltl.get() and key in ("fsltl", "fsltl_vmr"):
                continue
            if os.path.exists(path):
                var_map[key].set(path)
            else:
                missing.append(f"  {labels[key]}:\n    {path}")

        if missing:
            messagebox.showinfo(
                "Auto-Detect",
                "The following paths were not found — please enter them manually:\n\n"
                + "\n\n".join(missing))

    # ------------------------------------------------------------------
    # File / folder pickers
    # ------------------------------------------------------------------

    def _pick_folder(self, var):
        path = filedialog.askdirectory()
        if path:
            var.set(path)

    def _pick_file(self, var, filetypes):
        path = filedialog.askopenfilename(filetypes=filetypes)
        if path:
            var.set(path)

    def _pick_output(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".vmr",
            filetypes=[("VMR files", "*.vmr"), ("All files", "*.*")],
            initialfile="generated.vmr",
        )
        if path:
            self.var_out.set(path)

    # ------------------------------------------------------------------
    # Log helper
    # ------------------------------------------------------------------

    def _log(self, msg):
        self.log_box.configure(state="normal")
        self.log_box.insert(tk.END, msg + "\n")
        self.log_box.see(tk.END)
        self.log_box.configure(state="disabled")
        self.update_idletasks()

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------

    def _generate(self):
        fsltl_folder = self.var_fsltl.get().strip()
        aig_folder   = self.var_aig.get().strip()
        ivao_folder  = self.var_ivao.get().strip()
        jft_folder   = self.var_jft.get().strip()
        fsltl_vmr    = self.var_fsltl_vmr.get().strip()
        out_path     = self.var_out.get().strip()
        skip_fsltl   = self.var_skip_fsltl.get()

        if not skip_fsltl and not fsltl_folder:
            messagebox.showwarning("Required", "FSLTL Traffic Base folder is required.")
            return
        if not skip_fsltl and not fsltl_vmr:
            messagebox.showwarning("Required", "FSLTL VMR File is required.")
            return
        if not out_path:
            messagebox.showwarning("Required", "Please specify an output file.")
            return

        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", tk.END)
        self.log_box.configure(state="disabled")

        airline_rules = defaultdict(list)
        model_sources = defaultdict(dict)
        ivao_generic  = defaultdict(list)
        dropped       = {"FSLTL": [], "AIG OCI": [], "IVAO_MTL": [], "JustFlight": []}

        self._log("=== Pass 1: Scanning folders ===")

        if fsltl_folder:
            self._log(f"FSLTL Traffic Base: {fsltl_folder}")
            scan_folder(fsltl_folder, False, False, airline_rules, model_sources,
                        "FSLTL", self._log, dropped_out=dropped["FSLTL"])
        if aig_folder:
            self._log(f"AIG OCI: {aig_folder}")
            scan_folder(aig_folder, False, False, airline_rules, model_sources,
                        "AIG OCI", self._log, dropped_out=dropped["AIG OCI"])
        if ivao_folder:
            self._log(f"IVAO_MTL: {ivao_folder}")
            scan_folder(ivao_folder, True, False, airline_rules, model_sources,
                        "IVAO_MTL", self._log, ivao_generic, dropped_out=dropped["IVAO_MTL"])
        if jft_folder:
            self._log(f"JustFlight FSTraffic: {jft_folder}")
            scan_folder(jft_folder, False, True, airline_rules, model_sources,
                        "JustFlight", self._log, dropped_out=dropped["JustFlight"])

        self._log(f"\nPass 1 total: {len(airline_rules)} (CallsignPrefix+TypeCode) pair(s)")

        preferred   = self.var_preference.get()
        pref_labels = {"fsltl": "FSLTL", "aig": "AIG OCI", "ivao": "IVAO_MTL", "jft": "JustFlight"}
        if preferred != "none":
            pref_source    = pref_labels[preferred]
            self._log(f"\n=== Applying preference: {pref_source} ===")
            removed_models = 0
            for key in airline_rules:
                cs_key, tc_key = key
                sources     = model_sources[key]
                pref_models = [m for m in airline_rules[key] if sources.get(m) == pref_source]
                if pref_models:
                    for m in airline_rules[key]:
                        if sources.get(m) != pref_source:
                            src = sources.get(m, "")
                            if src in dropped:
                                dropped[src].append(
                                    (m, tc_key, cs_key,
                                     f"preference filter ({pref_source} preferred)"))
                    removed_models += len(airline_rules[key]) - len(pref_models)
                    airline_rules[key] = pref_models
            self._log(f"  {removed_models} non-preferred model(s) removed where {pref_source} has coverage")

        generic_rules = {}
        if skip_fsltl:
            self._log("\n(Pass 2 skipped — FSLTL VMR not used)")
        else:
            self._log("\n=== Pass 2: Merging FSLTL VMR ===")
            try:
                fsltl_generic, fsltl_airline = parse_fsltl_vmr(fsltl_vmr)
                generic_rules = dict(fsltl_generic)
                self._log(f"  {len(generic_rules)} generic (TypeCode-only) rule(s) added from FSLTL VMR")
                added = skipped = 0
                for (cs, tc), models in fsltl_airline.items():
                    if (cs, tc) not in airline_rules:
                        airline_rules[(cs, tc)] = models
                        added += 1
                    else:
                        skipped += 1
                self._log(f"  {added} (CallsignPrefix+TypeCode) rule(s) added from FSLTL VMR")
                self._log(f"  {skipped} already covered by our scan — FSLTL entries ignored")
            except (ValueError, OSError) as e:
                self._log(f"  WARNING: Could not read FSLTL VMR — {e}")

        if ivao_generic:
            added_generic = 0
            for tc, models in ivao_generic.items():
                for m in models:
                    if m not in generic_rules.get(tc, []):
                        generic_rules.setdefault(tc, []).append(m)
                        added_generic += 1
            self._log(f"\n  {added_generic} TypeCode-only IVAO_MTL model(s) added as generic rules")

        custom_rules = self.custom_tab.get_rules()
        if custom_rules:
            self._log(f"\n=== Merging {len(custom_rules)} custom rule(s) ===")
            for r in custom_rules:
                tc = r["typecode"]; cs = r["callsign"]; model = r["model"]
                if cs:
                    key = (cs, tc)
                    if model not in airline_rules[key]:
                        airline_rules[key].append(model)
                else:
                    if model not in generic_rules.get(tc, []):
                        generic_rules.setdefault(tc, []).append(model)

        airline_rules = dict(airline_rules)
        dupes = 0
        for key in airline_rules:
            before = len(airline_rules[key])
            airline_rules[key] = list(dict.fromkeys(airline_rules[key]))
            dupes += before - len(airline_rules[key])
        for tc in generic_rules:
            before = len(generic_rules[tc])
            generic_rules[tc] = list(dict.fromkeys(generic_rules[tc]))
            dupes += before - len(generic_rules[tc])
        if dupes:
            self._log(f"\nSanity check: removed {dupes} duplicate model name(s)")

        self._log(f"\nFinal total: {len(generic_rules)} generic + {len(airline_rules)} airline rule(s)")

        all_output_models = set()
        for models in airline_rules.values():
            all_output_models.update(models)
        for models in generic_rules.values():
            all_output_models.update(models)

        recovered = 0
        for source in dropped:
            before = len(dropped[source])
            dropped[source] = [(t, tp, cs, r) for t, tp, cs, r in dropped[source]
                               if t not in all_output_models]
            recovered += before - len(dropped[source])
        if recovered:
            self._log(f"\n  {recovered} skipped model(s) were added via FSLTL VMR / custom rules"
                      " — removed from debug report")

        total_dropped = sum(len(v) for v in dropped.values())
        if total_dropped:
            self._log(f"\n=== Debug: {total_dropped} livery/liveries not added ===")
            for source, entries in dropped.items():
                if not entries:
                    continue
                reason_counts = defaultdict(int)
                for _, _, _, reason in entries:
                    reason_counts[reason] += 1
                self._log(f"  {source}: {len(entries)} skipped")
                for reason, count in sorted(reason_counts.items(), key=lambda x: -x[1]):
                    self._log(f"    {reason}: {count}")

            debug_path = out_path + ".dropped.txt"
            try:
                with open(debug_path, "w", encoding="utf-8") as df:
                    df.write("Debug Report — Liveries Not Added\n")
                    df.write(f"VMR: {out_path}\n")
                    df.write("NOTE: This report covers only the 4 configured source folders "
                             "(FSLTL, AIG, IVAO_MTL, JustFlight).\n"
                             "      Models from other Community packages are not processed "
                             "by this tool and will not appear here.\n\n")
                    for source, entries in dropped.items():
                        if not entries:
                            continue
                        df.write(f"=== {source} ({len(entries)}) ===\n")
                        df.write(f"{'Title':<55} {'TypeCode':<10} {'Callsign':<14} Reason\n")
                        df.write("-" * 100 + "\n")
                        for title, tp, cs, reason in sorted(entries, key=lambda x: x[3]):
                            df.write(f"{title:<55} {tp:<10} {cs:<14} {reason}\n")
                        df.write("\n")
                self._log(f"  Full report: {debug_path}")
            except OSError as e:
                self._log(f"  Could not save debug report: {e}")

        if not airline_rules and not generic_rules:
            self._log("Nothing to write.")
            return

        vmr_xml = generate_vmr(airline_rules, generic_rules)
        try:
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(vmr_xml)
            self._log(f"\nVMR written to: {out_path}")
            messagebox.showinfo("Done", f"VMR saved to:\n{out_path}")
        except OSError as e:
            self._log(f"Error writing file: {e}")
            messagebox.showerror("Error", str(e))


if __name__ == "__main__":
    app = App()
    app.mainloop()
