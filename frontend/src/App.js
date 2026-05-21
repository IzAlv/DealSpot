import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';

import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import TradesPage from './pages/TradesPage';
import NewTradePage from './pages/NewTradePage';
import PartnersPage from './pages/PartnersPage';
import VesselsPage from './pages/VesselsPage';
import VesselExecutionPage from './pages/VesselExecutionPage';
import CalendarPage from './pages/CalendarPage';
import CommissionsPage from './pages/CommissionsPage';
import AccountingPage from './pages/AccountingPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import TradeDetailPage from './pages/TradeDetailPage';
import BusinessCardsPage from './pages/BusinessCardsPage';
import PortLineupsPage from './pages/PortLineupsPage';
import MarketDataPage from './pages/MarketDataPage';
import DocInstructionsPage from './pages/DocInstructionsPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/trades" element={<TradesPage />} />
            <Route path="/trades/new" element={<NewTradePage />} />
            <Route path="/trades/:tradeId/edit" element={<NewTradePage />} />
            <Route path="/trades/:tradeId" element={<TradeDetailPage />} />
            <Route path="/partners" element={<PartnersPage />} />
            <Route path="/partners/sellers" element={<PartnersPage filterType="seller" />} />
            <Route path="/partners/buyers" element={<PartnersPage filterType="buyer" />} />
            <Route path="/partners/co-brokers" element={<PartnersPage filterType="co-broker" />} />
            <Route path="/vessels" element={<VesselsPage />} />
            <Route path="/documents" element={<VesselExecutionPage />} />
            <Route path="/documents/:tradeId" element={<VesselExecutionPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/commissions" element={<CommissionsPage />} />
            <Route path="/omega" element={<AccountingPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/business-cards" element={<BusinessCardsPage />} />
            <Route path="/port-lineups" element={<PortLineupsPage />} />
            <Route path="/market-data" element={<MarketDataPage />} />
            <Route path="/doc-instructions" element={<DocInstructionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/trades" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
