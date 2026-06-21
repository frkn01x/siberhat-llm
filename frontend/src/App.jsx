import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import "./App.css";

const SESSION_KEY = "siberhat_session";

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const SUGGESTIONS = [
  "Nmap ile port taraması nasıl yapılır?",
  "SQL injection nedir, nasıl test edilir?",
  "XSS açığı nasıl bulunur?",
  "Metasploit kullanımı hakkında bilgi ver",
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(getSessionId);
  const [sessions, setSessions] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Oturum listesini yükle
  const loadSessions = async () => {
    try {
      const res = await fetch("/api/sessions");
      setSessions(await res.json());
    } catch {}
  };

  // Belirli bir oturumun geçmişini yükle
  const loadHistory = async (sid) => {
    try {
      const res = await fetch(`/api/session/${sid}`);
      const history = await res.json();
      setMessages(history);
    } catch {}
  };

  useEffect(() => {
    loadSessions();
    loadHistory(sessionId);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const switchSession = (sid) => {
    setSessionId(sid);
    localStorage.setItem(SESSION_KEY, sid);
    loadHistory(sid);
    setSidebarOpen(false);
  };

  const newChat = () => {
    const id = uuidv4();
    localStorage.setItem(SESSION_KEY, id);
    setSessionId(id);
    setMessages([]);
    setSidebarOpen(false);
  };

  const deleteSession = async (sid, e) => {
    e.stopPropagation();
    await fetch(`/api/session/${sid}`, { method: "DELETE" });
    if (sid === sessionId) newChat();
    loadSessions();
  };

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, sessionId }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            loadSessions();
            break;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.token) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: updated[updated.length - 1].content + parsed.token,
                };
                return updated;
              });
            }
            if (parsed.error) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: "⚠️ " + parsed.error, error: true };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "⚠️ Sunucuya bağlanılamadı.", error: true };
        return updated;
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="layout">
      {/* Mobil overlay */}
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="logo">
          <span className="logo-icon">🎩</span>
          <span className="logo-text">SiberHat</span>
        </div>
        <button className="new-chat-btn" onClick={newChat}>+ Yeni Sohbet</button>

        <div className="sessions-label">Geçmiş Sohbetler</div>
        <div className="sessions-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${s.id === sessionId ? "active" : ""}`}
              onClick={() => switchSession(s.id)}
            >
              <span className="session-title">{s.title || "Sohbet"}</span>
              <button className="session-delete" onClick={(e) => deleteSession(s.id, e)}>✕</button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="model-info">
            <span className="model-dot" />
            Llama 3.2 3B (LoRA)
          </div>
        </div>
      </aside>

      {/* Ana alan */}
      <main className="main">
        {/* Mobil header */}
        <div className="mobile-header">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <span className="mobile-title">🎩 SiberHat</span>
          <button className="menu-btn" onClick={newChat}>＋</button>
        </div>

        <div className="chat-area">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">🛡️</div>
              <h1>SiberHat'a Hoşgeldin</h1>
              <p>Pentest, CTF, network güvenliği ve etik hacking sorularını yanıtlıyorum.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion-btn" onClick={() => sendMessage(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((m, i) => (
                <div key={i} className={`message ${m.role} ${m.error ? "error" : ""}`}>
                  <div className="message-avatar">{m.role === "user" ? "👤" : "🎩"}</div>
                  <div className="message-content">
                    {m.role === "assistant" ? (
                      m.content === "" && loading && i === messages.length - 1
                        ? <div className="typing"><span /><span /><span /></div>
                        : <ReactMarkdown>{m.content}</ReactMarkdown>
                    ) : (
                      <p>{m.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="input-area">
          <div className="input-box">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Bir siber güvenlik sorusu sor... (Enter ile gönder)"
              rows={1}
              disabled={loading}
            />
            <button className="send-btn" onClick={() => sendMessage()} disabled={!input.trim() || loading}>➤</button>
          </div>
          <p className="disclaimer">Bu araç yalnızca eğitim ve etik hacking amaçlıdır.</p>
        </div>
      </main>
    </div>
  );
}
