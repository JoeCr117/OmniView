{{
	config(
		materialized = 'table',
        indexes = [
            {'columns': ['datesk']},
        ]
	)
}}
-- Create a comprehensive date dimension table with calendar attributes.
-- CalendarDate stays TEXT ('YYYY-MM-DD') to match the rest of the warehouse:
-- transaction dates are carried as ISO strings alongside integer DateSKs.
WITH dates AS (
	SELECT
		generate_series(DATE '2020-01-01', DATE '2030-12-31', INTERVAL '1 day')::date AS date
),
date_attributes AS (
	SELECT
		-- Primary Keys
		CAST(to_char(date, 'YYYYMMDD') AS INTEGER) AS DateSK,
		to_char(date, 'YYYY-MM-DD') AS CalendarDate,
		-- Basic date components
		EXTRACT(YEAR FROM date)::integer AS Year,
		EXTRACT(MONTH FROM date)::integer AS Month,
		EXTRACT(DAY FROM date)::integer AS Day,
		-- Week-related fields
		-- EXTRACT(DOW) starts with Sunday (0), like SQLite's strftime('%w')
		-- Add 1 to match the requirement of Sunday=1
		EXTRACT(DOW FROM date)::integer + 1 AS DayOfWeek,
		to_char(date, 'FMDay') AS DayName,
		-- Month names
		to_char(date, 'FMMonth') AS MonthName,
		-- Quarter
		EXTRACT(QUARTER FROM date)::integer AS Quarter,
		-- Day of Year (1-366)
		EXTRACT(DOY FROM date)::integer AS DayOfYear,
		-- Week of Year: SQLite's strftime('%W') + 1 semantics (Monday-started
		-- weeks; days before the year's first Monday count as week 0, so the
		-- published value is 1-54). first_monday_doy = 1 + ((8 - isodow(jan1)) % 7).
		(
			EXTRACT(DOY FROM date)::integer
			- (1 + ((8 - EXTRACT(ISODOW FROM date_trunc('year', date))::integer) % 7))
			+ 7
		) / 7 + 1 AS WeekOfYear,
		-- Weekend Flag
		CASE
			WHEN EXTRACT(DOW FROM date)::integer IN (0, 6) THEN 1
			ELSE 0
		END AS IsWeekend,
		-- Start/End of Month Flags
		CASE
			WHEN EXTRACT(DAY FROM date)::integer = 1 THEN 1
			ELSE 0
		END AS IsStartOfMonth,
		CASE
			WHEN date = (date_trunc('month', date) + INTERVAL '1 month - 1 day')::date THEN 1
			ELSE 0
		END AS IsEndOfMonth
	FROM
		dates
)
SELECT
	*
FROM
	date_attributes
ORDER BY
	DateSK
