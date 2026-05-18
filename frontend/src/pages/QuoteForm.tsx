import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useDraftSave } from '../hooks/useDraftSave';
// FF-BE-025 — fonte única de verdade para categorias.
// Mantém sincronizado com backend/src/constants/supplier-categories.ts
import { SUPPLIER_CATEGORIES, getCategoryLabel } from '../types/supplier';

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/cotacao';

// ===================================
// Types
// ===================================

interface Supplier {
  id: string;
  name: string;
  company?: string;
  categories: string[];
  rating: number;
  isOwn: boolean;
  isNetworkSupplier: boolean;
}

interface FormDataResponse {
  token: string;
  expiresAt: string;
  producer: {
    name: string;
    city: string;
    region: string;
  };
  suppliers: Supplier[];
}

interface QuoteItem {
  product: string;
  quantity: string;
  unit: string;
  hasObservation: boolean;
  observation: string;
  hasActiveIngredient: boolean;
  activeIngredient: string;
}

const UNITS = ['Kg', 'Sacas', 'Bag', 'Toneladas', 'Litros', 'Unidades', 'Caixas', 'Fardos'];

function emptyItem(): QuoteItem {
  return { product: '', quantity: '', unit: 'sacas', hasObservation: false, observation: '', hasActiveIngredient: false, activeIngredient: '' };
}

// ===================================
// Sub-components
// ===================================

function CountdownBanner({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const calc = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setExpired(true); setTimeLeft(null); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min ${String(s).padStart(2, '0')}s`);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (expired) return (
    <div className="bg-red-500 text-white px-4 py-3 text-center text-sm font-semibold">
      ⏰ Este link expirou. Solicite um novo pelo WhatsApp.
    </div>
  );
  if (!timeLeft) return null;
  const isUrgent = !timeLeft.includes('h');
  return (
    <div className={`px-4 py-3 text-center text-sm font-semibold ${isUrgent ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-900'}`}>
      ⏳ Este link expira em {timeLeft}
    </div>
  );
}

// ===================================
// Main Page
// ===================================

export function QuoteForm() {
  const { token } = useParams<{ token: string }>();

  const [formData, setFormData] = useState<FormDataResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form fields
  const [category, setCategory] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);
  const [region, setRegion] = useState('');
  const [deadline, setDeadline] = useState('');
  const [observations, setObservations] = useState('');
  const [freight, setFreight] = useState<'CIF' | 'FOB'>('CIF');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());
  const [selectAllOwn, setSelectAllOwn] = useState(false);
  const [draftDismissed, setDraftDismissed] = useState(false);

  // FF-BE-008 — Modal de cadastro de fornecedor inline
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [supplierToast, setSupplierToast] = useState<string | null>(null);

  // Auto-save draft
  const draftData = useMemo(() => ({
    category, items, region, deadline, observations, freight, paymentTerms,
  }), [category, items, region, deadline, observations, freight, paymentTerms]);

  const { hasDraft, restoreDraft, clearDraft, lastSaved } = useDraftSave({
    key: `quote-form-draft-${token}`,
    data: draftData,
    debounceMs: 2000,
  });

  const handleRestoreDraft = () => {
    const draft = restoreDraft();
    if (draft) {
      if (draft.category) setCategory(draft.category);
      if (draft.items) setItems(draft.items);
      if (draft.region) setRegion(draft.region);
      if (draft.deadline) setDeadline(draft.deadline);
      if (draft.observations) setObservations(draft.observations);
      if (draft.freight) setFreight(draft.freight);
      if (draft.paymentTerms) setPaymentTerms(draft.paymentTerms);
    }
    setDraftDismissed(true);
  };

  // Warn before leaving with unsaved data
  useEffect(() => {
    const hasData = items.some(i => i.product || i.quantity) || region || deadline;
    if (!hasData || submitted) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [items, region, deadline, submitted]);
  const [selectAllNetwork, setSelectAllNetwork] = useState(false);

  useEffect(() => {
    if (!token) return;
    axios
      .get(`${API_BASE}/${token}`)
      .then((res) => {
        const data: FormDataResponse = res.data.data;
        setFormData(data);
        setRegion(data.producer.region || '');
        setLoading(false);
      })
      .catch((err) => {
        const apiErr = err.response?.data?.error;
        setLoadErrorCode(apiErr?.code || null);
        setLoadError(apiErr?.message || 'Link inválido ou expirado.');
        setLoading(false);
      });
  }, [token]);

  // ---- Item helpers ----

  const updateItem = (idx: number, patch: Partial<QuoteItem>) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (idx: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ---- Supplier helpers ----

  const toggleSupplier = (id: string) => {
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAllOwn = (checked: boolean) => {
    setSelectAllOwn(checked);
    const ownIds = (formData?.suppliers ?? []).filter((s) => s.isOwn).map((s) => s.id);
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev);
      ownIds.forEach((id) => checked ? next.add(id) : next.delete(id));
      return next;
    });
  };

  const handleSelectAllNetwork = (checked: boolean) => {
    setSelectAllNetwork(checked);
    const networkIds = (formData?.suppliers ?? []).filter((s) => !s.isOwn).map((s) => s.id);
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev);
      networkIds.forEach((id) => checked ? next.add(id) : next.delete(id));
      return next;
    });
  };

  // ---- FF-BE-008 — Cadastro inline de fornecedor ----

  const openSupplierModal = () => {
    setSupplierError(null);
    setNewSupplierName('');
    setNewSupplierPhone('');
    setSupplierModalOpen(true);
  };

  const closeSupplierModal = () => {
    if (creatingSupplier) return;
    setSupplierModalOpen(false);
    setSupplierError(null);
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const name = newSupplierName.trim();
    const phone = newSupplierPhone.replace(/[^\d+]/g, '');

    if (name.length < 2) {
      setSupplierError('Informe um nome com pelo menos 2 caracteres.');
      return;
    }
    if (!/^(\+55)?\d{10,11}$/.test(phone)) {
      setSupplierError('Telefone inválido. Informe com DDD (ex: 64999990000).');
      return;
    }

    setSupplierError(null);
    setCreatingSupplier(true);

    try {
      // FF-BE-025: category já é VALUE canônico (ex: "defensivo")
      const res = await axios.post(`${API_BASE}/${token}/suppliers`, {
        name,
        phone,
        category: category || undefined,
      });
      const created = res.data.data as Supplier & { isOwn?: boolean };

      // Adiciona ao topo da lista (próprios) e marca como selecionado
      setFormData((prev) => prev ? {
        ...prev,
        suppliers: [
          {
            id: created.id,
            name: created.name,
            company: created.company,
            categories: created.categories ?? [],
            rating: created.rating ?? 0,
            isOwn: true,
            isNetworkSupplier: false,
          },
          ...prev.suppliers,
        ],
      } : prev);

      setSelectedSupplierIds((prev) => {
        const next = new Set(prev);
        next.add(created.id);
        return next;
      });

      setSupplierModalOpen(false);
      setNewSupplierName('');
      setNewSupplierPhone('');
      setSupplierToast(`Fornecedor ${created.name} cadastrado e adicionado à cotação.`);
      window.setTimeout(() => setSupplierToast(null), 4000);
    } catch (err: any) {
      const apiErr = err.response?.data?.error;
      if (err.response?.status === 409) {
        setSupplierError(
          apiErr?.message || 'Este telefone já está vinculado a um fornecedor na sua lista.',
        );
      } else if (err.response?.status === 400) {
        const detail = apiErr?.details?.[0];
        setSupplierError(detail?.message || apiErr?.message || 'Dados inválidos.');
      } else if (err.response?.status === 401 || err.response?.status === 410) {
        setSupplierError(apiErr?.message || 'Link inválido ou expirado.');
      } else {
        setSupplierError(apiErr?.message || 'Erro ao cadastrar fornecedor. Tente novamente.');
      }
    } finally {
      setCreatingSupplier(false);
    }
  };

  // ---- Submit ----

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    // FF-BE-025: category já é VALUE canônico (ex: "defensivo")
    if (!category) { setSubmitError('Selecione a categoria.'); return; }

    const validItems = items.filter((it) => it.product.trim() && parseFloat(it.quantity) > 0);
    if (validItems.length === 0) { setSubmitError('Adicione ao menos um item com produto e quantidade.'); return; }

    if (selectedSupplierIds.size === 0) { setSubmitError('Selecione ao menos um fornecedor.'); return; }

    setSubmitError(null);
    setSubmitting(true);

    try {
      await axios.post(`${API_BASE}/${token}`, {
        category,
        items: validItems.map((it) => ({
          product: it.product.trim(),
          quantity: parseFloat(it.quantity.replace(',', '.')),
          unit: it.unit,
          observation: it.hasObservation && it.observation.trim() ? it.observation.trim() : undefined,
          activeIngredient: it.hasActiveIngredient && it.activeIngredient.trim() ? it.activeIngredient.trim() : undefined,
        })),
        region: region.trim(),
        deadline,
        observations: observations.trim() || undefined,
        freight,
        paymentTerms: paymentTerms.trim(),
        selectedSupplierIds: Array.from(selectedSupplierIds),
      });
      setSubmitted(true);
      clearDraft();
    } catch (err: any) {
      const apiErr = err.response?.data?.error;
      if (apiErr?.details) {
        setSubmitError(apiErr.details.map((d: any) => d.message).join(' · '));
      } else {
        setSubmitError(apiErr?.message || 'Erro ao enviar cotação.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ===================================
  // Render states
  // ===================================

  if (loading) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center">
        <p className="text-green-700 text-lg">Carregando...</p>
      </div>
    );
  }

  if (loadError) {
    const isCancelled = loadErrorCode === 'TOKEN_CANCELLED';
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 text-center ${isCancelled ? 'bg-gray-50' : 'bg-red-50'}`}>
        <div className="text-5xl mb-4">{isCancelled ? '🚫' : '⚠️'}</div>
        <h1 className={`text-xl font-bold mb-2 ${isCancelled ? 'text-gray-700' : 'text-red-700'}`}>
          {isCancelled ? 'Cotação cancelada' : 'Link Inválido'}
        </h1>
        <p className={isCancelled ? 'text-gray-600' : 'text-red-600'}>{loadError}</p>
        <p className={`text-sm mt-3 ${isCancelled ? 'text-gray-400' : 'text-red-400'}`}>
          {isCancelled
            ? 'O produtor cancelou esta cotação pelo WhatsApp. Nenhuma ação é necessária.'
            : 'Solicite um novo link pelo WhatsApp ao agente CotaObra.'}
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-green-700 mb-2">Cotação enviada!</h1>
        <p className="text-green-700 mb-4">
          Sua cotação foi registrada e já está sendo enviada aos fornecedores selecionados.
        </p>
        <div className="bg-white rounded-xl shadow-sm p-5 max-w-sm text-left border border-green-100">
          <p className="text-sm font-semibold text-green-700 mb-1">📱 Próximos passos</p>
          <p className="text-sm text-gray-600">
            Você receberá as atualizações de status da sua cotação diretamente pelo <strong>WhatsApp</strong>,
            pelo agente CotaObra. Fique de olho nas mensagens!
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-6">Pode fechar esta página com segurança.</p>
      </div>
    );
  }

  const ownSuppliers = formData!.suppliers.filter((s) => s.isOwn);
  const networkSuppliers = formData!.suppliers.filter((s) => !s.isOwn);

  // ===================================
  // Form
  // ===================================

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 [color-scheme:light]">
      {/* Header */}
      <div className="bg-green-600 text-white px-4 py-4">
        <div className="max-w-lg mx-auto">
          <p className="text-green-100 text-sm">🌾 CotaObra</p>
          <h1 className="text-lg font-bold">Nova Cotação</h1>
          <p className="text-green-100 text-sm">{formData!.producer.name} — {formData!.producer.city}</p>
        </div>
      </div>

      <CountdownBanner expiresAt={formData!.expiresAt} />

      {/* Draft restore banner */}
      {hasDraft && !draftDismissed && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
            <p className="text-sm text-blue-800">Rascunho encontrado. Restaurar?</p>
            <div className="flex gap-2">
              <button onClick={handleRestoreDraft} className="text-sm font-medium text-blue-700 hover:underline">Sim</button>
              <button onClick={() => { clearDraft(); setDraftDismissed(true); }} className="text-sm text-blue-500 hover:underline">Descartar</button>
            </div>
          </div>
        </div>
      )}

      {/* Draft saved indicator */}
      {lastSaved && !submitted && (
        <div className="text-center py-1">
          <span className="text-[10px] text-gray-400">Rascunho salvo às {lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-5">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Categoria — FF-BE-025: lista canônica unificada (SUPPLIER_CATEGORIES) */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="font-semibold text-gray-700">Categoria do produto *</h2>
            <div className="grid grid-cols-2 gap-2">
              {SUPPLIER_CATEGORIES.map((cat) => (
                <label
                  key={cat.value}
                  className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${
                    category === cat.value
                      ? 'border-green-500 bg-green-50 text-green-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-green-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.value}
                    checked={category === cat.value}
                    onChange={(e) => setCategory(e.target.value)}
                    className="accent-green-600"
                  />
                  {cat.label}
                </label>
              ))}
            </div>
          </div>

          {/* Itens */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">Produtos *</h2>
              <button
                type="button"
                onClick={addItem}
                className="text-xs text-green-600 font-semibold border border-green-200 rounded-lg px-3 py-1.5 hover:bg-green-50 transition-colors"
              >
                + Adicionar produto
              </button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Item {idx + 1}
                  </p>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remover
                    </button>
                  )}
                </div>

                {/* Produto */}
                <input
                  type="text"
                  required
                  value={item.product}
                  onChange={(e) => updateItem(idx, { product: e.target.value })}
                  placeholder="Ex: Soja, Milho, Herbicida..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />

                {/* Quantidade + Unidade */}
                <div className="flex gap-2">
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                    placeholder="Qtd"
                    className="w-1/2 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <select
                    value={item.unit}
                    onChange={(e) => updateItem(idx, { unit: e.target.value })}
                    className="w-1/2 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                {/* Princípio Ativo — apenas para Defensivos (FF-BE-025: value canônico) */}
                {category === 'defensivo' && (
                  <>
                    <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={item.hasActiveIngredient}
                        onChange={(e) => updateItem(idx, { hasActiveIngredient: e.target.checked, activeIngredient: '' })}
                        className="w-4 h-4 accent-green-600"
                      />
                      Adicionar Princípio Ativo
                    </label>
                    {item.hasActiveIngredient && (
                      <input
                        type="text"
                        value={item.activeIngredient}
                        onChange={(e) => updateItem(idx, { activeIngredient: e.target.value })}
                        placeholder="Ex: Glifosato, Imidacloprido, Azoxistrobina..."
                        className="w-full px-3 py-2 border border-green-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-green-50"
                      />
                    )}
                  </>
                )}

                {/* Observação por produto */}
                <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={item.hasObservation}
                    onChange={(e) => updateItem(idx, { hasObservation: e.target.checked, observation: '' })}
                    className="w-4 h-4 accent-green-600"
                  />
                  Adicionar observação para este produto
                </label>

                {item.hasObservation && (
                  <textarea
                    rows={2}
                    value={item.observation}
                    onChange={(e) => updateItem(idx, { observation: e.target.value })}
                    placeholder="Ex: Marca específica, embalagem, especificação técnica..."
                    className="w-full px-3 py-2 border border-green-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none bg-green-50"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Detalhes da entrega */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="font-semibold text-gray-700">Entrega</h2>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Região / Cidade de entrega *</label>
              <input
                type="text"
                required
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Ex: Rio Verde, Goiânia, Jataí"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Prazo máximo de entrega *</label>
              <input
                type="date"
                required
                value={deadline}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-2">Tipo de frete *</label>
              <div className="flex gap-3">
                {(['CIF', 'FOB'] as const).map((f) => (
                  <label
                    key={f}
                    className={`flex-1 flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                      freight === f
                        ? 'border-green-500 bg-green-50 text-green-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-green-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="freight"
                      value={f}
                      checked={freight === f}
                      onChange={() => setFreight(f)}
                      className="accent-green-600"
                    />
                    <span>
                      <strong>{f}</strong>
                      <span className="text-xs block font-normal text-gray-500">
                        {f === 'CIF' ? 'Fornecedor entrega' : 'Você retira'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Condições comerciais */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="font-semibold text-gray-700">Condições comerciais</h2>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Condição de pagamento *</label>
              <input
                type="text"
                required
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Ex: à vista, 30/60 dias, boleto, safra"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Observações gerais (opcional)</label>
              <textarea
                rows={3}
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Informações adicionais para todos os fornecedores"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
          </div>

          {/* Seleção de fornecedores */}
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">Para quem enviar esta cotação? *</h2>
              <span className="text-xs text-gray-500">
                <span className="font-semibold text-green-700">{selectedSupplierIds.size}</span>
                {' de '}
                <span className="font-semibold">{formData!.suppliers.length}</span>
                {' selecionados'}
              </span>
            </div>

            {ownSuppliers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Meus fornecedores</p>
                  <label className="flex items-center gap-1.5 text-xs text-green-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectAllOwn}
                      onChange={(e) => handleSelectAllOwn(e.target.checked)}
                      className="w-3.5 h-3.5 accent-green-600"
                    />
                    Todos
                  </label>
                </div>
                {ownSuppliers.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                      selectedSupplierIds.has(s.id)
                        ? 'border-green-400 bg-green-50'
                        : 'border-gray-200 hover:border-green-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSupplierIds.has(s.id)}
                      onChange={() => toggleSupplier(s.id)}
                      className="w-4 h-4 accent-green-600 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                      {s.company && <p className="text-xs text-gray-500 truncate">{s.company}</p>}
                    </div>
                    {s.rating > 0 && (
                      <span className="ml-auto text-xs text-amber-500 flex-shrink-0">⭐ {s.rating.toFixed(1)}</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            {networkSuppliers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rede CotaObra</p>
                  <label className="flex items-center gap-1.5 text-xs text-green-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectAllNetwork}
                      onChange={(e) => handleSelectAllNetwork(e.target.checked)}
                      className="w-3.5 h-3.5 accent-green-600"
                    />
                    Todos
                  </label>
                </div>
                {networkSuppliers.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                      selectedSupplierIds.has(s.id)
                        ? 'border-green-400 bg-green-50'
                        : 'border-gray-200 hover:border-green-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSupplierIds.has(s.id)}
                      onChange={() => toggleSupplier(s.id)}
                      className="w-4 h-4 accent-green-600 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                      {s.categories.length > 0 && (
                        <p className="text-xs text-gray-500 truncate">{s.categories.join(', ')}</p>
                      )}
                    </div>
                    {s.rating > 0 && (
                      <span className="ml-auto text-xs text-amber-500 flex-shrink-0">⭐ {s.rating.toFixed(1)}</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            {ownSuppliers.length === 0 && networkSuppliers.length === 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-2">
                  Você ainda não tem fornecedores cadastrados.
                </p>
                <p className="text-xs text-gray-400">
                  Cadastre um para enviar a cotação.
                </p>
              </div>
            )}

            {/* FF-BE-008 — Botão de cadastro inline */}
            <button
              type="button"
              onClick={openSupplierModal}
              className="w-full border-2 border-dashed border-green-300 text-green-700 rounded-lg py-2.5 text-sm font-medium hover:bg-green-50 hover:border-green-400 transition-colors"
            >
              + Cadastrar fornecedor
            </button>
          </div>

          {/* Erro de submissão */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {/* Botão de envio */}
          <button
            type="submit"
            disabled={submitting || selectedSupplierIds.size === 0}
            title={selectedSupplierIds.size === 0 ? 'Selecione ao menos um fornecedor.' : undefined}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-base hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {submitting
              ? 'Enviando cotação...'
              : selectedSupplierIds.size === 0
                ? 'Selecione ao menos um fornecedor'
                : '✅ Enviar Cotação'}
          </button>

          <p className="text-xs text-center text-gray-400 pb-6">
            Ao enviar, sua cotação será registrada e os fornecedores selecionados serão notificados automaticamente.
          </p>
        </form>
      </div>

      {/* FF-BE-008 — Toast de confirmação */}
      {supplierToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-fade-in max-w-sm text-center">
          ✅ {supplierToast}
        </div>
      )}

      {/* FF-BE-008 — Modal de cadastro de fornecedor */}
      {supplierModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={closeSupplierModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Cadastrar fornecedor</h3>
              <button
                type="button"
                onClick={closeSupplierModal}
                disabled={creatingSupplier}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-50"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nome *</label>
                <input
                  type="text"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="Ex: João da Cooperativa"
                  disabled={creatingSupplier}
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Telefone *</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  placeholder="(64) 99999-0000"
                  disabled={creatingSupplier}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">Com DDD. Apenas números, espaços, traço e parênteses.</p>
              </div>

              {category && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Categoria</label>
                  <input
                    type="text"
                    value={getCategoryLabel(category)}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-sm text-gray-600"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Herdada da cotação atual.</p>
                </div>
              )}

              {supplierError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-2.5">
                  <p className="text-sm text-red-700">{supplierError}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeSupplierModal}
                  disabled={creatingSupplier}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingSupplier || newSupplierName.trim().length < 2 || newSupplierPhone.replace(/[^\d+]/g, '').length < 10}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingSupplier ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
