const express = require('express');
const router = express.Router();
const db = require('../database_pool');
/**
 * To create the item-card for updateQuantityModal we need several columns from the database
 * 1. item_name
 * 2. sku
 * 3. cost_price
 * 4. selling_price
 * 5. minimum_stock_level
 * 6. item_quantity
 */

// GET all items
async function pullItemInventory(){
  const itemInventoryQuery = 'SELECT itemID, item_name, sku, cost_price, selling_price, minimum_stock_level, item_quantity FROM Item_Inventory ORDER BY itemID ASC;';
  const [itemResults] = await db.query(itemInventoryQuery);

  if(!itemResults || itemResults.length === 0){
    throw new Error(`Can't find any item inside the inventory, try again later.`);//this one is err.message
  }
  return itemResults;
}

router.get('/items', async (req, res) => {
  try {
    const itemResults = await pullItemInventory();
    return res.status(200).json({
      success: true,
      items: itemResults
    });
  } catch (err) {
    console.error("❌ Database error:", err.message);
    return res.status(500).json({ success: false, error: 'Database error' });
  }
});

router.post('/items/:itemID', async (req, res) => {
  try {
    const itemID = req.params.itemID;
    const { total } = req.body;
    if (!(total) || total <= 0) {
      return res.status(400).json({ error: "Incoming quantity must be greater than 0" });
    }//even though already set up a condition on the front-end part to prevent quantity input is less than 1 
    const updateQuantityQuery = `
      UPDATE Item_Inventory 
      SET item_quantity = ? 
      WHERE sku = ? OR itemID = ?
    `;
    const values = [total, itemID, itemID];

    const [result] = await db.query(updateQuantityQuery, values);

    if (result.affectedRows === 0) { return res.status(404).json({ success: false, message: "Item not found" }); }

    console.log("Updated item:", itemID);
    return res.status(200).json({ success: true, itemID, message: "item quantity updated" });

  } catch (err) {
    console.error("❌ Database error:", err.message);
    return res.status(500).json({ success: false, error: 'Database error' });
  }
});


module.exports = router;
