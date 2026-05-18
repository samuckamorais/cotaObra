import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';
const ADMIN_PASSWORD = 'cotaobra2026';

interface Lead {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
  source: string;
  lgpdConsent: boolean;
  createdAt: string;
}

export function LeadsAdmin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true);
      setPwError('');
    } else {
      setPwError('Senha incorreta');
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    setLoading(true);
    fetch(`${API_URL}/api/leads?limit=200`)
      .then((r) => r.json())
      .then((data) => {
        setLeads(data.data || []);
        setTotal(data.pagination?.total || 0);
      })
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  }, [authenticated]);

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100" style={{ fontFamily: 'Inter, sans-serif' }}>
        <form onSubmit={handleLogin} className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Leads CotaObra</h1>
          <p className="text-sm text-gray-500 mb-6">Digite a senha para acessar</p>
          {pwError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{pwError}</p>}
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1A5632]"
          />
          <button type="submit" className="w-full py-3 rounded-lg text-white font-semibold text-sm" style={{ backgroundColor: '#1A5632' }}>
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leads Capturados</h1>
            <p className="text-sm text-gray-500">{total} lead{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setAuthenticated(false)} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Sair
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Carregando...</div>
        ) : leads.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">📭</p>
            <p className="text-gray-500">Nenhum lead cadastrado ainda.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Nome</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">WhatsApp</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">E-mail</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Origem</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{lead.name}</td>
                      <td className="px-4 py-3 text-gray-700">{lead.whatsapp}</td>
                      <td className="px-4 py-3 text-gray-700">{lead.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          lead.source === 'lpcotaobra2026' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {lead.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(lead.createdAt).toLocaleDateString('pt-BR')}{' '}
                        {new Date(lead.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
