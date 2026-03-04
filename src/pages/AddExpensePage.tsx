import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import { CATEGORIES, CURRENCIES, type SplitType } from '../types';
import { calculateSplits } from '../utils/balance';
import { todayStr, formatCurrency } from '../utils/format';
import { ChevronLeft, Check, User, DollarSign, Calendar, Tag, SplitSquareHorizontal } from 'lucide-react';

export default function AddExpensePage() {
  const navigate = useNavigate();
  const { members, currency, addExpense } = useApp();

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

  const cost = parseFloat(amount) || 0;

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
    if (!description.trim()) { setError('Enter a description'); return; }
    if (cost <= 0) { setError('Enter a valid amount'); return; }
    if (!paidBy) { setError('Select who paid'); return; }

    if (splitType === 'exact') {
      const total = [...involved].reduce((sum, m) => sum + (splitValues[m] || 0), 0);
      if (Math.abs(total - cost) > 0.01) {
        setError(`Amounts must add up to ${formatCurrency(cost, expCurrency)} (currently ${formatCurrency(total, expCurrency)})`);
        return;
      }
    }

    if (splitType === 'percentage') {
      const total = [...involved].reduce((sum, m) => sum + (splitValues[m] || 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        setError(`Percentages must add up to 100% (currently ${total.toFixed(1)}%)`);
        return;
      }
    }

    setError(null);
    setSaving(true);

    try {
      const splits = calculateSplits(cost, paidBy, members, splitType, splitValues, [...involved]);
      await addExpense({
        date,
        description: description.trim(),
        category,
        cost,
        currency: expCurrency,
        paidBy,
        splitType,
        splits,
      });
      navigate(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add expense');
      setSaving(false);
    }
  };

  const involvedArr = [...involved];
  const equalShare = involvedArr.length > 0 ? cost / involvedArr.length : 0;

  return (
    <Layout showNav={false}>
      <div className="px-4 py-4 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="text-sm">Cancel</span>
          </button>
          <h1 className="text-lg font-bold text-text-primary">Add Expense</h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 text-primary font-semibold text-sm hover:text-primary-light disabled:opacity-50 transition-colors"
          >
            <Check size={18} />
            <span>{saving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>

        <div className="space-y-5">
          {/* Description */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1">
              <Tag size={12} /> Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-primary"
              autoFocus
            />
          </div>

          {/* Amount & Currency */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1">
                <DollarSign size={12} /> Amount
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="w-24">
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Currency</label>
              <select
                value={expCurrency}
                onChange={(e) => setExpCurrency(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-xl px-3 py-3 text-text-primary text-sm focus:outline-none focus:border-primary appearance-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Category */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1">
                <Calendar size={12} /> Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-xl px-3 py-3 text-text-primary text-sm focus:outline-none focus:border-primary appearance-none"
              >
                {CATEGORIES.filter((c) => c !== 'Payment').map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Paid by */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
              <User size={12} /> Paid by
            </label>
            <div className="flex gap-2 flex-wrap">
              {members.map((m) => (
                <button
                  key={m}
                  onClick={() => setPaidBy(m)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors ${
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
            <label className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
              <SplitSquareHorizontal size={12} /> Split method
            </label>
            <div className="grid grid-cols-4 gap-1 bg-bg-input rounded-xl p-1 border border-border">
              {(['equal', 'exact', 'percentage', 'shares'] as SplitType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setSplitType(t)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors capitalize ${
                    splitType === t
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {t === 'percentage' ? '%' : t}
                </button>
              ))}
            </div>
          </div>

          {/* Split details */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">
              Split among ({involvedArr.length} of {members.length})
            </label>
            <div className="space-y-2">
              {members.map((m) => {
                const isIn = involved.has(m);
                return (
                  <div key={m} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${isIn ? 'bg-bg-card border-border/50' : 'bg-bg-dark border-transparent opacity-50'}`}>
                    <button onClick={() => toggleInvolved(m)} className="shrink-0">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isIn ? 'bg-primary border-primary' : 'border-text-muted'}`}>
                        {isIn && <Check size={12} className="text-white" />}
                      </div>
                    </button>
                    <Avatar name={m} size="sm" />
                    <span className="text-sm text-text-primary flex-1">{m}</span>

                    {isIn && splitType === 'equal' && (
                      <span className="text-sm text-text-secondary">{formatCurrency(equalShare, expCurrency)}</span>
                    )}
                    {isIn && splitType === 'exact' && (
                      <input
                        type="number"
                        value={splitValues[m] ?? ''}
                        onChange={(e) => setSplitValue(m, parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        step="0.01"
                        className="w-24 bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary text-right focus:outline-none focus:border-primary"
                      />
                    )}
                    {isIn && splitType === 'percentage' && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={splitValues[m] ?? ''}
                          onChange={(e) => setSplitValue(m, parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-16 bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary text-right focus:outline-none focus:border-primary"
                        />
                        <span className="text-xs text-text-muted">%</span>
                      </div>
                    )}
                    {isIn && splitType === 'shares' && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={splitValues[m] ?? 1}
                          onChange={(e) => setSplitValue(m, parseFloat(e.target.value) || 0)}
                          min="0"
                          className="w-16 bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary text-right focus:outline-none focus:border-primary"
                        />
                        <span className="text-xs text-text-muted">shares</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Validation hints */}
            {splitType === 'exact' && cost > 0 && (
              <div className="mt-2 text-xs text-text-muted">
                Total: {formatCurrency([...involved].reduce((s, m) => s + (splitValues[m] || 0), 0), expCurrency)}{' '}
                / {formatCurrency(cost, expCurrency)}
              </div>
            )}
            {splitType === 'percentage' && (
              <div className="mt-2 text-xs text-text-muted">
                Total: {[...involved].reduce((s, m) => s + (splitValues[m] || 0), 0).toFixed(1)}% / 100%
              </div>
            )}
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 text-sm text-danger">
              {error}
            </div>
          )}

          {/* Save Button (bottom) */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-primary text-white rounded-xl px-4 py-3.5 font-semibold text-sm hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Add Expense'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
