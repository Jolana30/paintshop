import { useState, useEffect } from 'react';
import { StockProvider, useStock } from './context/StockContext';
import Navigation from './components/Navigation';
import AuthPage from './pages/AuthPage';
import AdminPage from './pages/AdminPage';
import Dashboard from './pages/Dashboard';
import NewSale from './pages/NewSale';
import StockIn from './pages/StockIn';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import './App.css';

function MainLayout() {
  const { currentShop, setCurrentShop, toast } = useStock();

  const [activeTab, setActiveTabState] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['dashboard', 'newsale', 'stockin', 'inventory', 'sales', 'reports', 'admin'];
    if (validTabs.includes(hash)) return hash;

    const saved = sessionStorage.getItem('jotun_active_tab');
    if (validTabs.includes(saved)) return saved;

    return 'dashboard';
  });

  const [stockInProductId, setStockInProductId] = useState(null);
  const [salesFilterDate, setSalesFilterDate] = useState('');

  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    sessionStorage.setItem('jotun_active_tab', tab);
    window.location.hash = tab;
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const validTabs = ['dashboard', 'newsale', 'stockin', 'inventory', 'sales', 'reports', 'admin'];
      if (validTabs.includes(hash)) {
        setActiveTabState(hash);
        sessionStorage.setItem('jotun_active_tab', hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectStockIn = (prodId) => {
    setStockInProductId(prodId);
  };

  const handleViewSalesForDate = (dateStr) => {
    setSalesFilterDate(dateStr);
    setActiveTab('sales');
  };

  // Dedicated Platform Admin Console View (Accessible via #admin or clicking Admin anywhere)
  if (activeTab === 'admin') {
    return (
      <div className="admin-shell">
        <AdminPage
          onBackToApp={() => {
            if (currentShop && currentShop.status === 'active') {
              setActiveTab('dashboard');
            } else {
              setActiveTab('dashboard');
              window.location.hash = '';
            }
          }}
          onSelectShop={(shop) => {
            setCurrentShop(shop);
            if (shop.status === 'active') {
              setActiveTab('dashboard');
            }
          }}
        />
        {toast && (
          <div className={`toast-notification toast-${toast.type}`}>
            <div className="toast-dot"></div>
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    );
  }

  // If user is not logged into any shop, or shop is pending approval, render Auth Portal
  if (!currentShop || currentShop.status === 'pending_approval') {
    return (
      <div className="auth-shell">
        <AuthPage onOpenAdmin={() => setActiveTab('admin')} />
        {toast && (
          <div className={`toast-notification toast-${toast.type}`}>
            <div className="toast-dot"></div>
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="main-viewport">
        {activeTab === 'dashboard' && (
          <Dashboard
            setActiveTab={setActiveTab}
            onSelectStockInProduct={handleSelectStockIn}
            onViewSalesForDate={handleViewSalesForDate}
          />
        )}
        {activeTab === 'newsale' && (
          <NewSale
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === 'stockin' && (
          <StockIn
            preselectedProductId={stockInProductId}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === 'inventory' && (
          <Inventory
            setActiveTab={setActiveTab}
            onSelectStockInProduct={handleSelectStockIn}
          />
        )}
        {activeTab === 'sales' && (
          <Sales
            setActiveTab={setActiveTab}
            initialDate={salesFilterDate}
            onClearDateFilter={() => setSalesFilterDate('')}
          />
        )}
        {activeTab === 'reports' && (
          <Reports setActiveTab={setActiveTab} />
        )}
      </main>

      {/* Global Toast Alert */}
      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          <div className="toast-dot"></div>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StockProvider>
      <MainLayout />
    </StockProvider>
  );
}
