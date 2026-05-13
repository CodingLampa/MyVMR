import { create } from 'zustand';

export interface Rule {
  typecode: string;
  callsign: string;
  model: string;
}

interface CustomRulesState {
  rules: Rule[];
  models: string[];
  modelsLoaded: boolean;
  modelsLoading: boolean;
  setRules: (rules: Rule[]) => void;
  addRule: (rule: Rule) => void;
  updateRule: (index: number, rule: Rule) => void;
  deleteRule: (index: number) => void;
  setModels: (models: string[]) => void;
  setModelsLoading: (loading: boolean) => void;
}

export const useCustomRulesStore = create<CustomRulesState>((set) => ({
  rules: [],
  models: [],
  modelsLoaded: false,
  modelsLoading: false,
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
