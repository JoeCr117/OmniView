/**
 * How ExpenseTracker renders money: accounting style, negatives in parentheses
 * as ($781.64). That is the convention the legacy Power BI report used and the
 * one a bank statement uses, so a column of expenses reads as expenses without
 * hunting for minus signs. Tabulator's built-in money formatter puts the $
 * outside the parens, which is why these exist.
 */

import type { CellComponent, ColumnDefinition } from "tabulator-tables";

const accountingUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  currencySign: "accounting",
});

/** ($781.64) for negatives, $781.64 for positives. */
export function formatUsd(value: number): string {
  return accountingUsd.format(value);
}

/** Tabulator cell formatter; blank for anything that isn't a number. */
export function accountingMoney(cell: CellComponent): string {
  const value = cell.getValue();
  return typeof value === "number" ? formatUsd(value) : "";
}

/** Column-definition fragment for a currency column. */
export const money: Partial<ColumnDefinition> = {
  sorter: "number",
  hozAlign: "right",
  minWidth: 125,
  formatter: accountingMoney,
};

/** A currency column that also carries a column total in the footer. */
export const txn: Partial<ColumnDefinition> = {
  ...money,
  bottomCalc: "sum",
  bottomCalcFormatter: accountingMoney,
};
