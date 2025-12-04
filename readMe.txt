In this version I migrated from mySQL to SQLite so then the app can be truely offline, without needing the user to install or set up anything 

first step:
1. npm install sqlite3
2. make a new file: `db.js` to create SQLite Connection (db.js)
3. initialize tables instead of create .sql dumb (initDB.js)
4. update the routes where usually mySQL queries like (db.query) in SQLite has three main methods: 
  - .all(...) → get multiple rows
  - .get(...) → get one row
  - .run(...) → run insert/update/delete
5. Package the DB file inside the package,json->build->files, include the .sqlite file:
  ```json
  "files": [
    "main.js",
    "app.js",
    "db.js",
    "initDB.js",
    "electricshop.sqlite",
    "public/**/*",
    "server/**/*",
    "node_modules/**/*"
  ]
  ```

I built this project for my parents, who are planning to open an electric shop. They needed a simple but reliable POS (Point of Sale) system to manage inventory, track stock, and handle customer orders.

What I Built :

* A desktop app with Electron + Express + SQLite
* Inventory management: add, update, and track product stock
* Order handling**: create and process customer transactions
* Sales history: view order records for tracking performance
* Works offline, so it doesn’t rely on internet connectivity

small detail TO BE UPDATED:
- no item found alert (🔍 No items found Try searching for different keywords)DONE
- no Order History alert (No past orders found.)
- update inventory modal if no item exists