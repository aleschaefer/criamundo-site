-- Categorias, itens e listas de compras do módulo Mercado.
CREATE TABLE market_categories (
  id TEXT PRIMARY KEY NOT NULL,
  name CHAR(40) COLLATE NOCASE NOT NULL UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 40 AND name=trim(name)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE market_items (
  id TEXT PRIMARY KEY NOT NULL,
  name CHAR(80) COLLATE NOCASE NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80 AND name=trim(name)),
  quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity BETWEEN 1 AND 9999),
  category_id TEXT NOT NULL,
  approximate_value DECIMAL(10,2) NOT NULL CHECK(approximate_value BETWEEN 0 AND 99999999.99 AND approximate_value=round(approximate_value,2)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(category_id) REFERENCES market_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE(name,category_id)
);
CREATE TABLE market_lists (
  id TEXT PRIMARY KEY NOT NULL,
  list_date TEXT NOT NULL CHECK(list_date=date(list_date,'+0 days')),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE market_list_items (
  list_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY(list_id,item_id),
  FOREIGN KEY(list_id) REFERENCES market_lists(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES market_items(id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX idx_market_items_category ON market_items(category_id);
CREATE INDEX idx_market_lists_date ON market_lists(list_date DESC);
CREATE INDEX idx_market_list_items_item ON market_list_items(item_id);
