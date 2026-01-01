import { API_BASE } from './config.js';
let orderHistory = [];
const container = document.getElementById('orderHistoryList');
const emptyContainer = document.getElementById('NoOrderHistory');
const containerItemsList = document.getElementById('billItemsList');
containerItemsList.innerHTML = '';
let isProcessing = false;
const formatCurrency = (value) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0 
}).format(value);

const formatCurrencyPlain = (value) => new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
}).format(value);

const createCell = (className, text) => {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    return div;
}
async function fetchOrderHistory(){
    try{
        const response = await fetch(`${API_BASE}/api/orderHistory/bills`);
        const data = await response.json().catch(() => null);
        if (!response.ok) { 
            console.error("Backend error:", data?.error ||  "Unknown error");
            alert(`⚠️ Error: ${data?.error || "Failed to load items"}`);
            return;
        }
        console.log(`success: ${data.success}`);
        const orderHistory = data.items || [];
        container.innerHTML = '';   
        emptyContainer.innerHTML = '';
        if(orderHistory.length === 0){
            emptyContainer.innerHTML = '<p>No past orders found.</p>';
            return;
        }

        orderHistory.forEach(order => {
            const safeTimeString = order.date_time.replace(' ', 'T') + 'Z';
            const dateObj = new Date(safeTimeString);
            const options = {
                year: 'numeric',
                month: 'short',  // e.g., "Jan", "Dec"
                day: 'numeric',
            };
            const userFriendlyDate = new Intl.DateTimeFormat(undefined, options).format(dateObj);
            const div = document.createElement('div');
            div.className = 'order-card';
            div.innerHTML = `
                <h3><b>${userFriendlyDate}</b></h3>
                <p><b>Bill ID:</b> ${order.bill_id}</p>
                <p><b>Customer:</b> ${order.customer_name}</p>
              
                <p><b>Total:</b> ${formatCurrency(order.total_amount)}</p>
                <p><b>Payment:</b> ${order.payment_method}</p>
            `;
            
            const btn = document.createElement('button');
            btn.textContent = 'View Details';

            btn.addEventListener('click', () => {
                if (isProcessing) { return; }
                isProcessing = true;
                btn.disabled = true;
                btn.textContent = 'Loading...';

                viewOrderDetails(order.bill_id, order.date_time, order.total_amount);

                setTimeout(() => {
                    isProcessing = false;
                    btn.disabled = false;
                    btn.textContent = 'View Details';
                }, 2000); // 2 second timeout
            });
            div.appendChild(btn);
            container.appendChild(div);
        });
    }catch(err){
        console.error("Error loading order history:", err);
        document.getElementById('orderHistoryList').innerHTML =
        '<p style="color:red;">Failed to load order history.</p>';
    }
}
export async function viewOrderDetails(billId, dateTime, totalAmount) {
  try {
    if(!billId){ return }
    containerItemsList.innerHTML = '';
    const response = await fetch(`${API_BASE}/api/orderHistory/bills/${billId}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        console.log(`success: ${data.success}`);
        console.error("Backend error:", data?.error || "Unknown error");
        alert(`⚠️ Error: ${data?.error || "Failed to load items"}`);
        return;
    }
    console.log(`success: ${data.success}`);
    
    const Itemsdata = data.items;
    if (Itemsdata.length === 0) { 
        alert("Sorry, No Items found with this ID, try another bill ID");
        return;
    }
    
    const elements = {
        Message: document.getElementById('alertForError'),
        invoiceNum: document.getElementById('invoiceNumber'),
        billDate: document.getElementById('billDate'),
        billTime: document.getElementById('billTime'),
        billTotalItems: document.getElementById('billTotalItems'),
        billSubtotal: document.getElementById('billSubtotal'),
        billTax: document.getElementById('billTax'),
        billGrandTotal: document.getElementById('billGrandTotal'),
    };
    elements.invoiceNum.textContent = billId;
    const safeTimeString = dateTime.replace(' ', 'T') + 'Z';
    const dateObj = new Date(safeTimeString);
    const optionDate = {
        year: 'numeric',
        month: 'short',  // e.g., "Jan", "Dec"
        day: 'numeric',
    };
    const optionTime = {
        hour: '2-digit', // e.g., "01", "13"
        minute: '2-digit',
        hour12: true    // Use 24-hour format (change to true for AM/PM)
    };
    elements.billDate.textContent = new Intl.DateTimeFormat(undefined, optionDate).format(dateObj);
    elements.billTime.textContent = new Intl.DateTimeFormat(undefined, optionTime).format(dateObj);

    let totalItems = Number(0);
    Itemsdata.forEach(item => {
        totalItems += Number(item.quantity);
        const divItemsList = document.createElement('div');
        divItemsList.className = 'bill-item';
    
        divItemsList.append((() => {
            const div = document.createElement('div');
            div.append(
                createCell('item-name-cell', item.item_name), 
                createCell('item-sku-cell', item.sku)   
            );
            return div;
            })(),
            createCell('qty-cell', item.quantity),
            createCell('price-cell', formatCurrencyPlain(item.unit_price)),
            createCell('total-cell', formatCurrencyPlain(item.subtotal))
        );

        containerItemsList.append(divItemsList);
    });
    
    elements.billTotalItems.textContent = totalItems;
    elements.billSubtotal.textContent = formatCurrency(totalAmount);

    let tax = Number(0);
    elements.billTax.textContent = formatCurrency(tax);

    let grandTotal = Number(totalAmount) + Number(tax);
    elements.billGrandTotal.textContent = formatCurrency(grandTotal);
    } catch (err) {
        console.error("Error loading order items:", err);
          alert("Failed to load order details. Please try again.");
    }
}
export async function loadListOfOrderHistory(){
    fetchOrderHistory();
    const modal = document.getElementById('orderHistoryModal');
    modal.addEventListener('click', function (event) {
        if(event.target === modal){
            closeOrderHistory();
        }
    })
    modal.style.display = 'block';
}
export function closeOrderHistory(){
    const modal = document.getElementById('orderHistoryModal');
    modal.style.display = 'none';
}
