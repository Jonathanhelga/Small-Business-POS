const express = require('express');
const router = express.Router();
const db = require('../database_pool');

router.get('/bills', async (req, res) => {
  try {
    const billsHistoryQuery = 
    "SELECT date_time, bill_id, customer_name, "+
    "REPLACE(CAST(total_amount AS CHAR), '.00', '') AS total_amount, " +
    "payment_method FROM Bills"
    const [rows] = await db.query(billsHistoryQuery); 
    return res.status(200).json({success: true, items: rows});
  } catch (err) {
    console.error("❌ Database error:", err.message);
    res.status(500).json({ error: 'Database error failed to find the data' });
  }
});

router.get('/bills/:billid', async (req, res) => {
  try{
    const billid = req.params.billid; // Extract billid from URL parameters
    const billDetailQuery = 
    "SELECT sku, item_name, " +
    "REPLACE(CAST(quantity AS CHAR), '.00', '') AS quantity, " +
    "REPLACE(CAST(unit_price AS CHAR), '.00', '') AS unit_price, " +
    "REPLACE(CAST(subtotal AS CHAR), '.00', '') AS subtotal " +
    "FROM Bill_Item WHERE bill_id=?";
    const values = [billid];
    const [results] = await db.query(billDetailQuery, values);
    return res.status(200).json({success: true, items: results});
  }catch(err){
    console.error("❌ Database error:", err.message);
    res.status(500).json({ error: 'Database error' });
  }
})
module.exports = router;
