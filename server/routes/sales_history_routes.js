const express = require('express');
const router = express.Router();
const dbPromise = require('../db');

router.get('/bills', async (req, res) => {
  try {
    const db = await dbPromise;
    const billsHistoryQuery = 
    "SELECT date_time, bill_id, customer_name, "+
    "REPLACE(CAST(total_amount AS CHAR), '.00', '') AS total_amount, " +
    "payment_method FROM Bills"
    const rows = await db.all(billsHistoryQuery); 
    return res.status(200).json({success: true, items: rows});

  } catch (err) {
    console.error("❌ Database error:", err.message);
    res.status(500).json({ error: 'Database error failed to find the data' });
  }
});


router.get('/bills/:billid', async (req, res) => {
  try{
    const db = await dbPromise;
    const billid = req.params.billid; // Extract billid from URL parameters
    const billDetailQuery = `
      SELECT sku, item_name,
             printf('%g', quantity) AS quantity,
             printf('%g', unit_price) AS unit_price,
             printf('%g', subtotal) AS subtotal
      FROM bill_item
      WHERE bill_id = ?
    `;
    const values = [billid];
    const results = await db.all(billDetailQuery, values);

    return res.status(200).json({success: true, items: results});
  }catch(err){
    console.error("❌ Database error:", err.message);
    res.status(500).json({ error: 'Database error' });
  }
})
module.exports = router;
