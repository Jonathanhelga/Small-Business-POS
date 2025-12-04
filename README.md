# Small-Business-POS

**Started:** August 15, 2025

I built this project for my parents, who are planning to open an electric shop. They needed a simple but reliable POS (Point of Sale) system to manage inventory, track stock, and handle customer orders.

Beyond solving a real business need, this project has been an invaluable learning experience for improving my full-stack development skills and gaining a deeper understanding of JavaScript's multi-function capabilities.

> **Note:** I wish I'd uploaded my progress to GitHub earlier, but I fell into the classic trap of waiting for it to be "good enough." Lesson learned—progress over perfection!


## Getting Started

Below you'll find detailed explanations of each file and its purpose. If you'd like to try this project yourself, follow steps 1-4 to set up the basic structure, then simply copy the provided files into your project directory.

POS APP I CREATED STEP BY STEP:
1. create an empty folder
2. initialize Node (npm init -y) it will create package.json
3. install all dependencies I use Node.JS/Express (npm install express mysql2 cors)
    These packages will be listed under "dependencies" in package.json.
    - express → Web framework for building APIs (your Node backend).
    - mysql2 → MySQL client library that lets Node connect and query your MySQL/SQLite DB.
    - cors → Middleware that controls which frontend can call your backend API.
4. npm install --save-dev nodemon (developer tool)
    nodemon automatically restarts the Node server when code is changed.
    - Saves time so I don’t have to stop/start manually.

```tree
electric-shop/
├─ node_modules/
├─ package.json
├─ package-lock.json
├─ app.js
├─ public/          # frontend files (CSS, JS, assets)
└─ server/          # server files (routes, database)
```
set up the database by using mysql (so you need to have XAMPP) :
- I designed and implemented a POS (Point of Sale) database for my parents’  electric shop. The database is named electric_shop and is structured to support inventory management, billing, and sales tracking
    1. Item_Inventory (Stores detailed information about every product)
        - item_id – unique identifier for each item
        - sku – stock keeping unit (used as the barcode in-store)
        - item_name – product name
        - category – product category (e.g., cables, switches, tools)
        - quantity – current stock level
        - unit – unit of measurement (e.g., pcs, box, pack)
        - cost_price – purchase price from supplier
        - selling_price – retail price
        - minimum_stock_level – threshold for reordering
        - supplier_info – supplier details
        - date_added – when the item was first created
        - date_updated – last update timestamp
        - created_by – who added the item
        - is_active – whether the item is currently active or discontinued
    (Since this POS is only for in-store use, there’s no need for official UPC codes. Instead, the SKU is used as the barcode to identify and scan products.)

    2. Bills (Tracks all customer transactions.)
        - bill_id – unique identifier for each bill
        - order_datetime – date and time of purchase
        - total_amount – total amount of the order
        - customer_name – customer’s name (optional)
        - payment_method – e.g., cash, card, transfer
        - status – active (valid) or inactive (e.g., canceled, returned)

    3. Bill_Item (Links each bill with its purchased items.)
        - bill_item_id – unique identifier for each line item
        - bill_id – references the corresponding bill
        - sku – references the product in Item_Inventory
        - item_name – product name 
        - ordered_quantity – how many units were purchased
        - unit_price – selling price per unit at time of purchase
        - subtotal – ordered_quantity × unit_price

explanation of what each file does:
1. App.js (Express back-end)
    - listens on a port and handles requests from the frontend.
2. public/
    - js/
        - scripts.js (as the main wiring of entire front-end part)
            1.  Initial setup - Configures the application on page load
            2.  Clock management - Starts and maintains the time display
            3.  UI control - Manages Add New Item button and panel interactions
            4.  Item management - Handles adding new items to inventory via form submission
            5.  Order processing - Manages order creation, item selection, and order submission
            6.  Search & display - Initializes item search and loads items from database
            7.  Order history - Provides access to historical order records
            8.  Inventory updates - Handles stock level management
            9.  Event coordination - Wires up all UI interactions and API calls
            10. Panel management - Controls opening/closing of various UI panels

        - order_logic.js (order management system)
            1.  Order management - Maintains orderItems array and selected row tracking
            2.  item addition/updates - Adds new items or updates quantities for existing items inside orderItems
            3.  Order panel control - Opens panel with current stock and pricing data of the pressed item button.
            4.  Item selection/removal - Handles row selection, individual item removal, and reset all orderItems array
            5.  Order completion - Clears order data and resets form after successful submission
            6.  Double-click editing - Enables quantity modification by double-clicking
            7.  Currency formatting - Formats prices in Indonesian Rupiah (Rp.) format
            8.  Total calculations - Computes and displays total items and price values

        - time_display.js
            1. display the time - sets up the date and time.

        - stock_manager.js (inventory management system)(DONE handle error)
            1.  Item display - fetches and renders inventory items
            2.  Stock status monitoring -  Shows GOOD/ALERT status based on minimum stock levels
            3.  Quantity updates - Handles incoming stock additions via input fields and save buttons
            4.  Real-time UI updates - Updates stock displays and status indicators. 
            5.  API integration - Communicates with backend for stock data retrieval and updates
            6.  Input validation - Ensures positive quantity values before processing updates

        - order_history.js (order tracking and receipts)
            1.  Order history display - Fetches and renders past orders as interactive cards with key details
            2.  Bill generation - Creates detailed receipt view with itemized breakdown and totals
            3.  Modal management - Controls history modal opening/closing with backdrop interaction
            4.  Date/time formatting - Shows order timestamps in readable format

        - item_search.js (search specific item)
            1.  Multi-field search - searches across several info simultaneously
            2.  Real-time filtering - Implements debounced search with 300ms delay for smooth performance
            3.  Search stats - Shows result counts and total items with dynamic messaging
            4.  Search controls - Supports Escape key to clear search and reset to all items
            5.  API integration - Loads items from backend and maintains searchable item cache

        - add_item_ui.js (adding)
            1. Modal management - Controls modal for adding new item opening/closing with backdrop interaction

        - config.js
    - styles.css
    - index.html
3. server
    - routes/
        - stock_management_routes.js (handling and display the frontend requests for the update Quantity Modal)(the front-end file is stock_manager.js)(DONE handle error) 
            1. GET /items endpoint - Retrieves all inventory items with stock details for the modal display
            2. POST /items/:itemID endpoint - Updates item quantity in database based on item's ID
            3. Data validation -  Ensures incoming quantity values are positive and valid to prevent inaccurate inventory records.
            4. Database queries - Executes SELECT for inventory list and UPDATE for quantity changes
            5. Error handling - Manages database errors, missing items, and invalid requests with appropriate status codes
            6. Response formatting - Returns JSON success/error messages with relevant data
        
        - transaction_controller.js (handling and storing the frontend requests for the new incoming order)(the front-end file is scripts.js )
            1. POST /submittingOrder endpoint - Processes customer orders and stores transaction data
            2. Dual database storage - Inserts order summary into Bills table and itemized details into Bill_Items table
            3. Inventory synchronization - Automatically reduces item quantities in Item_Inventory when orders are placed
            4. Transaction calculations - Computes order totals and item subtotals with price validation
            5. Multi-step database operations - Executes SELECT (item verification), UPDATE (stock deduction), and INSERT (order records) queries
            6. Order validation - Ensures orderItems exist and contain valid data before processing
            7. Error handling - Manages database failures, missing items, and invalid requests with rollback safety
            8. Bill ID generation - Returns unique bill identifier for order tracking and receipt generation
        
        - inventory_routes.js  (item inventory management API)(the front-end file is item_search.js, scripts.js, add_item_ui.js)
            1. GET / endpoint - Retrieves all inventory items sorted by color and ID for frontend product button display
            2. POST / endpoint - Adds new items to inventory with complete product details and pricing
            3. Duplicate prevention - Detects and blocks duplicate SKU entries with specific error handling (ER_DUP_ENTRY)
            4. Comprehensive item data - Handles SKU, name, category, color tags, pricing, stock levels, units, and supplier info
            5. Database queries - Executes SELECT for item retrieval and INSERT for new item creation
            6. Input validation - Ensures required fields are present before database insertion
            7. Error handling - Manages database errors, duplicate entries, and insertion failures with appropriate HTTP status codes
            8. Sorted results - Returns items ordered by button color first, then itemID for organized frontend display
        
        - sales_history_routes.js (order history and transaction records API)(order_history.js)
            1. GET /bills endpoint - Retrieves complete order history with customer info, totals, and payment methods sorted by date
            2. GET /bills/:billid endpoint - Fetches detailed line items for a specific bill including SKU, item name, quantities, prices, and subtotals
            3. Number formatting - Strips unnecessary decimal places (.00) from amounts for cleaner display
            4. Bill lookup - Uses parameterized queries to fetch order details by unique bill ID
            5. Database queries - Executes SELECT operations on Bills and Bill_Item tables with custom formatting
            6. Error handling - Manages database errors and invalid bill ID requests with appropriate status codes
            7. JSON responses - Returns structured data for frontend order history display and receipt generation
    - database_pool.js
        1. Connection pooling - Creates reusable MySQL connection pool for efficient database access
        2. Pool configuration - Sets connection limits (10 concurrent) and queue management for load handling
        3. Promise-based interface - Wraps mysql2 pool with promises for async/await compatibility
        4. Connection testing - Verifies database connectivity on startup with success/error logging
        5. Resource management - Handles connection acquisition and release automatically
        6. Environment integration - Imports database credentials from config.js for centralized settings
        7. Error handling - Catches and logs connection failures during initialization
    - config.js
        1. Database credentials - Stores MySQL host, username, password, and database name
        2. Server port - Defines backend API port (3001)
        3. centralized settings - Single source for all backend configuration values
        4. Environment separation - Allows easy modification for different deployment environments