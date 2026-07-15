const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { sendOTP } = require('./emailServices');

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

// Only the app's own frontends may call these endpoints from a browser.
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
    : [
        'https://minipos-d9d92.web.app',
        'https://minipos-d9d92.firebaseapp.com',
        'http://localhost:5173',
    ];

app.use(cors({ origin: allowedOrigins, methods: ['POST'] }));
app.use(express.json());


const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

app.post('/api/send-otp', sendOtpLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) { return res.status(400).json({ error: "Email address is required" }); }
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
    if (!email || !otp) { return res.status(400).json({ error: "Email and code are required" }); }

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

app.listen(port, () => console.log(`Backend Server running on port ${port}`));
