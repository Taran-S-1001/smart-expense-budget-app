import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AppLayout } from './layout/AppLayout';
import { AccountsPage } from './features/accounts/AccountsPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { NotFoundPage } from './features/shared/NotFoundPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegistrationPage } from './features/auth/RegistrationPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { BudgetsPage } from './features/budgets/BudgetsPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { AdminCategoriesPage } from './features/admin/AdminCategoriesPage';
import { RemindersPage } from './features/reminders/RemindersPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegistrationPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="budgets" element={<BudgetsPage />} />
            <Route path="reminders" element={<RemindersPage />} />
            <Route path="admin/categories" element={<AdminCategoriesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
