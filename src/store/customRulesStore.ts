import { create } from 'zustand';

export interface Rule {
  typecode: string;
  callsign: string;
  model: string;
}

interface CustomRulesState {
  filePath: string | null;
  rules: Rule[];
  models: string[];
  modelsLoaded: boolean;
  modelsLoading: boolean;
  setFilePath: (path: string | null) => void;
  setRules: (rules: Rule[]) => void;
  addRule: (rule: Rule) => void;
  updateRule: (index: number, rule: Rule) => void;
  deleteRule: (index: number) => void;
  setModels: (models: string[]) => void;
  setModelsLoading: (loading: boolean) => void;
}

export const useCustomRulesStore = create<CustomRulesState>((set) => ({
  filePath: null,
  rules: [],
  models: [],
  modelsLoaded: false,
  modelsLoading: false,
  setFilePath: (filePath) => set({ filePath }),
  setRules: (rules) => set({ rules }),
  addRule: (rule) => set((s) => ({ rules: [...s.rules, rule] })),
  updateRule: (index, rule) => set((s) => {
    const rules = [...s.rules];
    rules[index] = rule;
    return { rules };
  }),
  deleteRule: (index) => set((s) => ({ rules: s.rules.filter((_, i) => i !== index) })),
  setModels: (models) => set({ models, modelsLoaded: true, modelsLoading: false }),
  setModelsLoading: (loading) => set({ modelsLoading: loading }),
}));
