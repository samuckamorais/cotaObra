import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/p';

interface QuoteItem {
  id: string;
  product: string;
  quantity: number;
  unit: string;
}

interface FormData {
  token: string;
  expiresAt: string;
  supplier: { name: string };
  quote: {
    producerName: string;
    producerCity: string;
    category: string | null;
    region: string;
    deadline: string;
    freight: string | null;
    observations: string | null;
    items: QuoteItem[];
  };
}

export function ProposalForm() {
  const { token } = useParams<{ token: string }>();
  const [formData, setFormData] = useState<FormData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Preços por item (quoteItemId → unitPrice string)
  const [prices, setPrices] = useState<Record<string, string>>({});
  // Itens pulados
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [observations, setObservations] = useState('');
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    axios
      .get(`${API_BASE}/${token}`)
      .then((res) => {
        setFormData(res.data.data);
        setLoading(false);
      })
      .catch((err) => {
        const msg = err.response?.data?.error?.message || 'Link inválido ou expirado.';
        setError(msg);
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    if (!formData?.expiresAt) return;

    const calc = () => {
      const diff = new Date(formData.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setExpired(true);
        setTimeLeft(null);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(
        h > 0
          ? `${h}h ${String(m).padStart(2, '0')}min`
          : `${m}min ${String(s).padStart(2, '0')}s`
      );
    };

    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [formData?.expiresAt]);

  const totalPrice = formData?.quote.items.reduce((sum, item) => {
    if (skipped[item.id]) return sum;
    const p = parseFloat(prices[item.id]?.replace(',', '.') || '0');
    if (isNaN(p)) return sum;
    return sum + p * item.quantity;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData || !token) return;

    const items = formData.quote.items
      .filter((it) => !skipped[it.id])
      .map((it) => ({
        quoteItemId: it.id,
        unitPrice: parseFloat(prices[it.id]?.replace(',', '.') || '0'),
      }))
      .filter((it) => it.unitPrice > 0);

    if (items.length === 0) {
      setSubmitError('Informe o preço de ao menos um item.');
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/${token}`, {
        items,
        paymentTerms,
        deliveryDays: parseInt(deliveryDays),
        observations: observations || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Erro ao enviar proposta.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center">
        <p className="text-green-700 text-lg">Carregando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-red-700 mb-2">Link Inválido</h1>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-green-700 mb-2">Proposta enviada!</h1>
        <p className="text-green-600">
          Obrigado, <strong>{formData?.supplier.name}</strong>!<br />
          Sua proposta foi registrada com sucesso. Entraremos em contato se for selecionado.
        </p>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">⏰</div>
        <h1 className="text-xl font-bold text-red-700 mb-2">Link expirado</h1>
        <p className="text-red-600">O prazo para envio desta proposta encerrou. Entre em contato com o produtor.</p>
      </div>
    );
  }

  const q = formData!.quote;
  const deadlineFormatted = new Date(q.deadline).toLocaleDateString('pt-BR');
  const isUrgent = timeLeft !== null && !timeLeft.includes('h');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 [color-scheme:light]">
      {/* Header */}
      <div className="bg-green-600 text-white px-4 py-4">
        <div className="max-w-lg mx-auto">
          <p className="text-green-100 text-sm">🌾 CotaObra</p>
          <h1 className="text-lg font-bold">Proposta para {q.producerName}</h1>
          <p className="text-green-100 text-sm">{q.producerCity}</p>
        </div>
      </div>

      {/* Countdown banner */}
      {timeLeft && (
        <div className={`px-4 py-3 text-center text-sm font-semibold ${isUrgent ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-900'}`}>
          ⏳ Este link expira em {timeLeft}
        </div>
      )}

      {/* Quote details */}
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4 text-sm space-y-1 text-gray-800">
          <p>🧑‍🌾 <strong>Produtor:</strong> {q.producerName} — {q.producerCity}</p>
          {q.category && <p>🏷️ <strong>Categoria:</strong> {q.category}</p>}
          <p>📅 <strong>Dt. Entrega:</strong> {deadlineFormatted}</p>
          <p>📍 <strong>Região:</strong> {q.region}</p>
          {q.freight && (
            <p>🚚 <strong>Frete:</strong> {q.freight === 'CIF' ? 'CIF (entrega inclusa)' : 'FOB (retira no fornecedor)'}</p>
          )}
          {q.observations && <p>📝 <strong>Obs:</strong> {q.observations}</p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Itens */}
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-700">Produtos solicitados</h2>
            {q.items.map((item) => (
              <div key={item.id} className="bg-white rounded-lg shadow-sm p-4 text-gray-800">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-800">{item.product}</p>
                    <p className="text-sm text-gray-500">Qtd: {item.quantity} {item.unit}</p>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!skipped[item.id]}
                      onChange={(e) => setSkipped((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                      className="w-3.5 h-3.5"
                    />
                    Não tenho
                  </label>
                </div>
                {!skipped[item.id] && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Preço unitário (R$)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-400 text-sm">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required={!skipped[item.id]}
                        value={prices[item.id] || ''}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="0,00"
                      />
                    </div>
                    {(() => {
                      const rawPrice = prices[item.id];
                      if (!rawPrice) return null;
                      const unitPrice = parseFloat(rawPrice.replace(',', '.'));
                      if (isNaN(unitPrice) || unitPrice <= 0) return null;
                      return (
                        <p className="text-xs text-gray-400 mt-1">
                          Total: R$ {(unitPrice * item.quantity).toFixed(2)}
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Total estimado */}
          {typeof totalPrice === 'number' && totalPrice > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-sm text-green-700">Total estimado da proposta</p>
              <p className="text-2xl font-bold text-green-700">
                R$ {totalPrice.toFixed(2).replace('.', ',')}
              </p>
            </div>
          )}

          {/* Condições */}
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-3 text-gray-800">
            <h2 className="font-semibold text-gray-700">Condições</h2>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Prazo de entrega (dias) *</label>
              <input
                type="number"
                min="1"
                required
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Ex: 5"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Condição de pagamento *</label>
              <input
                type="text"
                required
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Ex: 30 dias, à vista, boleto"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Observações (opcional)</label>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                placeholder="Informações adicionais sobre sua proposta"
              />
            </div>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold text-base hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Enviando...' : '✅ Enviar Proposta'}
          </button>

          <p className="text-xs text-center text-gray-400 pb-6">
            Ao enviar, sua proposta será registrada automaticamente no sistema CotaObra.
          </p>
        </form>
      </div>
    </div>
  );
}
