const express = require("express");
const path = require("path");
const app = express();

app.use(express.json());

// 🔹 SERVIR ARQUIVOS ESTÁTICOS (FRONTEND)
app.use(express.static(__dirname));

// 🔹 ROTA PRINCIPAL (/)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 🔹 TESTE DE VIDA
app.post("/api/database/init", (req, res) => {
  res.json({ status: "ok", message: "Firebase pronto" });
});

// 🔹 FIREBASE
const { db } = require("./firebase");
const { collection, addDoc, serverTimestamp } = require("firebase/firestore");

app.post("/api/database/commit", async (req, res) => {
  try {
    const data = req.body;
    const docRef = await addDoc(collection(db, "events"), {
      schema: data.schema,
      payload: data.payload,
      pageId: data.pageId,
      timestamp: serverTimestamp()
    });
    res.json({ success: true, eventId: docRef.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🔹 PORTA (RENDER)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("API rodando na porta", PORT);
});
