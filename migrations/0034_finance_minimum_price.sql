ALTER TABLE finance_assets ADD COLUMN minimum_price DECIMAL(8,2) CHECK (minimum_price IS NULL OR (minimum_price > 0 AND minimum_price <= 999999.99 AND minimum_price = round(minimum_price, 2)));
