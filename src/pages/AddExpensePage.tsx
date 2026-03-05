import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import { CATEGORIES, CURRENCIES, type SplitType } from '../types';
import { calculateSplits } from '../utils/balance';
import {
  todayStr,
  formatCurrency,
  getCategoryEmoji,
  parseAmount
} from '../utils/format';
import {
  ChevronLeft,
  Check,
  User,
  DollarSign,
  Calendar,
  Tag,
  SplitSquareHorizontal
} from 'lucide-react';

export default function AddExpensePage() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const { members, currency, expenses, addExpense, updateExpense } = useApp();

  const existing = useMemo(
    () => (editId ? expenses.find((e) => e.id === editId) : undefined),
    [editId, expenses]
  );
  const isEdit = !!existing;

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState('General');
  const [expCurrency, setExpCurrency] = useState(currency);
  const [paidBy, setPaidBy] = useState(members[0] || '');
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [splitValues, setSplitValues] = useState<Record<string, number>>({});
  const [involved, setInvolved] = useState<Set<string>>(new Set(members));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setDescription(existing.description);
    setAmount(existing.cost.toString());
    setDate(existing.date);
    setCategory(existing.category);
    setExpCurrency(existing.currency);
    setPaidBy(existing.paidBy);
    setSplitType(existing.splitType);

    const involvedSet = new Set<string>();
    const values: Record<string, number> = {};
    for (const [m, net] of Object.entries(existing.splits)) {
      if (Math.abs(net) > 0.001 || m === existing.paidBy) {
        involvedSet.add(m);
      }
      const share = existing.paidBy === m ? existing.cost - net : -net;
      if (share > 0) values[m] = Math.round(share * 100) / 100;
    }
    if (involvedSet.size === 0) involvedSet.add(existing.paidBy);
    setInvolved(involvedSet);

    if (existing.splitType === 'exact') {
      setSplitValues(values);
    } else if (existing.splitType === 'percentage' && existing.cost > 0) {
      const pcts: Record<string, number> = {};
      for (const [m, v] of Object.entries(values)) {
        pcts[m] = Math.round((v / existing.cost) * 10000) / 100;
      }
      setSplitValues(pcts);
    } else if (existing.splitType === 'shares') {
      setSplitValues(values);
    }
  }, [existing]);

  const cost = parseAmount(amount);

  const toggleInvolved = (m: string) => {
    setInvolved((prev) => {
      const next = new Set(prev);
      if (next.has(m)) {
        if (next.size <= 1) return next;
        next.delete(m);
      } else {
        next.add(m);
      }
      return next;
    });
  };

  const setSplitValue = (member: string, val: number) => {
    setSplitValues((prev) => ({ ...prev, [member]: val }));
  };

  const handleSave = async () => {
    if (!description.trim()) {
      setError('Enter a description');
      return;
    }
    if (cost <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (!paidBy) {
      setError('Select who paid');
      return;
    }

    if (splitType === 'exact') {
      const total = [...involved].reduce(
        (sum, m) => sum + (splitValues[m] || 0),
        0
      );
      if (Math.abs(total - cost) > 0.01) {
        setError(
          `Amounts must add up to ${formatCurrency(cost, expCurrency)} (currently ${formatCurrency(total, expCurrency)})`
        );
        return;
      }
    }

    if (splitType === 'percentage') {
      const total = [...involved].reduce(
        (sum, m) => sum + (splitValues[m] || 0),
        0
      );
      if (Math.abs(total - 100) > 0.01) {
        setError(
          `Percentages must add up to 100% (currently ${total.toFixed(1)}%)`
        );
        return;
      }
    }

    setError(null);
    setSaving(true);

    try {
      const splits = calculateSplits(
        cost,
        paidBy,
        members,
        splitType,
        splitValues,
        [...involved]
      );
      const expenseData = {
        date,
        description: description.trim(),
        category,
        cost,
        currency: expCurrency,
        paidBy,
        splitType,
        splits
      };

      if (isEdit && editId) {
        await updateExpense(editId, expenseData);
      } else {
        await addExpense(expenseData);
      }
      navigate(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
      setSaving(false);
    }
  };

  const involvedArr = [...involved];
  const equalShare = involvedArr.length > 0 ? cost / involvedArr.length : 0;

  return (
    <Layout showNav={false}>
      <div className="mx-auto max-w-lg px-4 py-4">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="text-text-secondary hover:text-text-primary flex items-center gap-1 transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="text-sm">Cancel</span>
          </button>
          <h1 className="text-text-primary text-lg font-bold">
            {isEdit ? 'Edit Expense' : 'Add Expense'}
          </h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-primary hover:text-primary-light flex items-center gap-1 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Check size={18} />
            <span>{saving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>

        <div className="space-y-5">
          {/* Description */}
          <div>
            <label className="text-text-secondary mb-1.5 flex items-center gap-1 text-xs font-medium">
              <Tag size={12} /> Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              className="bg-bg-input border-border text-text-primary placeholder:text-text-muted focus:border-primary w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"
              autoFocus
            />
          </div>

          {/* Amount & Currency */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-text-secondary mb-1.5 flex items-center gap-1 text-xs font-medium">
                <DollarSign size={12} /> Amount
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="bg-bg-input border-border text-text-primary placeholder:text-text-muted focus:border-primary w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"
              />
            </div>
            <div className="w-24">
              <label className="text-text-secondary mb-1.5 block text-xs font-medium">
                Currency
              </label>
              <select
                value={expCurrency}
                onChange={(e) => setExpCurrency(e.target.value)}
                className="bg-bg-input border-border text-text-primary focus:border-primary w-full appearance-none rounded-xl border px-3 py-3 text-sm focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Category */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-text-secondary mb-1.5 flex items-center gap-1 text-xs font-medium">
                <Calendar size={12} /> Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-bg-input border-border text-text-primary focus:border-primary w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-text-secondary mb-1.5 block text-xs font-medium">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-bg-input border-border text-text-primary focus:border-primary w-full appearance-none rounded-xl border px-3 py-3 text-sm focus:outline-none"
              >
                {CATEGORIES.filter((c) => c !== 'Payment').map((c) => (
                  <option key={c} value={c}>
                    {getCategoryEmoji(c)} {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Paid by */}
          <div>
            <label className="text-text-secondary mb-2 flex items-center gap-1 text-xs font-medium">
              <User size={12} /> Paid by
            </label>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <button
                  key={m}
                  onClick={() => setPaidBy(m)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    paidBy === m
                      ? 'bg-primary/15 border-primary text-primary font-medium'
                      : 'bg-bg-card border-border text-text-secondary hover:border-primary/30'
                  }`}
                >
                  <Avatar name={m} size="sm" />
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Split type */}
          <div>
            <label className="text-text-secondary mb-2 flex items-center gap-1 text-xs font-medium">
              <SplitSquareHorizontal size={12} /> Split method
            </label>
            <div className="bg-bg-input border-border grid grid-cols-4 gap-1 rounded-xl border p-1">
              {(['equal', 'exact', 'percentage', 'shares'] as SplitType[]).map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => setSplitType(t)}
                    className={`rounded-lg py-2 text-xs font-medium capitalize transition-colors ${
                      splitType === t
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {t === 'percentage' ? '%' : t}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Split details */}
          <div>
            <label className="text-text-secondary mb-2 block text-xs font-medium">
              Split among ({involvedArr.length} of {members.length})
            </label>
            <div className="space-y-2">
              {members.map((m) => {
                const isIn = involved.has(m);
                return (
                  <div
                    key={m}
                    className={`flex items-center gap-3 rounded-xl border p-2.5 transition-colors ${isIn ? 'bg-bg-card border-border/50' : 'bg-bg-dark border-transparent opacity-50'}`}
                  >
                    <button
                      onClick={() => toggleInvolved(m)}
                      className="shrink-0"
                    >
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${isIn ? 'bg-primary border-primary' : 'border-text-muted'}`}
                      >
                        {isIn && <Check size={12} className="text-white" />}
                      </div>
                    </button>
                    <Avatar name={m} size="sm" />
                    <span className="text-text-primary flex-1 text-sm">
                      {m}
                    </span>

                    {isIn && splitType === 'equal' && (
                      <span className="text-text-secondary text-sm">
                        {formatCurrency(equalShare, expCurrency)}
                      </span>
                    )}
                    {isIn && splitType === 'exact' && (
                      <input
                        type="number"
                        value={splitValues[m] ?? ''}
                        onChange={(e) =>
                          setSplitValue(m, parseFloat(e.target.value) || 0)
                        }
                        placeholder="0.00"
                        step="0.01"
                        className="bg-bg-input border-border text-text-primary focus:border-primary w-24 rounded-lg border px-2 py-1.5 text-right text-sm focus:outline-none"
                      />
                    )}
                    {isIn && splitType === 'percentage' && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={splitValues[m] ?? ''}
                          onChange={(e) =>
                            setSplitValue(m, parseFloat(e.target.value) || 0)
                          }
                          placeholder="0"
                          className="bg-bg-input border-border text-text-primary focus:border-primary w-16 rounded-lg border px-2 py-1.5 text-right text-sm focus:outline-none"
                        />
                        <span className="text-text-muted text-xs">%</span>
                      </div>
                    )}
                    {isIn && splitType === 'shares' && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={splitValues[m] ?? 1}
                          onChange={(e) =>
                            setSplitValue(m, parseFloat(e.target.value) || 0)
                          }
                          min="0"
                          className="bg-bg-input border-border text-text-primary focus:border-primary w-16 rounded-lg border px-2 py-1.5 text-right text-sm focus:outline-none"
                        />
                        <span className="text-text-muted text-xs">shares</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {splitType === 'exact' && cost > 0 && (
              <div className="text-text-muted mt-2 text-xs">
                Total:{' '}
                {formatCurrency(
                  [...involved].reduce((s, m) => s + (splitValues[m] || 0), 0),
                  expCurrency
                )}{' '}
                / {formatCurrency(cost, expCurrency)}
              </div>
            )}
            {splitType === 'percentage' && (
              <div className="text-text-muted mt-2 text-xs">
                Total:{' '}
                {[...involved]
                  .reduce((s, m) => s + (splitValues[m] || 0), 0)
                  .toFixed(1)}
                % / 100%
              </div>
            )}
          </div>

          {error && (
            <div className="bg-danger/10 border-danger/30 text-danger rounded-xl border p-3 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary-dark w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Update Expense' : 'Add Expense'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
