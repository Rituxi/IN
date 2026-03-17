import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Logs from './pages/admin/Logs';
import Users from './pages/admin/Users';
import Redeem from './pages/admin/Redeem';
import LevelConfig from './pages/admin/LevelConfig';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="logs" element={<Logs />} />
          <Route path="users" element={<Users />} />
          <Route path="redeem" element={<Redeem />} />
          <Route path="level-config" element={<LevelConfig />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
