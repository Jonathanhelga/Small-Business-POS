const express = require('express');
const router = express.Router();
const dbPromise = require('../db');

async function updateQuantity2(db, sku, newValue){
    try{
        const sql = `UPDATE Item_Inventory SET item_quantity = ? WHERE sku = ?`;
        const values = [newValue, sku];

        const result = await db.run(sql, values);
        if(result.changes === 0){
            console.log("NO item found with that SKU");
            return;
        }
        console.log("Quantity successfully updated");
        return;
    }catch(err){
        console.log("Error updating the quantity: ", err);
        throw err;
    }
}
async function insertOrder(orderItems, customerName, paymentMethod){
    const totalAmount = orderItems.reduce((sum, item) => {
        return sum + (parseFloat(item.price) * parseFloat(item.quantity));
    }, 0);
    const db = await dbPromise;
    const orderDate = new Date().toISOString();
    const billSql = `
    INSERT INTO Bills (date_time, total_amount, customer_name, payment_method, status) 
    VALUES (?, ?, ?, ?, 'Active')
    `;
    
    
    const billValues = [
        orderDate,
        totalAmount,
        customerName,
        paymentMethod
    ]

    const result = await db.run(billSql, billValues);

    if(result.changes === 0){
        throw new Error("Failed to insert bill");
    }
    const billId = result.lastID; 

    insertBillItems2(billId, orderItems);
    
    return billId;
}
async function insertBillItems2(billId, orderItems){
    try{
        // console.log(orderItems);
        const db = await dbPromise;
        
        for(const item of orderItems){
            const skuQuery = `SELECT sku, item_quantity FROM Item_Inventory WHERE item_name = ?`;
            const skuResult = await db.get(skuQuery, [item.name])

            if (!skuResult) {
                throw new Error(`Failed to find SKU for item: ${item.name}`);
            }

            const { sku, item_quantity } = skuResult;

            await updateQuantity2(db, sku, item_quantity - item.quantity)
            const subtotal = parseFloat(item.price) * parseFloat(item.quantity);
            const itemQuery = `INSERT INTO Bill_Item (bill_id, sku, item_name, quantity, unit_price, subtotal) 
            VALUES (?, ?, ?, ?, ?, ?)`
            const itemValues = [
                billId,
                sku,
                item.name,
                parseFloat(item.quantity),
                parseFloat(item.price),
                parseFloat(subtotal.toFixed(2)), // ensure number
            ];
            await db.run(itemQuery, itemValues);
        }
    }catch(err){
        console.error("❌ insertBillItems error:", err.message);
        throw err;
    }
}
router.post('/', async(req, res) => {
    try{
        const { orderItems, customerName, paymentMethod} = req.body

        if (!orderItems || orderItems.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one item must be ordered' });
        }

        const billId = await insertOrder(orderItems, customerName, paymentMethod);
        res.json({ success: true, billId });
    }catch(err) {
        console.error("❌ Error inserting order:", err);
        res.status(500).json({ success: false, message: err.message });
    }
})

module.exports = router;