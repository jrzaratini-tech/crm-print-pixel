const express = require("express"); const app = express(); app.use(express.json()); app.listen(3000, function () { console.log("API rodando na porta 3000"); }); 
const { db } = require("./firebase"); 
app.post("/api/database/init", function (req, res) { res.json({ status: "ok", message: "Firebase pronto" }); }); 
const { collection, addDoc, serverTimestamp } = require("firebase/firestore"); 
app.post("/api/database/commit", async function (req, res) { try { const data = req.body; const docRef = await addDoc(collection(db, "events"), { schema: data.schema, payload: data.payload, pageId: data.pageId, timestamp: serverTimestamp() }); res.json({ success: true, eventId: docRef.id }); } catch (e) { res.status(500).json({ error: e.message }); } }); 
