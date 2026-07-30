-- Minimal DDL + seeds mirroring the dbt gold tables the unmanaged Django
-- models read (dailymetrics/transactions/budgets models.py are the source of
-- truth for column names). Executed against the in-memory `datavault` test
-- alias by backend/conftest.py's datavault_tables fixture (SQLite) and
-- against the omniview_e2e Postgres database by e2e_bootstrap - both strip
-- comment lines and split on semicolons, so keep one statement per semicolon
-- and no semicolons inside string literals or comments.
--
-- Dialect portability: table names are quoted (Django quotes db_table, so
-- Postgres must store them CamelCase); column names stay unquoted so
-- Postgres folds them to lowercase, matching the models' db_column values
-- (SQLite is case-insensitive either way).

CREATE TABLE IF NOT EXISTS "gold_Golden1_DailyMetrics" (
    DateSK INTEGER,
    CalendarDate TEXT,
    CreditCardTransactionTotal REAL,
    CreditCardBalance REAL,
    FreeCheckingTransactionTotal REAL,
    FreeCheckingBalance REAL,
    MoneyMarketTransactionTotal REAL,
    MoneyMarketBalance REAL,
    SavingsTransactionTotal REAL,
    SavingsBalance REAL,
    TransactionTotal REAL,
    TotalBalance REAL,
    NoTransactionsFlag INTEGER
);

INSERT INTO "gold_Golden1_DailyMetrics" VALUES
    (20240101, '2024-01-01', -12.50, -112.50, 0.0, 1000.0, 0.0, 500.0, 0.0, 250.0, -12.50, 1637.50, 0),
    (20240102, '2024-01-02', 0.0, -112.50, 0.0, 1000.0, 0.0, 500.0, 0.0, 250.0, 0.0, 1637.50, 1),
    (20240103, '2024-01-03', -4.50, -117.00, 0.0, 1000.0, 0.0, 500.0, 25.0, 275.0, 20.50, 1658.00, 0);

CREATE TABLE IF NOT EXISTS "gold_Golden1_AllTransactions" (
    DateSK INTEGER,
    CalendarDate TEXT,
    AccountType TEXT,
    TransactionAmount REAL,
    Balance REAL,
    Label TEXT,
    CategorySK INTEGER
);

INSERT INTO "gold_Golden1_AllTransactions" VALUES
    (20240101, '2024-01-01', 'CreditCard', -12.50, -112.50, 'Gas', 11111),
    (20240103, '2024-01-03', 'CreditCard', -4.50, -117.00, NULL, NULL),
    (20240103, '2024-01-03', 'Savings', 25.0, 275.0, 'Employer', 33333);

CREATE TABLE IF NOT EXISTS "gold_Golden1_UncategorizedTransactions" (
    DateSK INTEGER,
    AccountType TEXT,
    CalendarDate TEXT,
    TransactionDescription TEXT,
    TransactionAmount REAL
);

INSERT INTO "gold_Golden1_UncategorizedTransactions" VALUES
    (20240103, 'CreditCard', '2024-01-03', 'COFFEE SHOP', -4.50);

CREATE TABLE IF NOT EXISTS "gold_Golden1_BudgetMap" (
    CategorySK INTEGER,
    Category TEXT,
    CategoryBudget REAL,
    SubCategory TEXT,
    SubCategoryBudget REAL
);

INSERT INTO "gold_Golden1_BudgetMap" VALUES
    (11111, 'Car', 300.0, 'Fuel', 100.0),
    (22222, 'Car', 300.0, 'Insurance', 200.0),
    (33333, 'Income', NULL, 'Paycheck', NULL);
