const dbPromise = require('./db');

async function createTables(){
    const db = await dbPromise;
    // 1. Item_Inventory table
    await db.exec(`PRAGMA foreign_keys = ON;`)

    await db.exec(`
        CREATE TABLE IF NOT EXISTS Business_Information(
            businessID INTEGER PRIMARY KEY DEFAULT 1 CHECK (businessID = 1),
            business_name TEXT,
            business_address TEXT,
            business_phone TEXT,
            business_instagram TEXT,
            business_email TEXT,
            tax_rate REAL DEFAULT 0,
            invoice_prefix TEXT DEFAULT 'INV-',
            printer_size INTEGER DEFAULT 80,
            footer_message TEXT
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS Item_Inventory (
            itemID INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT UNIQUE,
            item_name TEXT UNIQUE,
            description TEXT,
            category TEXT,
            button_color TEXT,
            item_quantity REAL DEFAULT 0 CHECK (item_quantity >= 0),
            item_unit TEXT NOT NULL DEFAULT 'pcs' CHECK (item_unit IN ('pcs','kg','g','m','cm','l','ml','box','pack','ft')),
            cost_price REAL NOT NULL CHECK (cost_price > 0),
            selling_price REAL NOT NULL CHECK (selling_price > 0),
            minimum_stock_level REAL DEFAULT 0 CHECK (minimum_stock_level >= 0),
            supplier_info TEXT,
            date_added TEXT DEFAULT (datetime('now')),
            date_updated TEXT DEFAULT (datetime('now')),
            created_by TEXT,
            is_active INTEGER DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_item_name ON Item_Inventory(item_name);
        CREATE INDEX IF NOT EXISTS idx_sku ON Item_Inventory(sku);
        CREATE INDEX IF NOT EXISTS idx_category ON Item_Inventory(category);
        CREATE INDEX IF NOT EXISTS idx_date_added ON Item_Inventory(date_added);
        CREATE INDEX IF NOT EXISTS idx_low_stock ON Item_Inventory(item_quantity, minimum_stock_level);
    `);

    // 2. Bills table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS Bills (
            bill_id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_time TEXT DEFAULT (datetime('now')),
            total_amount REAL NOT NULL DEFAULT 0,
            customer_name TEXT DEFAULT NULL,
            payment_method TEXT NOT NULL DEFAULT 'Cash',
            status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Canceled'))
        );
    `);

    // 3. bill_item table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS bill_item (
            bill_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id INTEGER NOT NULL,
            sku TEXT NOT NULL,
            item_name TEXT NOT NULL,
            quantity REAL NOT NULL CHECK (quantity > 0),
            unit_price REAL NOT NULL CHECK (unit_price > 0),
            subtotal REAL NOT NULL CHECK (subtotal > 0),
            FOREIGN KEY (bill_id) REFERENCES Bills(bill_id) ON DELETE CASCADE,
            FOREIGN KEY (sku) REFERENCES Item_Inventory(sku)
        );
    `);

    console.log("SQLite tables are ready.");
}
createTables();