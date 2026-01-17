// ===============================
// CRM PRINT PIXEL - SERVER FINAL
// ===============================

const express = require("express");
const path = require("path");
const app = express();

// -------- CONFIG BÁSICA --------
app.use(express.json());

// -------- FRONTEND (HTML) --------
// Serve index.html, style.css, pages/, admin/, core/
app.use(express.static(__dirname));

// Rota principal (/)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// -------- FIREBASE --------
const { db } = require("./firebase");
const { collection, addDoc, serverTimestamp } = require("firebase/firestore");

// -------- API --------

// Teste de vida (GET – navegador)
app.get("/api/database/init", (req, res) => {
  res.json({
    status: "ok",
    message: "Firebase pronto",
    env: "online"
  });
});

// Teste de vida (POST – sistema)
app.post("/api/database/init", (req, res) => {
  res.json({
    status: "ok",
    message: "Firebase pronto (POST)"
  });
});

// Gravar evento no Firestore
app.post("/api/database/commit", async (req, res) => {
  try {
    const data = req.body;

    const docRef = await addDoc(collection(db, "events"), {
      schema: data.schema || "default",
      payload: data.payload || {},
      pageId: data.pageId || "unknown",
      timestamp: serverTimestamp()
    });

    res.json({
      success: true,
      eventId: docRef.id
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// -------- PORTA (RENDER) --------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("CRM PRINT PIXEL ONLINE - PORTA " + PORT);
});
