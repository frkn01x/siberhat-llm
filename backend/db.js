const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "chat.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "Sen SiberHat adlı bir siber güvenlik asistanısın. YALNIZCA siber güvenlik, pentest, CTF, network güvenliği, web güvenliği, zafiyet analizi, etik hacking, kriptografi ve ilgili teknik konularda yardım ediyorsun. Siber güvenlikle alakasız sorulara 'Bu konuda yardımcı olamam, yalnızca siber güvenlik konularında destek veriyorum.' şeklinde kısa bir yanıt ver. Türkçe sorulara Türkçe, İngilizce sorulara İngilizce cevap ver.",
};

function ensureSession(sessionId) {
  const existing = db.prepare("SELECT id FROM sessions WHERE id = ?").get(sessionId);
  if (!existing) {
    db.prepare("INSERT INTO sessions (id, title) VALUES (?, ?)").run(sessionId, "Yeni Sohbet");
  }
}

function getMessages(sessionId) {
  return db.prepare("SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
}

function addMessage(sessionId, role, content) {
  ensureSession(sessionId);
  db.prepare("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)").run(sessionId, role, content);

  // İlk user mesajını oturum başlığı olarak kaydet
  if (role === "user") {
    const count = db.prepare("SELECT COUNT(*) as c FROM messages WHERE session_id = ? AND role = 'user'").get(sessionId);
    if (count.c === 1) {
      const title = content.slice(0, 50);
      db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, sessionId);
    }
  }
}

function getSessions() {
  return db.prepare("SELECT id, title, created_at FROM sessions ORDER BY created_at DESC LIMIT 30").all();
}

function deleteSession(sessionId) {
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

function getFullHistory(sessionId) {
  ensureSession(sessionId);
  const msgs = getMessages(sessionId);
  return [SYSTEM_PROMPT, ...msgs];
}

module.exports = { addMessage, getSessions, deleteSession, getFullHistory, ensureSession };
