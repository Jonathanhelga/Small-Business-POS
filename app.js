// This is your Node/Express backend.
// Listens on a port (3001) and handles requests from the frontend.
const express = require('express');
const cors = require('cors');
require('./server/initDB');


const businessInformationRoutes = require('./server/routes/business_information_routes');
const itemRoutes = require('./server/routes/inventory_routes');
const orderItemRoutes = require('./server/routes/transaction_controller');
const orderHistoryRouter = require('./server/routes/sales_history_routes');
const updateItem = require('./server/routes/stock_management_routes');
const app = express();
const PORT = 3001;


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/api/business', businessInformationRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/submittingOrder', orderItemRoutes); 
app.use('/api/orderHistory', orderHistoryRouter);
app.use('/api/updateItem', updateItem);

app.listen(PORT, () => {
    console.log(`✅ Backend running on http://localhost:${PORT}`);
    if (process.send) {
        console.log("📨 Sending backend-ready to Electron...");
        process.send('backend-ready');
    } else {
        console.log("⚠️ process.send not available");
    }
});
