import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { GeneratePage } from './pages/GeneratePage';
import { CustomRulesPage } from './pages/CustomRulesPage';
import { HelpPage } from './pages/HelpPage';

export const App = () => (
  <HashRouter>
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/generate" replace />} />
        <Route path="generate" element={<GeneratePage />} />
        <Route path="custom-rules" element={<CustomRulesPage />} />
        <Route path="help" element={<HelpPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/generate" replace />} />
    </Routes>
  </HashRouter>
);
