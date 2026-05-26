import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';
import { CATEGORIES, CURRENCIES, type SplitType } from '../types';
import {
  calculateSplits,
  inferShareValuesFromExpense,
  inferSplitParticipantsFromExpense
} from '../utils/balance';
import {
  equalSplitRememberPreset,
  getPresetInvolvedMembers,
  getPresetValuesFromStorage
} from '../utils/split-presets';
import {
  todayStr,
  formatCurrency,
  getCategoryEmoji,
  parseMoneyCents,
  sanitizeMoneyInput,
  formatMoneyInputFromCents
} from '../utils/format';
import {
  formatShareInputFromAmount,
  parseShareInputToHundredths,
  sanitizeShareInput,
  shareHundredthsToAmount
} from '../utils/share-input';
import {
  ChevronLeft,
  Check,
  User,
  Calendar,
  Tag,
  SplitSquareHorizontal
} from 'lucide-react';

export default function AddExpensePage() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const {
    members,
    currency,
    expenses,
    lastSplitType,
    lastPaidBy,
    isLoading,
    addExpense,
    updateExpense,
    setLastSplitType,
    setLastPaidBy,
    lastSplitValuePresets,
    setLastSplitValuesForType
  } = useApp();

  const existing = useMemo(
    () => (editId ? expenses.find((e) => e.id === editId) : undefined),
    [editId, expenses]
  );
  const isEdit = !!existing;

  const getPresetValues = useCallback(
    (type: SplitType): Record<string, number> => {
      return getPresetValuesFromStorage(lastSplitValuePresets[type], members);
    },
    [lastSplitValuePresets, members]
  );

  const getPresetInvolved = useCallback(
    (type: SplitType): Set<string> => {
      return new Set(
        getPresetInvolvedMembers(lastSplitValuePresets[type], members)
      );
    },
    [lastSplitValuePresets, members]
  );

  const buildSplitValues = useCallback(
    (
      type: SplitType,
      involvedMembers: Iterable<string>
    ): Record<string, number> => {
      const nextValues = { ...getPresetValues(type) };
      if (type === 'shares') {
        for (const member of involvedMembers) {
          if (!Number.isFinite(nextValues[member]) || nextValues[member] <= 0) {
            nextValues[member] = 1;
          }
        }
      }
      return nextValues;
    },
    [getPresetValues]
  );

  const [splitRaw, setSplitRaw] = useState<Record<string, string>>({});

  const setSplitStateFromNumbers = useCallback(
    (nums: Record<string, number>) => {
      setSplitRaw(
        Object.fromEntries(
          Object.entries(nums).map(([k, v]) => [
            k,
            formatMoneyInputFromCents(v)
          ])
        )
      );
    },
    []
  );

  const setSplitStateFromShares = useCallback(
    (shares: Record<string, number>) => {
      setSplitRaw(
        Object.fromEntries(
          Object.entries(shares).map(([k, v]) => [
            k,
            v > 0 ? formatShareInputFromAmount(v) : ''
          ])
        )
      );
    },
    []
  );

  const [involved, setInvolved] = useState<Set<string>>(new Set());

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState('General');
  const [expCurrency, setExpCurrency] = useState(currency);
  const [paidBy, setPaidByLocal] = useState('');
  const setPaidBy = (name: string) => {
    setPaidByLocal(name);
    if (!isEdit) setLastPaidBy(name);
  };
  const [splitType, setSplitTypeLocal] = useState<SplitType>(lastSplitType);
  const setSplitType = (type: SplitType) => {
    setSplitTypeLocal(type);
    setLastSplitType(type);
    if (!isEdit) {
      const nextInvolved = getPresetInvolved(type);
      setInvolved(nextInvolved);
      const built = buildSplitValues(type, nextInvolved);
      if (type === 'shares') {
        setSplitStateFromShares(built);
      } else {
        setSplitStateFromNumbers(built);
      }
    }
  };
  const splitValues = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of members) {
      const raw = splitRaw[m] ?? '';
      out[m] =
        splitType === 'shares'
          ? parseShareInputToHundredths(raw)
          : parseMoneyCents(raw);
    }
    return out;
  }, [splitRaw, members, splitType]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInitializedNewExpense = useRef(false);

  const initializeNewExpenseForm = useCallback(() => {
    hasInitializedNewExpense.current = true;
    const nextSplitType = lastSplitType;
    setExpCurrency(currency);
    setPaidByLocal(
      lastPaidBy && members.includes(lastPaidBy) ? lastPaidBy : members[0] || ''
    );
    setSplitTypeLocal(nextSplitType);
    const nextInvolved = getPresetInvolved(nextSplitType);
    setInvolved(nextInvolved);
    const built = buildSplitValues(nextSplitType, nextInvolved);
    if (nextSplitType === 'shares') {
      setSplitStateFromShares(built);
    } else {
      setSplitStateFromNumbers(built);
    }
  }, [
    buildSplitValues,
    currency,
    getPresetInvolved,
    lastPaidBy,
    lastSplitType,
    members,
    setSplitStateFromNumbers,
    setSplitStateFromShares
  ]);

  useEffect(() => {
    if (!existing) return;
    const expense = existing;
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate edit form from sheet */
    setDescription(expense.description);
    setAmount(formatMoneyInputFromCents(expense.cost));
    setDate(expense.date);
    setCategory(expense.category);
    setExpCurrency(expense.currency);
    setPaidByLocal(expense.paidBy);
    setSplitTypeLocal(expense.splitType);

    const { involved: involvedList, owedByMember: values } =
      inferSplitParticipantsFromExpense(expense, members);
    setInvolved(new Set(involvedList));

    if (expense.splitType === 'exact') {
      setSplitStateFromNumbers(values);
    } else if (expense.splitType === 'percentage' && expense.cost > 0) {
      const percentages: Record<string, number> = {};
      for (const [m, v] of Object.entries(values)) {
        // Store as basis points (percent * 100) to avoid float drift.
        percentages[m] = Math.trunc((v * 10000) / expense.cost);
      }
      setSplitStateFromNumbers(percentages);
    } else if (expense.splitType === 'shares') {
      const shares =
        expense.shareInputs && Object.keys(expense.shareInputs).length > 0
          ? expense.shareInputs
          : inferShareValuesFromExpense(expense, members);
      setSplitStateFromShares(shares);
    } else {
      setSplitRaw({});
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [existing, members, setSplitStateFromNumbers, setSplitStateFromShares]);

  useEffect(() => {
    if (isEdit || hasInitializedNewExpense.current || members.length === 0)
      return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- boot new expense form once members load
    initializeNewExpenseForm();
  }, [initializeNewExpenseForm, isEdit, members.length]);

  const cost = parseMoneyCents(amount);

  if (isLoading && members.length === 0) {
    return (
      <Layout showNav={false}>
        <LoadingSpinner
          text={editId ? 'Loading expense...' : 'Loading members...'}
        />
      </Layout>
    );
  }

  const toggleInvolved = (m: string) => {
    const next = new Set(involved);
    const isAdding = !next.has(m);

    if (isAdding) {
      next.add(m);
    } else {
      if (next.size <= 1) return;
      next.delete(m);
    }

    setInvolved(next);
    if (splitType === 'shares' && isAdding) {
      setSplitRaw((prev) => {
        if (parseMoneyCents(prev[m] ?? '') > 0) return prev;
        return { ...prev, [m]: '1' };
      });
    }
  };

  const setSplitRawForMember = (member: string, raw: string) => {
    setSplitRaw((prev) => ({
      ...prev,
      [member]:
        splitType === 'shares'
          ? sanitizeShareInput(raw)
          : sanitizeMoneyInput(raw)
    }));
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
    if (involved.size === 0) {
      setError('Select at least one member to split with');
      return;
    }

    if (splitType === 'exact') {
      const total = [...involved].reduce(
        (sum, m) => sum + (splitValues[m] || 0),
        0
      );
      if (total !== cost) {
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
      if (total !== 10000) {
        setError(
          `Percentages must add up to 100% (currently ${(total / 100).toFixed(2)}%)`
        );
        return;
      }
    }

    if (splitType === 'shares') {
      const shareValues = [...involved].map(
        (member) => splitValues[member] || 0
      );
      if (shareValues.some((value) => value < 0)) {
        setError('Shares cannot be negative');
        return;
      }
      const totalShares = shareValues.reduce((sum, value) => sum + value, 0);
      if (totalShares <= 0) {
        setError('Enter at least one positive share');
        return;
      }
    }

    setError(null);
    setSaving(true);

    try {
      if (!isEdit) {
        const rememberedValues =
          splitType === 'equal'
            ? equalSplitRememberPreset(involved)
            : splitType === 'shares'
              ? Object.fromEntries(
                  [...involved].map((member) => [
                    member,
                    shareHundredthsToAmount(splitValues[member] ?? 0)
                  ])
                )
              : [...involved].reduce<Record<string, number>>((acc, member) => {
                  acc[member] = splitValues[member] ?? 0;
                  return acc;
                }, {});
        setLastSplitValuesForType(splitType, rememberedValues);
      }
      const splits = calculateSplits(
        cost,
        paidBy,
        members,
        splitType,
        splitValues,
        [...involved]
      );
      const shareInputs =
        splitType === 'shares'
          ? Object.fromEntries(
              [...involved].map((member) => [
                member,
                shareHundredthsToAmount(splitValues[member] ?? 0)
              ])
            )
          : undefined;
      const expenseData = {
        date,
        description: description.trim(),
        category,
        cost,
        currency: expCurrency,
        paidBy,
        splitType,
        splits,
        shareInputs
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
  const equalShare =
    involvedArr.length > 0 ? Math.trunc(cost / involvedArr.length) : 0;

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
            />
          </div>

          {/* Amount & Currency */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-text-secondary mb-1.5 flex items-center gap-1 text-xs font-medium">
                Amount
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))}
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
                        type="text"
                        inputMode="decimal"
                        value={splitRaw[m] ?? ''}
                        onChange={(e) =>
                          setSplitRawForMember(m, e.target.value)
                        }
                        placeholder="0.00"
                        className="bg-bg-input border-border text-text-primary focus:border-primary w-24 rounded-lg border px-2 py-1.5 text-right text-sm focus:outline-none"
                      />
                    )}
                    {isIn && splitType === 'percentage' && (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={splitRaw[m] ?? ''}
                          onChange={(e) =>
                            setSplitRawForMember(m, e.target.value)
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
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={m in splitRaw ? splitRaw[m] : '1'}
                          onChange={(e) =>
                            setSplitRawForMember(m, e.target.value)
                          }
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
                {(
                  [...involved].reduce((s, m) => s + (splitValues[m] || 0), 0) /
                  100
                ).toFixed(2)}
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
