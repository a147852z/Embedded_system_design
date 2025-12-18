import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Shared';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'root';
const ADMIN_AUTH_KEY = 'ai_park_admin_authed';

const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // 簡單地把登入狀態存在 localStorage
      localStorage.setItem(ADMIN_AUTH_KEY, 'true');
      setError(null);
      navigate('/admin', { replace: true });
    } else {
      setError('帳號或密碼錯誤');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="AI-Park 後台登入" subtitle="Admin Login" />
      <div className="flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-bold mb-4 text-gray-800 text-center">管理員登入</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">帳號</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="account"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="password"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <button
              type="submit"
              className="w-full bg-park-primary text-white py-2.5 rounded-lg font-bold text-sm hover:bg-blue-800 transition-colors"
            >
              登入
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;

export { ADMIN_AUTH_KEY };
