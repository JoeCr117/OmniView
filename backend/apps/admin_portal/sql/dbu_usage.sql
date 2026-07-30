-- DBU usage by day and SKU with list-price USD equivalents, last :days days.
-- Validated live against the Free Edition workspace (2026-07-13): the
-- pricing.effective_list.default join returns correct non-zero prices.
-- Executed via the SQL Statement Execution API (services.run_warehouse_sql)
-- with a named INT parameter :days - AppKit analytics-plugin style
-- (file-based, parameterized).
SELECT
    u.usage_date,
    u.sku_name,
    SUM(u.usage_quantity) AS dbus,
    SUM(u.usage_quantity * COALESCE(p.pricing.effective_list.default, 0)) AS list_cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices p
    ON p.sku_name = u.sku_name
    AND p.cloud = u.cloud
    AND p.currency_code = 'USD'
    AND u.usage_end_time >= p.price_start_time
    AND (p.price_end_time IS NULL OR u.usage_end_time < p.price_end_time)
WHERE u.usage_date >= date_sub(current_date(), :days)
GROUP BY 1, 2
ORDER BY 1, 2
