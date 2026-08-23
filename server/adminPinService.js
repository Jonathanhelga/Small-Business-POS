const crypto = require('crypto');
const admin = require('firebase-admin');

function getPinsCollection() {
    return admin.firestore().collection('adminPins');
}

function hashPin(pin, salt) {
    return crypto.scryptSync(pin, salt, 64).toString('hex');
}

async function hasAdminPin(uid) {
    const snap = await getPinsCollection().doc(uid).get();
    return snap.exists;
}

async function setAdminPin(uid, pin) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPin(pin, salt);
    await getPinsCollection().doc(uid).set({
        hash,
        salt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

async function verifyAdminPin(uid, pin) {
    const snap = await getPinsCollection().doc(uid).get();
    if (!snap.exists) return false;

    const { hash, salt } = snap.data();
    const candidate = Buffer.from(hashPin(pin, salt), 'hex');
    const stored = Buffer.from(hash, 'hex');
    if (candidate.length !== stored.length) return false;
    return crypto.timingSafeEqual(candidate, stored);
}

module.exports = { hasAdminPin, setAdminPin, verifyAdminPin, hashPin };
