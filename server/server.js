const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { sendOTP } = require('./emailServices');
const { hasAdminPin, setAdminPin, verifyAdminPin } = require('./adminPinService');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (fs.existsSync(keyPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
} else {
    admin.initializeApp();
}
const db = admin.firestore();
const otpsCol = db.collection('otps');

const app = express();
const port = process.env.PORT || 3000;

const rateLimit = require('express-rate-limit')
const sendOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                    // 5 OTP requests per IP per window
    message: { error: "Too many OTP requests from this IP. Please try again in 15 minutes." },
    standardHeaders: true,     // adds RateLimit-* headers so clients can see their quota
    legacyHeaders: false,      // disables the old X-RateLimit-* headers
});

const verifyOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                   // 10 verification attempts per IP per window
    message: { error: "Too many verification attempts. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
});

const adminPinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                   // 10 set/verify attempts per IP per window
    message: { error: "Too many PIN attempts. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Generous: called once per checkout so the transaction can validate promo
// expiry against server time instead of a possibly-wrong device clock.
const serverTimeLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,  // 5 minutes
    max: 120,                  // 120 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
});

// Only the app's own frontends may call these endpoints from a browser.
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
    : [
        'https://minipos-d9d92.web.app',
        'https://minipos-d9d92.firebaseapp.com',
        'http://localhost:5173',
    ];

app.use(cors({ origin: allowedOrigins, methods: ['POST', 'GET'] }));
app.use(express.json());


const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^\d{6}$/; // matches the otp-generator config in emailServices.js (6 digits only)
const PIN_RE = /^\d{4}$/;

// Verifies the caller's Firebase ID token and attaches the resulting uid to req.
// Used for endpoints that act on a specific account (admin PIN) so a client can
// never act on behalf of a uid it doesn't hold a valid session for.
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) { return res.status(401).json({ error: "Missing authorization token" }); }
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        req.uid = decoded.uid;
        next();
    } catch (error) {
        console.error("Failed to verify ID token:", error);
        res.status(401).json({ error: "Invalid or expired session" });
    }
}

app.post('/api/send-otp', sendOtpLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email || !EMAIL_RE.test(String(email).trim())) {
        return res.status(400).json({ error: "A valid email address is required" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    try {
        const otp = await sendOTP(normalizedEmail);
        await otpsCol.doc(normalizedEmail).set({
            email: normalizedEmail,
            otp,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS)
        });
        res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
        console.error("Failed to send OTP:", error);
        res.status(500).json({ error: "Failed to send verification email" });
    }
});

app.post('/api/verify-otp', verifyOtpLimiter, async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !EMAIL_RE.test(String(email).trim())) {
        return res.status(400).json({ error: "A valid email address is required" });
    }
    if (!otp || !OTP_RE.test(String(otp).trim())) {
        return res.status(400).json({ error: "A valid 6-digit code is required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const docRef = otpsCol.doc(normalizedEmail);

    try {
        const snap = await docRef.get();

        if (!snap.exists) {
            return res.status(400).json({ error: "No code was requested for this email" });
        }

        const record = snap.data();

        if (record.expiresAt.toMillis() < Date.now()) {
            await docRef.delete();
            return res.status(400).json({ error: "Code has expired. Please request a new one." });
        }
        if (String(otp) !== String(record.otp)) {
            return res.status(400).json({ error: "Incorrect code" });
        }

        await docRef.delete(); // one-time use
        res.status(200).json({ message: "Code verified" });
    } catch (error) {
        console.error("Failed to verify OTP:", error);
        res.status(500).json({ error: "Failed to verify code" });
    }
});

// Admin PIN is verified/stored entirely server-side (in the adminPins collection,
// which firestore.rules denies to all client access, same as /otps) so the client
// never holds a hash it could brute-force offline in a devtools console.
app.post('/api/admin-pin/status', requireAuth, async (req, res) => {
    try {
        res.status(200).json({ hasPin: await hasAdminPin(req.uid) });
    } catch (error) {
        console.error("Failed to check admin PIN status:", error);
        res.status(500).json({ error: "Failed to check PIN status" });
    }
});

app.post('/api/admin-pin/set', adminPinLimiter, requireAuth, async (req, res) => {
    const { pin } = req.body;
    if (!pin || !PIN_RE.test(String(pin))) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
    }
    try {
        await setAdminPin(req.uid, String(pin));
        res.status(200).json({ message: "PIN saved" });
    } catch (error) {
        console.error("Failed to save admin PIN:", error);
        res.status(500).json({ error: "Failed to save PIN" });
    }
});

app.post('/api/admin-pin/verify', adminPinLimiter, requireAuth, async (req, res) => {
    const { pin } = req.body;
    if (!pin || !PIN_RE.test(String(pin))) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
    }
    try {
        const ok = await verifyAdminPin(req.uid, String(pin));
        if (!ok) { return res.status(401).json({ error: "Incorrect Admin PIN" }); }
        res.status(200).json({ message: "PIN verified" });
    } catch (error) {
        console.error("Failed to verify admin PIN:", error);
        res.status(500).json({ error: "Failed to verify PIN" });
    }
});

// Lets the client validate promo expiry against a clock it can't tamper with,
// instead of trusting its own (possibly wrong) device time.
app.get('/api/server-time', serverTimeLimiter, (req, res) => {
    res.status(200).json({ now: Date.now() });
});

app.listen(port, () => console.log(`Backend Server running on port ${port}`));
