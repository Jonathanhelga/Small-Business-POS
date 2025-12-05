const express = require('express');
const router = express.Router();
const dbPromise = require('../db');
console.log('businessInformationRoutes loaded');

router.post('/', async(req, res) => {
    try{
        const db = await dbPromise;
        const {
            business_name,
            business_address,
            business_phone,
            business_instagram,
            business_email,
            tax_rate,         
            invoice_prefix,
            printer_size,     
            footer_message
        } = req.body;

        const sql = `INSERT INTO Business_Information
        (businessID, business_name, business_address, business_phone, business_instagram, business_email, tax_rate, invoice_prefix, printer_size, footer_message)
        VALUES(1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            business_name,
            business_address,
            business_phone,
            business_instagram,
            business_email,
            tax_rate,
            invoice_prefix,
            printer_size,
            footer_message
        ];
        const result = await db.run(sql, values);
        return res.status(200).json({
            success: true,
            message: "Business configuration saved successfully!",
        })
    }catch(err){
        console.error("UHMM I think there's something wrong with the back-end side");
        return;
    }
})

router.get('/user', async(req, res) => {
    try{
        const db = await dbPromise;
        const result = await db.all("SELECT * FROM Business_Information");
        console.log(result);
        const rows = result.length;
        res.status(200).json({
        length: rows,
        success: true,
        result: result
        });
    }catch(err){
        console.error("❌ Database error:", err.message);
        res.status(500).json({ error: 'Database error' });
    }
})

module.exports = router;