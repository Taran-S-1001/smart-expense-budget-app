import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AppLayout } from './layout/AppLayout';
import { AccountsPage } from './features/accounts/AccountsPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { NotFoundPage } from './features/shared/NotFoundPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
