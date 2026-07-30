"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBudgetMapYaml,
  getRebuildStatus,
  putBudgetMapYaml,
  triggerRebuild,
  type BudgetMapYaml,
  type RebuildResult,
} from "@/apps/expense-tracker/lib/api";
import { Loading, ErrorState } from "@/components/common/AsyncState";
import { DataTable } from "@/components/common/DataTable";
import { ProgressBar } from "@/components/common/progress";
import type { CellComponent, ColumnDefinition } from "tabulator-tables";

/**
 * Full CRUD editor for the BudgetMap: add/rename/delete categories and
 * subcategories, edit budgets inline, all in a Tabulator tree table.
 *
 * Budget invariant (mirrored server-side in budgets/yaml_repository.py's
 * validate_budget_map): a category's subcategory budgets must sum to <= the
 * category's own budget; categories with no Budget of their own are exempt.
 * Violations are shown live and block Save.
 *
 * The nested Type -> Label -> [StringMatch] tree is arbitrarily deep (see
 * banks/bank.py:_parse_transaction_map's recurse()), so it's still edited as
 * pretty-printed JSON per subcategory via a side panel - a deliberate scope
 * cut carried over from the MVP.
 */

interface TreeRow {
  id: string;
  name: string;
  budget: number;
  isCategory: boolean;
  category: string;
  subCategory?: string;
  subSum?: number;
  overBudget?: boolean;
  _children?: TreeRow[];
}

interface Violation {
  category: string;
  budget: number;
  subSum: number;
}

function subBudgetSum(data: BudgetMapYaml, category: string): number {
  return Object.values(data[category]?.SubCategories ?? {}).reduce(
    (sum, sub) => sum + (typeof sub.Budget === "number" ? sub.Budget : 0),
    0,
  );
}

function computeViolations(data: BudgetMapYaml): Violation[] {
  return Object.entries(data)
    .filter(([, details]) => typeof details.Budget === "number")
    .map(([category, details]) => ({
      category,
      budget: details.Budget as number,
      subSum: subBudgetSum(data, category),
    }))
    .filter((v) => v.subSum > v.budget);
}

function budgetMapToTree(data: BudgetMapYaml): TreeRow[] {
  return Object.entries(data).map(([category, details]) => {
    const subSum = subBudgetSum(data, category);
    const hasBudget = typeof details.Budget === "number";
    return {
      id: category,
      name: category,
      budget: details.Budget ?? 0,
      isCategory: true,
      category,
      subSum,
      overBudget: hasBudget && subSum > (details.Budget as number),
      _children: Object.entries(details.SubCategories ?? {}).map(([subCategory, subDetails]) => ({
        id: `${category}::${subCategory}`,
        name: subCategory,
        budget: subDetails.Budget ?? 0,
        isCategory: false,
        category,
        subCategory,
      })),
    };
  });
}

/** Renames a key in place, preserving the object's key order. */
function renameKey<T>(obj: Record<string, T>, oldKey: string, newKey: string): Record<string, T> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => (k === oldKey ? [newKey, v] : [k, v])),
  );
}

function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export default function BudgetMapPage() {
  const [data, setData] = useState<BudgetMapYaml | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [rebuildRunning, setRebuildRunning] = useState(false);
  const [rebuildElapsed, setRebuildElapsed] = useState(0);
  const [rebuildResult, setRebuildResult] = useState<RebuildResult | null>(null);
  const [selected, setSelected] = useState<{ category: string; subCategory: string } | null>(null);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    setSelected(null);
    getBudgetMapYaml()
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reconnect to a rebuild already in flight (started here before a reload, or
  // in another tab). The rebuild POST is synchronous, so a reload loses its
  // result - but the status endpoint still knows it's running, so we show the
  // progress bar and poll to completion rather than looking idle.
  useEffect(() => {
    let cancelled = false;
    getRebuildStatus()
      .then((s) => {
        if (!cancelled && s.running) {
          setRebuildElapsed(0);
          setRebuildRunning(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // While a rebuild runs, tick an elapsed-seconds counter (honest feedback for
  // a multi-minute job we can't measure a percentage for), and - when we're
  // only *watching* a rebuild we didn't start (no result to wait on) - poll the
  // status endpoint so the bar clears once it finishes.
  useEffect(() => {
    if (!rebuildRunning) return;
    // Elapsed is reset to 0 at both start points (handleRebuild and the
    // reconnect probe) before this runs, so anchoring here counts up from 0.
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setRebuildElapsed(Math.floor((Date.now() - startedAt) / 1000));
      if (!rebuildResult) {
        getRebuildStatus()
          .then((s) => {
            if (!s.running) setRebuildRunning(false);
          })
          .catch(() => undefined);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [rebuildRunning, rebuildResult]);

  // --- budgets ---

  const updateCategoryBudget = useCallback((category: string, value: number) => {
    setData((prev) => prev && { ...prev, [category]: { ...prev[category], Budget: value } });
  }, []);

  const updateSubCategoryBudget = useCallback(
    (category: string, subCategory: string, value: number) => {
      setData((prev) => {
        if (!prev) return prev;
        const cat = prev[category];
        const sub = cat.SubCategories?.[subCategory];
        if (!sub) return prev;
        return {
          ...prev,
          [category]: {
            ...cat,
            SubCategories: { ...cat.SubCategories, [subCategory]: { ...sub, Budget: value } },
          },
        };
      });
    },
    [],
  );

  // --- create/rename/delete ---

  const addCategory = useCallback(() => {
    setData((prev) => {
      if (!prev) return prev;
      const name = uniqueName("NewCategory", Object.keys(prev));
      return { ...prev, [name]: { Budget: 0, SubCategories: {} } };
    });
  }, []);

  const addSubCategory = useCallback((category: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const cat = prev[category];
      if (!cat) return prev;
      const subs = cat.SubCategories ?? {};
      const name = uniqueName("NewSubCategory", Object.keys(subs));
      return {
        ...prev,
        [category]: { ...cat, SubCategories: { ...subs, [name]: { Budget: 0, Type: {} } } },
      };
    });
  }, []);

  const deleteCategory = useCallback((category: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[category];
      return next;
    });
    setSelected((sel) => (sel?.category === category ? null : sel));
  }, []);

  const deleteSubCategory = useCallback((category: string, subCategory: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const cat = prev[category];
      if (!cat?.SubCategories?.[subCategory]) return prev;
      const subs = { ...cat.SubCategories };
      delete subs[subCategory];
      return { ...prev, [category]: { ...cat, SubCategories: subs } };
    });
    setSelected((sel) =>
      sel?.category === category && sel.subCategory === subCategory ? null : sel,
    );
  }, []);

  /** Returns an error message to display, or null on success. */
  const renameEntry = useCallback(
    (row: TreeRow, newName: string): string | null => {
      const trimmed = newName.trim();
      if (!trimmed) return "Name cannot be empty";
      let failure: string | null = null;
      setData((prev) => {
        if (!prev) return prev;
        if (row.isCategory) {
          if (trimmed === row.category) return prev;
          if (trimmed in prev) {
            failure = `Category "${trimmed}" already exists`;
            return prev;
          }
          setSelected((sel) =>
            sel?.category === row.category ? { ...sel, category: trimmed } : sel,
          );
          return renameKey(prev, row.category, trimmed);
        }
        const cat = prev[row.category];
        if (!cat?.SubCategories || !row.subCategory) return prev;
        if (trimmed === row.subCategory) return prev;
        if (trimmed in cat.SubCategories) {
          failure = `Subcategory "${trimmed}" already exists in ${row.category}`;
          return prev;
        }
        setSelected((sel) =>
          sel?.category === row.category && sel.subCategory === row.subCategory
            ? { ...sel, subCategory: trimmed }
            : sel,
        );
        return {
          ...prev,
          [row.category]: {
            ...cat,
            SubCategories: renameKey(cat.SubCategories, row.subCategory, trimmed),
          },
        };
      });
      return failure;
    },
    [],
  );

  // --- Type/Label JSON side panel ---

  const updateSubCategoryType = useCallback(
    (category: string, subCategory: string, typeJson: string) => {
      setData((prev) => {
        if (!prev) return prev;
        let parsed;
        try {
          parsed = JSON.parse(typeJson);
        } catch {
          return prev; // ignore invalid JSON while typing; Save will re-validate
        }
        const cat = prev[category];
        const sub = cat.SubCategories?.[subCategory];
        if (!sub) return prev;
        return {
          ...prev,
          [category]: {
            ...cat,
            SubCategories: { ...cat.SubCategories, [subCategory]: { ...sub, Type: parsed } },
          },
        };
      });
    },
    [],
  );

  // --- Tabulator wiring ---

  const handleNameEdited = useCallback(
    (cell: CellComponent) => {
      const row = cell.getData() as TreeRow;
      const message = renameEntry(row, String(cell.getValue()));
      if (message) {
        setEditMessage(message);
        cell.restoreOldValue();
      } else {
        setEditMessage(null);
      }
    },
    [renameEntry],
  );

  const handleBudgetEdited = useCallback(
    (cell: CellComponent) => {
      const row = cell.getData() as TreeRow;
      const value = Number(cell.getValue());
      if (row.isCategory) {
        updateCategoryBudget(row.category, value);
      } else if (row.subCategory) {
        updateSubCategoryBudget(row.category, row.subCategory, value);
      }
    },
    [updateCategoryBudget, updateSubCategoryBudget],
  );

  const columns: ColumnDefinition[] = useMemo(
    () => [
      {
        title: "Category / Sub Category",
        field: "name",
        widthGrow: 2,
        editor: "input",
        cellEdited: handleNameEdited,
      },
      {
        title: "Budget",
        field: "budget",
        editor: "number",
        hozAlign: "right",
        width: 110,
        formatter: "money",
        formatterParams: { precision: 2 },
        cellEdited: handleBudgetEdited,
      },
      {
        title: "Sub Sum",
        field: "subSum",
        hozAlign: "right",
        width: 110,
        headerSort: false,
        formatter: (cell: CellComponent) => {
          const row = cell.getData() as TreeRow;
          if (!row.isCategory || row.subSum === undefined) return "";
          const span = document.createElement("span");
          span.textContent = row.subSum.toFixed(2);
          if (row.overBudget) {
            span.style.color = "#e34948";
            span.style.fontWeight = "600";
            span.title = "Subcategory budgets exceed this category's budget";
          }
          return span;
        },
      },
      {
        title: "",
        width: 230,
        headerSort: false,
        formatter: (cell: CellComponent) => {
          const row = cell.getData() as TreeRow;
          const wrap = document.createElement("div");
          wrap.style.display = "flex";
          wrap.style.gap = "6px";

          if (row.isCategory) {
            const addBtn = document.createElement("button");
            addBtn.textContent = "+ Subcategory";
            addBtn.onclick = () => addSubCategory(row.category);
            wrap.appendChild(addBtn);
          } else if (row.subCategory) {
            const matchBtn = document.createElement("button");
            matchBtn.textContent = "Edit matches";
            matchBtn.onclick = () =>
              setSelected({ category: row.category, subCategory: row.subCategory! });
            wrap.appendChild(matchBtn);
          }

          const delBtn = document.createElement("button");
          delBtn.textContent = "Delete";
          delBtn.onclick = () => {
            const label = row.isCategory
              ? `category "${row.category}" and all its subcategories`
              : `subcategory "${row.subCategory}" from ${row.category}`;
            if (!window.confirm(`Delete ${label}?`)) return;
            if (row.isCategory) deleteCategory(row.category);
            else if (row.subCategory) deleteSubCategory(row.category, row.subCategory);
          };
          wrap.appendChild(delBtn);

          return wrap;
        },
      },
    ],
    [handleNameEdited, handleBudgetEdited, addSubCategory, deleteCategory, deleteSubCategory],
  );

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loading />;

  const treeData = budgetMapToTree(data);
  const violations = computeViolations(data);
  const selectedType = selected
    ? data[selected.category]?.SubCategories?.[selected.subCategory]?.Type ?? {}
    : null;

  async function handleSave() {
    if (!data) return;
    if (computeViolations(data).length > 0) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await putBudgetMapYaml(data);
      setSaveMessage("Saved. Click \"Rebuild Data\" to regenerate the database from this YAML.");
    } catch (e) {
      setSaveMessage(`Save failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRebuild() {
    setRebuildElapsed(0);
    setRebuildRunning(true);
    setRebuildResult(null);
    try {
      const result = await triggerRebuild();
      setRebuildResult(result);
    } catch (e) {
      setRebuildResult({ status: "error", stdout: "", stderr: String(e), returncode: null });
    } finally {
      setRebuildRunning(false);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Budget Map</h1>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={addCategory}>+ Category</button>
        <button
          onClick={handleSave}
          disabled={saving || violations.length > 0}
          title={violations.length > 0 ? "Fix the budget violations below before saving" : undefined}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={handleRebuild} disabled={rebuildRunning}>
          {rebuildRunning ? "Rebuilding..." : "Rebuild Data"}
        </button>
        {!rebuildRunning && saveMessage && <span>{saveMessage}</span>}
        {editMessage && <span role="alert" style={{ color: "#e34948" }}>{editMessage}</span>}
      </div>

      {rebuildRunning && (
        <div
          style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 520, marginBottom: 16 }}
          role="status"
          aria-live="polite"
        >
          {/* Indeterminate on purpose: a rebuild is a multi-minute ETL we can't
              measure a percentage for, so we show motion + an elapsed timer
              rather than a fake bar creeping toward 100%. */}
          <ProgressBar fraction={null} label="Rebuild in progress" className="flex-1" />
          <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {rebuildElapsed < 60
              ? `${rebuildElapsed}s`
              : `${Math.floor(rebuildElapsed / 60)}m ${rebuildElapsed % 60}s`}
          </span>
        </div>
      )}

      {violations.length > 0 && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            border: "1px solid #e34948",
            borderRadius: 8,
            padding: 12,
            color: "#e34948",
          }}
        >
          <strong>Budget violations - fix these before saving:</strong>
          <ul style={{ marginLeft: 20, marginTop: 4 }}>
            {violations.map((v) => (
              <li key={v.category}>
                {v.category}: subcategories sum to {v.subSum.toFixed(2)}, exceeding the category
                budget of {v.budget.toFixed(2)} by {(v.subSum - v.budget).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rebuildResult && (
        <div style={{ marginBottom: 16, border: "1px solid #c3c2b7", padding: 12, borderRadius: 8 }}>
          <strong>Rebuild status: {rebuildResult.status}</strong>
          {rebuildResult.stdout && (
            <details open={rebuildResult.status !== "ok"}>
              <summary>stdout</summary>
              <pre style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>{rebuildResult.stdout}</pre>
            </details>
          )}
          {rebuildResult.stderr && (
            <details open>
              <summary>stderr</summary>
              <pre style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>{rebuildResult.stderr}</pre>
            </details>
          )}
        </div>
      )}

      <p style={{ color: "#52514e", marginBottom: 8 }}>
        Double-click a name or budget to edit it. Categories without a budget of their own
        (e.g. Income, Banking) aren&apos;t checked against their subcategory totals.
      </p>

      <DataTable
        data={treeData}
        columns={columns}
        options={{
          layout: "fitColumns",
          dataTree: true,
          dataTreeChildField: "_children",
          dataTreeStartExpanded: true,
          index: "id",
        }}
      />

      {selected && selectedType !== null && (
        <div style={{ marginTop: 16, border: "1px solid #c3c2b7", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>
              {selected.category} / {selected.subCategory} - Type / Label / string matches (JSON)
            </strong>
            <button onClick={() => setSelected(null)}>Close</button>
          </div>
          <textarea
            key={`${selected.category}::${selected.subCategory}`}
            defaultValue={JSON.stringify(selectedType, null, 2)}
            onBlur={(e) => updateSubCategoryType(selected.category, selected.subCategory, e.target.value)}
            rows={8}
            style={{
              width: "100%",
              marginTop: 8,
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: "0.8rem",
            }}
          />
        </div>
      )}
    </main>
  );
}
