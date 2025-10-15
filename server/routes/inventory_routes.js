const express = require('express');
const router = express.Router();
const db = require('../database_pool');

// GET all items
async function pullItemInventory(){
  const itemInventoryQuery = 'SELECT * FROM Item_Inventory ORDER BY button_color ASC, itemID ASC;';
  const [itemResults] = await db.query(itemInventoryQuery);

  if(!itemResults || itemResults.length === 0){
    throw new Error(`Failed to load the button`);
  }
  return itemResults;
}

router.get('/', async (req, res) => {
  try {
    const itemResults = await pullItemInventory();
    res.status(200).json({success: true, items: itemResults});
  } catch (err) {
    console.error("❌ Database error:", err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      sku,
      item_name,
      tagCategory,
      tagColor,
      cost_price,
      selling_price,
      minimum_stock_level,
      item_quantity,
      item_unit,
      supplier_info,
      description
    } = req.body;

    const sql = `
      INSERT INTO Item_Inventory 
      (sku, item_name, category, button_color, cost_price, selling_price, minimum_stock_level, item_quantity, item_unit, supplier_info, description) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      sku,
      item_name,
      tagCategory,
      tagColor,
      cost_price,
      selling_price,
      minimum_stock_level,
      item_quantity,
      item_unit,
      supplier_info,
      description
    ];
    const [result] = await db.query(sql, values);
    if (result.affectedRows === 0) {
      throw new Error("Failed to insert item");
    }
    res.status(201).json({ success: true, message: 'Item added successfully' });

  } catch (err) {
    console.error("❌ Error inserting item:", err);

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Item already exists' });
    }

    res.status(500).json({ error: 'Failed to insert item' });
  }
});




module.exports = router;
