const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(cors());
app.use(express.json());

// ======================
// SQLite DB (자동 생성)
// ======================
const db = new sqlite3.Database("./will.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS wills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      encrypted_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ======================
// 유언 저장 API
// ======================
app.post("/api/will", (req, res) => {
  const { encryptedWill } = req.body;

  if (!encryptedWill) {
    return res.status(400).json({ error: "encryptedWill 필요" });
  }

  const stmt = db.prepare(
    "INSERT INTO wills (encrypted_data) VALUES (?)"
  );

  stmt.run(encryptedWill, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // 🔑 이 ID가 스마트컨트랙트에 저장됨
    res.json({ willId: this.lastID.toString() });
  });

  stmt.finalize();
});

// ======================
// 유언 조회 API (claim 단계)
// ======================
app.get("/api/will/:id", (req, res) => {
  const { id } = req.params;

  db.get(
    "SELECT encrypted_data FROM wills WHERE id = ?",
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: "유언 없음" });

      res.json({ encryptedData: row.encrypted_data });
    }
  );
});

// ======================
app.listen(4000, () => {
  console.log("Backend running at http://localhost:4000");
});
