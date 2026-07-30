"use client";

import { useState } from "react";
import { getUncategorizedTransactions } from "@/apps/expense-tracker/lib/api";
import { ErrorState } from "@/components/common/AsyncState";
import { Pager } from "@/components/common/Pager";
import { DataTable } from "@/components/common/DataTable";
import { RefreshBar } from "@/components/common/progress";
import { TableSkeleton } from "@/components/common/skeletons";
import { dateColumnProps } from "@/apps/expense-tracker/lib/dates";
import { useResource } from "@/lib/useResource";
import type { ColumnDefinition } from "tabulator-tables";

const PAGE_SIZE = 50;

const columns: ColumnDefinition[] = [
  { title: "Date", field: "calendar_date", ...dateColumnProps, width: 120 },
  { title: "Account", field: "account_type", sorter: "string", width: 140 },
  { title: "Description", field: "transaction_description", sorter: "string" },
  {
    title: "Amount",
    field: "transaction_amount",
    sorter: "number",
    hozAlign: "right",
    width: 120,
    formatter: "money",
    formatterParams: { precision: 2 },
  },
];

export default function UncategorizedPage() {
  const [offset, setOffset] = useState(0);
  // Offset is in the key, so each page is cached independently: paging back to
  // a page you've seen paints instantly instead of re-fetching and blanking.
  const { data, status, error, isValidating, refetch } = useResource(
    `expense-tracker:uncategorized:${offset}`,
    () => getUncategorizedTransactions({ limit: PAGE_SIZE, offset }),
  );

  if (status === "error") return <ErrorState message={String(error)} onRetry={refetch} />;
  if (status === "loading") {
    return (
      <main style={{ padding: 24 }}>
        <h1>Uncategorized Transactions</h1>
        <div style={{ marginTop: 16 }}>
          <TableSkeleton />
        </div>
      </main>
    );
  }

  const rows = data?.items ?? [];
  const count = data?.count ?? 0;

  return (
    <main style={{ padding: 24 }}>
      <RefreshBar active={isValidating} />
      <h1>Uncategorized Transactions</h1>
      <p style={{ maxWidth: 640, color: "#52514e" }}>
        Transactions whose description didn&apos;t match any string in the
        BudgetMap. Add a match in the <a href="/budget-map">Budget Map editor</a>{" "}
        and rebuild to categorize them.
      </p>
      {rows.length === 0 ? (
        <p>Nothing uncategorized - nice.</p>
      ) : (
        <>
          <DataTable data={rows} columns={columns} options={{ layout: "fitColumns" }} />
          <Pager offset={offset} limit={PAGE_SIZE} count={count} onOffsetChange={setOffset} />
        </>
      )}
    </main>
  );
}
