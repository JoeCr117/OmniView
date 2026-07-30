"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getRawAccounts,
  getRawCsvFiles,
  getRawCsvRows,
  uploadRawCsv,
} from "@/apps/expense-tracker/lib/api";
import { Loading, ErrorState } from "@/components/common/AsyncState";
import { DataTable } from "@/components/common/DataTable";
import { ProgressBar } from "@/components/common/progress";
import { dateColumnProps } from "@/apps/expense-tracker/lib/dates";

export default function RawCsvsPage() {
  const [accounts, setAccounts] = useState<string[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);

  const [files, setFiles] = useState<string[] | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  // null while idle; a fraction in [0,1] during the byte transfer; null again
  // (with `uploading` still true) once the server takes over - the ProgressBar
  // reads that null as "busy" and goes indeterminate.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAccounts = useCallback(() => {
    setAccounts(null);
    setAccountsError(null);
    getRawAccounts()
      .then((res) => {
        setAccounts(res);
        setActiveAccount((prev) => prev ?? res[0] ?? null);
      })
      .catch((e) => setAccountsError(String(e)));
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const loadFiles = useCallback((account: string) => {
    setFiles(null);
    setFilesError(null);
    setRows(null);
    getRawCsvFiles(account)
      .then((res) => {
        setFiles(res);
        setActiveFile(res[0] ?? null);
      })
      .catch((e) => setFilesError(String(e)));
  }, []);

  useEffect(() => {
    if (activeAccount) loadFiles(activeAccount);
  }, [activeAccount, loadFiles]);

  const loadRows = useCallback((account: string, filename: string) => {
    setRows(null);
    setRowsError(null);
    getRawCsvRows(account, filename)
      .then(setRows)
      .catch((e) => setRowsError(String(e)));
  }, []);

  useEffect(() => {
    if (activeAccount && activeFile) loadRows(activeAccount, activeFile);
  }, [activeAccount, activeFile, loadRows]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeAccount) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadMessage(null);
    try {
      const result = await uploadRawCsv(activeAccount, file, setUploadProgress);
      setUploadMessage(`Uploaded "${result.filename}".`);
      loadFiles(activeAccount);
      setActiveFile(result.filename);
    } catch (err) {
      setUploadMessage(`Upload failed: ${String(err)}`);
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (accountsError) return <ErrorState message={accountsError} onRetry={loadAccounts} />;
  if (!accounts) return <Loading />;

  return (
    <main style={{ padding: 24 }}>
      <h1>Raw CSVs</h1>
      <p style={{ maxWidth: 640, color: "#52514e" }}>
        Read-only view of each account&apos;s raw bank-export CSVs, exactly as
        exported - before any parsing/categorization. Upload a new export for
        the active account below, then rebuild from the{" "}
        <a href="/budget-map">Budget Map page</a> to pick it up.
      </p>

      <div style={{ display: "flex", gap: 4, marginTop: 16, borderBottom: "1px solid #c3c2b7" }}>
        {accounts.map((account) => {
          const active = account === activeAccount;
          return (
            <button
              key={account}
              onClick={() => {
                setActiveAccount(account);
                setUploadMessage(null);
              }}
              aria-current={active ? "page" : undefined}
              style={{
                padding: "8px 14px",
                borderRadius: "6px 6px 0 0",
                border: "1px solid",
                borderColor: active ? "#c3c2b7" : "transparent",
                borderBottom: active ? "1px solid var(--background)" : "1px solid transparent",
                marginBottom: "-1px",
                background: active ? "var(--background)" : "transparent",
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {account}
            </button>
          );
        })}
      </div>

      <div style={{ padding: "16px 0", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {files && files.length > 1 && (
          <label>
            File:{" "}
            <select value={activeFile ?? ""} onChange={(e) => setActiveFile(e.target.value)}>
              {files.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        )}
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading || !activeAccount}>
          {uploading ? "Uploading..." : `Upload CSV for ${activeAccount ?? "..."}`}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleUpload}
          style={{ display: "none" }}
        />
        {uploading && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 160 }}>
            <ProgressBar
              fraction={uploadProgress}
              label="Upload progress"
              className="w-32"
            />
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {uploadProgress === null ? "Processing…" : `${Math.round(uploadProgress * 100)}%`}
            </span>
          </span>
        )}
        {!uploading && uploadMessage && <span>{uploadMessage}</span>}
      </div>

      {filesError && <p role="alert">Failed to load files: {filesError}</p>}
      {!filesError && files && files.length === 0 && <p>No CSVs uploaded for this account yet.</p>}
      {rowsError && <p role="alert">Failed to load CSV: {rowsError}</p>}
      {!rowsError && rows && rows.length === 0 && <p>This CSV has no rows.</p>}
      {!rowsError && rows && rows.length > 0 && (
        <DataTable
          data={rows}
          columns={[]}
          options={{
            layout: "fitDataFill",
            autoColumns: true,
            // Bank exports carry dates as MM/DD/YYYY strings; give any
            // date-named column a real chronological sorter + YYYY-MM-DD
            // display, without touching the CSV itself (see lib/dates.ts).
            autoColumnsDefinitions: (defs) =>
              (defs ?? []).map((def) =>
                def.field && def.field.toLowerCase().includes("date")
                  ? { ...def, ...dateColumnProps }
                  : def,
              ),
            pagination: true,
            paginationSize: 50,
          }}
        />
      )}
      {!filesError && files && files.length > 0 && !rows && !rowsError && <Loading />}
    </main>
  );
}
