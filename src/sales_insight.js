import Chart from 'chart.js/auto'
import { toggleModal } from './modal-handler';
import { fetchUserProfile, fetchInventory, fetchOrders, getCurrentCurrency as currentCurrency } from './firebase';
import { formatCurrency, getCurrencySymbol } from './formatCurrency';
import { showToast } from './toast';

let inventory_item = [];
let orders = [];
let chartInstance = null;
let topItemsSortKey = 'revenue';
let topItemsSortDir = 'desc';
let topItemsRows = [];

export async function initInsights(user){
    if(!user){ return; }
    try{
        await fetchUserProfile(user.uid);
        inventory_item = await fetchInventory(user.uid);
        orders = await fetchOrders(user.uid);
        setupToolBar();
    }catch(err){
        console.error('Failed to load inventory:', err);
    }
}

export async function refreshInsights(user){
    if(!user){ return; }
    try{
        orders = await fetchOrders(user.uid);
        const activeChip = document.querySelector('.c-chip.is-active');
        const range = activeChip ? activeChip.dataset.range : 'today';
        filterOrders(getStartDate(range), new Date());
    }catch(err){
        console.error('Failed to refresh insights:', err);
    }
}

function getStartDate(range) {                            
    const d = new Date();
    if (range === "today") { d.setHours(0, 0, 0, 0); } 
    else if (range === "7d") {d.setDate(d.getDate() - 7); } 
    else if (range === "30d") {d.setDate(d.getDate() - 30); } 
    else if (range === "month") { d.setDate(1); d.setHours(0, 0, 0, 0); }
    return d;
}                                                            

function setupToolBar(){
    document.getElementById('sales-insights-open').addEventListener('click', () => {
        document.getElementById('js-sales-from').value = todayInputValue();
        document.getElementById('js-sales-to').value = todayInputValue();
        toggleModal('sales-insights-modal');
        toggleModal('features-modal');
    });
    const chips = document.querySelectorAll('.c-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c=> { c.classList.remove('is-active'); })
            chip.classList.add('is-active');
            const range = chip.dataset.range;
            const now = new Date();
            let startDate = getStartDate(range);
            filterOrders(startDate, now);
        });
    });

    document.getElementById('js-sales-apply').addEventListener('click', applyCustomRange);
    setupTopItemsSort();

    // document.getElementById('js-sales-to').value = todayInputValue();

    let startDate = getStartDate("today");
    filterOrders(startDate, new Date());
}

function setupTopItemsSort(){
    const headers = document.querySelectorAll('.c-sales__col-sortable');
    headers.forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (key === topItemsSortKey) {
                topItemsSortDir = topItemsSortDir === 'desc' ? 'asc' : 'desc';
            } else {
                topItemsSortKey = key;
                topItemsSortDir = 'desc';
            }
            headers.forEach(h => {
                h.classList.toggle('is-active', h.dataset.sort === topItemsSortKey);
                h.classList.toggle('is-asc', h.dataset.sort === topItemsSortKey && topItemsSortDir === 'asc');
            });
            renderTopItemsTable();
        });
    });
}

function parseDateInput(value){
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// Local YYYY-MM-DD for today, matching what <input type="date"> expects.
function todayInputValue(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function applyCustomRange(){
    const fromInput = document.getElementById('js-sales-from');
    const toInput = document.getElementById('js-sales-to');
    const startDate = parseDateInput(fromInput.value);
    const endDate = parseDateInput(toInput.value);

    if (!startDate || !endDate) {
        showToast('Please pick both a From and a To date.', 'error');
        return;
    }
    if (startDate > endDate) {
        showToast('"From" date must be on or before "To" date.', 'error');
        return;
    }

    document.querySelectorAll('.c-chip').forEach(c => c.classList.remove('is-active'));
    filterOrders(startDate, endDate);
}

function fillTopItemsTable(filtered_orders){
    const popularItem = new Map();
    const revenuePerItem = new Map();
    inventory_item.forEach(item => {
        popularItem.set(item.itemName, 0);
        revenuePerItem.set(item.itemName, 0);
    });
    filtered_orders.forEach(order => {
        order.items.forEach(item => {
            if(popularItem.has(item.name)){
                popularItem.set(item.name, popularItem.get(item.name) + item.quantity);
                revenuePerItem.set(item.name, revenuePerItem.get(item.name) + item.subtotal);
            }
        });
    });

    topItemsRows = [];
    popularItem.forEach((quantity, name) => {
        topItemsRows.push({ name, quantity, revenue: revenuePerItem.get(name) });
    });

    renderTopItemsTable();
}

function renderTopItemsTable(){
    const tbody = document.getElementById('js-sales-top-items');
    const emptyState = document.getElementById('js-sales-top-empty');

    if (topItemsRows.length === 0) {
        tbody.replaceChildren();
        tbody.parentElement.hidden = true;
        emptyState.hidden = false;
        return;
    }
    tbody.parentElement.hidden = false;
    emptyState.hidden = true;

    const dir = topItemsSortDir === 'asc' ? 1 : -1;
    const sorted = [...topItemsRows].sort((a, b) => (a[topItemsSortKey] - b[topItemsSortKey]) * dir);

    tbody.replaceChildren();
    sorted.forEach((row, i) => {
        const tableRow = document.createElement('tr');
        const tableData1 = document.createElement('td');
        tableData1.className = 'c-sales__col-rank';
        tableData1.textContent = i + 1;
        const tableData2 = document.createElement('td');
        tableData2.textContent = row.name;
        const tableData3 = document.createElement('td');
        tableData3.className = 'c-sales__col-num';
        tableData3.textContent = row.quantity;
        const tableData4 = document.createElement('td');
        tableData4.className = 'c-sales__col-num';
        tableData4.textContent = `${getCurrencySymbol(currentCurrency())} ${formatCurrency(row.revenue, currentCurrency())}`;
        tableRow.appendChild(tableData1);
        tableRow.appendChild(tableData2);
        tableRow.appendChild(tableData3);
        tableRow.appendChild(tableData4);
        tbody.appendChild(tableRow);
    });
}

function fillInKPI(filtered_orders){
    let revenue = 0;
    let totalOrder = filtered_orders.length;
    let totalItemSold = 0;
    let profit = 0;
    filtered_orders.forEach(order => {
        revenue += order.totalPrice;
        order.items.forEach(item => {
            totalItemSold += item.quantity;
            profit += item.subtotal - ((item.cost ?? 0) * item.quantity);
        })
    })

    const symbol = getCurrencySymbol(currentCurrency());
    document.getElementById('js-kpi-revenue').textContent = `${symbol} ${formatCurrency(revenue, currentCurrency())}`;
    document.getElementById('js-kpi-orders').textContent = totalOrder;
    document.getElementById('js-kpi-items').textContent = totalItemSold;
    document.getElementById('js-kpi-profit').textContent = `${symbol} ${formatCurrency(profit, currentCurrency())}`;
}

function filterOrders(startingDate, endDate){
    const rangeEnd = new Date(endDate);
    const isMidnight = rangeEnd.getHours() === 0 && rangeEnd.getMinutes() === 0 && rangeEnd.getSeconds() === 0 && rangeEnd.getMilliseconds() === 0;
    if (isMidnight) { rangeEnd.setHours(23, 59, 59, 999); }

    let filteredOrder = [];
    orders.forEach(order => {
        let orderDate = order.createdAt.toDate();
        if(orderDate >= startingDate && orderDate <= rangeEnd){ filteredOrder.push(order); }
    });

    fillInKPI(filteredOrder);
    renderChart(filteredOrder, startingDate, rangeEnd);
    fillTopItemsTable(filteredOrder);
}

function dayKey(date){
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function bucketRevenueByDay(filtered_orders, startDate, endDate){
    const buckets = new Map();
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    const stop = new Date(endDate);
    stop.setHours(0, 0, 0, 0);
    while (cursor <= stop) {
        buckets.set(dayKey(cursor), 0);
        cursor.setDate(cursor.getDate() + 1);
    }

    filtered_orders.forEach(order => {
        const key = dayKey(order.createdAt.toDate());
        if (buckets.has(key)) { buckets.set(key, buckets.get(key) + order.totalPrice); }
    });

    return { labels: [...buckets.keys()], values: [...buckets.values()] };
}

function renderChart(filtered_orders, startDate, endDate){
    const canvas = document.getElementById('charts-design');
    const emptyState = document.getElementById('js-sales-chart-empty');

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    if (filtered_orders.length === 0) {
        canvas.hidden = true;
        emptyState.hidden = false;
        return;
    }
    canvas.hidden = false;
    emptyState.hidden = true;

    const { labels, values } = bucketRevenueByDay(filtered_orders, startDate, endDate);

    chartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Revenue',
                data: values,
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: 'rgb(0, 45, 117)',
                borderWidth: 1,
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${getCurrencySymbol(currentCurrency())} ${formatCurrency(ctx.parsed.y, currentCurrency())}`,
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (v) => `${getCurrencySymbol(currentCurrency())} ${formatCurrency(v, currentCurrency())}` },
                },
            },
        },
    });
}

