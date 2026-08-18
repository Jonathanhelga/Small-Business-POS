import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, addDoc, getDoc, updateDoc, deleteDoc, collection, query, where, orderBy, getDocs, serverTimestamp, runTransaction, increment, startAfter, limit } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "minipos-d9d92.firebaseapp.com",
  projectId: "minipos-d9d92",
  storageBucket: "minipos-d9d92.firebasestorage.app",
  messagingSenderId: "481588556736",
  appId: "1:481588556736:web:ae014a234e674f16990e25",
  measurementId: "G-ZVV40CPVKP"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export async function registerUser(email, password) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    return user;
}
export async function submitSettingsData(formData){
    const user = auth.currentUser;
    if (!user) throw new Error("No user logged in!");
    await setDoc(doc(db, "users", user.uid), {
        username: formData.username,
        currency: formData.currency || 'IDR',
        business_name: formData.businessName,
        business_address: formData.businessAddress,
        business_phone: formData.businessPhone ,
        business_instagram: formData.businessInst,
        business_email: formData.businessEmail,
        tax_rate: formData.tax_rate,
        invoice_prefix: formData.invoice_prefix,
        printer_size: formData.paper_size,
        receipt_footer: formData.receipt_footer,
        created_at: serverTimestamp(),
        ownerId: user.uid
    });

}

export async function loginUser(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
}

export async function LogOutUser(){
    clearCachedUserProfile();
    await signOut(auth);
}

let cachedUserProfile = null;

export function getCachedUserProfile() { return cachedUserProfile; }

// Convenience reader over the cached profile's currency, defaulting to IDR when
// no profile is loaded. Centralizes the getCachedUserProfile()?.currency || 'IDR'
// expression that the money-formatting modules previously each redeclared.
export function getCurrentCurrency() { return cachedUserProfile?.currency || 'IDR'; }

export function setCachedUserProfile(profile) { cachedUserProfile = profile; }

export function clearCachedUserProfile() {cachedUserProfile = null; } 

export async function submitItemData(itemData, uid){
    try {
        const inventoryRef = collection(db, "inventory");
        const docRef = await addDoc(inventoryRef, {
            ...itemData,
            createdAt: serverTimestamp(),
            lastUpdated: serverTimestamp(), // Better for sorting than local time
            updateQuantity: false,
            ownerId: uid
        });

        return {
            id: docRef.id,
            ...itemData,
            ownerId: uid 
        };
    } catch (error) {
        console.error("Error adding document: ", error);
        throw error;
    }
}

export async function fetchInventory(uid) {
    const q = query(
        collection(db, "inventory"),
        where("ownerId", "==", uid),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchOrders(uid) {
    const q = query(
        collection(db, "orders"),
        where("ownerId", "==", uid),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchUserProfile(uid) {
    if (cachedUserProfile) return cachedUserProfile;
    const snap = await getDoc(doc(db, "users", uid));
    cachedUserProfile = snap.exists() ? snap.data() : null;
    return cachedUserProfile;
}

// Runs the whole checkout as one transaction: stock floors and promo lifetime
// caps are read and validated in the same round-trip that writes the order, so
// two cashiers checking out the last unit (or the last promo slot) at the same
// moment can't both succeed. Firestore retries the callback itself if another
// write lands on one of these documents mid-transaction.
export async function submitOrder(orderPayload, uid){
    const orderRef = doc(collection(db, "orders"));
    const inventoryRefs = orderPayload.items.map(item => doc(db, "inventory", item.id));

    await runTransaction(db, async (transaction) => {
        const inventorySnaps = [];
        for (const ref of inventoryRefs) {
            inventorySnaps.push(await transaction.get(ref));
        }

        orderPayload.items.forEach((item, i) => {
            const snap = inventorySnaps[i];
            const label = item.name || item.id;
            if (!snap.exists()) {
                throw new Error(`"${label}" no longer exists in inventory.`);
            }
            const data = snap.data();
            const currentStock = Number(data.stockLevel) || 0;
            if (currentStock < item.quantity) {
                throw new Error(`Not enough stock for "${label}" (only ${currentStock} left).`);
            }
            if (item.promoDiscountedQty > 0) {
                const remaining = data.promo?.totalLimit == null
                    ? Infinity
                    : Math.max(0, Number(data.promo.totalLimit) - (Number(data.promo.usedQty) || 0));
                if (item.promoDiscountedQty > remaining) {
                    throw new Error(`Promo limit for "${label}" has already been reached.`);
                }
            }
        });

        transaction.set(orderRef, {
            ...orderPayload,
            ownerId: uid,
            createdAt: serverTimestamp(),
        });

        orderPayload.items.forEach((item, i) => {
            const updates = {
                stockLevel: increment(-item.quantity),
                lastUpdated: serverTimestamp(),
            };
            // Only the units that actually got the promo price count against its
            // lifetime limit, so a partly-discounted line increments by less than
            // its quantity.
            if (item.promoDiscountedQty > 0) {
                updates['promo.usedQty'] = increment(item.promoDiscountedQty);
            }
            transaction.update(inventoryRefs[i], updates);
        });
    });

    return orderRef.id;
}

// Merge newly-used custom-field definitions into the user's reusable library
// Definitions are created once then re-attached, so an id already
// in the library is never overwritten — only genuinely new ids are appended.
// Keeps cachedUserProfile in sync so the checkout modal can re-offer them.
export async function saveOrderFieldDefinitions(definitions, uid) {
    if (!definitions?.length) return;

    const profile = await fetchUserProfile(uid);
    const library = Array.isArray(profile?.orderFieldLibrary) ? profile.orderFieldLibrary : [];
    const existingIds = new Set(library.map(def => def.id));

    const additions = definitions.filter(def => !existingIds.has(def.id));
    if (!additions.length) return;

    const merged = [...library, ...additions];
    await updateDoc(doc(db, "users", uid), { orderFieldLibrary: merged });

    if (cachedUserProfile) cachedUserProfile.orderFieldLibrary = merged;
}

// Categories are a simple ownerId-scoped list stored on the user profile.
// fetch returns the array (empty if unset); save overwrites it and keeps the
// cached profile in sync so the dropdowns refresh without a re-fetch.
export async function fetchCategories(uid) {
    const profile = await fetchUserProfile(uid);
    return Array.isArray(profile?.categories) ? profile.categories : [];
}

export async function saveCategories(categories, uid) {
    await updateDoc(doc(db, "users", uid), { categories });
    if (cachedUserProfile) cachedUserProfile.categories = categories;
}

export async function fetchCustomers(uid) {
    const q = query(
        collection(db, "customers"),
        where("ownerId", "==", uid),
        orderBy("name", "asc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function upsertCustomerByPhone({ name, phone }, uid) {
    const phoneKey = (phone || '').trim();
    if (phoneKey) {
        const q = query(
            collection(db, "customers"),
            where("ownerId", "==", uid),
            where("phone", "==", phoneKey)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const existing = snapshot.docs[0];
            return { id: existing.id, ...existing.data() };
        }
    }
    const docRef = await addDoc(collection(db, "customers"), {
        ownerId: uid,
        name: (name || '').trim(),
        phone: phoneKey,
        createdAt: serverTimestamp(),
    });
    return { id: docRef.id, name, phone: phoneKey };
}

export async function addStockUpdateHistory(itemId, qtyAdded, previousStock) {
    const ref = collection(db, 'inventory', itemId, 'stockUpdates');
    await addDoc(ref, { qtyAdded, previousStock, timestamp: serverTimestamp() });
}

export async function fetchStockHistory(itemId, pageSize, lastDoc = null) {
    let q = query(
        collection(db, 'inventory', itemId, 'stockUpdates'),
        orderBy('timestamp', 'desc'),
        limit(pageSize)
    );
    if (lastDoc) q = query(q, startAfter(lastDoc));
    const snap = await getDocs(q);
    return { docs: snap.docs, records: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
}

// Log an edit to an item's metadata (prices, min stock, supplier, categories,
// theme). `changes` is an array of { field, label, from, to } describing only
// the fields that actually changed. Mirrors addStockUpdateHistory, but for the
// Manage Items modal rather than the stock-update flow.
export async function addMetaUpdateHistory(itemId, changes) {
    const ref = collection(db, 'inventory', itemId, 'metaUpdates');
    await addDoc(ref, { changes, timestamp: serverTimestamp() });
}

export async function fetchMetaHistory(itemId, pageSize, lastDoc = null) {
    let q = query(
        collection(db, 'inventory', itemId, 'metaUpdates'),
        orderBy('timestamp', 'desc'),
        limit(pageSize)
    );
    if (lastDoc) q = query(q, startAfter(lastDoc));
    const snap = await getDocs(q);
    return { docs: snap.docs, records: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
}

// Update editable metadata on an inventory item (prices, supplier, min stock,
// tag color). Stock level is intentionally NOT touched here — that flows through
// the inventory-update modal.
export async function updateItemData(itemId, fields) {
    await updateDoc(doc(db, 'inventory', itemId), {
        ...fields,
        lastUpdated: serverTimestamp(),
    });
}

export async function deleteInventoryItem(itemId) {
    await deleteDoc(doc(db, 'inventory', itemId));
}

// Deleting an order must undo everything submitOrder did to inventory: restock
// the quantity AND give back any promo allowance the order consumed. Without
// the rollback, a deleted promo order permanently burns its lifetime limit.
export async function deleteOrder(orderId) {
    const orderRef = doc(db, 'orders', orderId);

    await runTransaction(db, async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) return;
        const items = orderSnap.data().items ?? [];

        const inventoryRefs = items.map(item => doc(db, "inventory", item.id));
        const inventorySnaps = [];
        for (const ref of inventoryRefs) {
            inventorySnaps.push(await transaction.get(ref));
        }

        transaction.delete(orderRef);

        items.forEach((item, i) => {
            if (!inventorySnaps[i].exists()) return;

            const updates = {
                stockLevel: increment(item.quantity),
                lastUpdated: serverTimestamp(),
            };
            if (item.promoDiscountedQty > 0) {
                updates['promo.usedQty'] = increment(-item.promoDiscountedQty);
            }
            transaction.update(inventoryRefs[i], updates);
        });
    });
}

// Atomically reserves the next auto-generated SKU for this owner. The client-side
// preview (generateNextSku in add_item_ui.js) reads the in-memory item cache, which
// can be stale across tabs/devices — two sessions previewing at once would offer the
// same "next" number. This transaction is the source of truth used at actual save
// time: it increments a per-owner counter doc, so concurrent saves always land on
// different sequence numbers. `fallbackSeed` seeds the counter the first time it's
// used, from the highest existing SKU number the caller already has in memory, so
// numbering continues where the shop's existing items left off.
export async function reserveNextSku(uid, fallbackSeed = 0) {
    const counterRef = doc(db, 'skuCounters', uid);
    const nextSeq = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(counterRef);
        const current = snap.exists() ? (Number(snap.data().value) || 0) : fallbackSeed;
        const next = current + 1;
        transaction.set(counterRef, { value: next, ownerId: uid }, { merge: true });
        return next;
    });
    return `SKU-${String(nextSeq).padStart(5, '0')}`;
}