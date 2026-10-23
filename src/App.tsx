import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import {
  Activity, ArrowDown, ArrowUp, Bot, Check, ChevronDown, CircleHelp,
  Clock3, FileImage, ImagePlus, LoaderCircle, Menu, MessageSquare,
  Paperclip, Plus, ShieldCheck, Sparkles, Trash2, Upload, X
} from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
  filename?: string;
};
type ChatSession = { id: string; title: string; updatedAt: number; messages: ChatMessage[] };
type GalleryImage = { id: string; name: string; dataUrl: string; createdAt: number };
const SESSIONS_KEY = "luma-vision-sessions-v1";
const GALLERY_KEY = "luma-vision-gallery-v1";
function readStored<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } }
function dataUrlToFile(dataUrl: string, name: string): File { const [meta, content] = dataUrl.split(","); const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/jpeg"; const bytes = atob(content); const array = new Uint8Array(bytes.length); for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i); return new File([array], name, { type: mime }); }
function imageToDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read image")); reader.onload = () => { const img = new Image(); img.onerror = () => reject(new Error("Could not process image")); img.onload = () => { const scale = Math.min(1, 1400 / Math.max(img.width, img.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale)); const ctx = canvas.getContext("2d"); if (!ctx) return reject(new Error("Image processing is unavailable")); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", 0.78)); }; img.src = String(reader.result); }; reader.readAsDataURL(file); }); }


type TableData = { header: string[]; rows: string[][] };

function parseStructuredTable(raw: string): TableData | null {
  const trimmed = raw.trim().replace(/^```(?:json|javascript|python|markdown|md)?\s*/i, "").replace(/\s*```$/, "");

  // Render Markdown pipe tables (| heading | heading | ...), not as literal pipe text.
  const lines = trimmed.split(/\r?\n/).map(line => line.trim());
  for (let i = 0; i < lines.length - 1; i++) {
    const separator = lines[i + 1];
    const isSeparator = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(separator);
    if (!lines[i].includes("|") || !isSeparator) continue;
    const splitCells = (line: string) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
    const header = splitCells(lines[i]);
    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length; j++) {
      if (!lines[j].includes("|")) break;
      const row = splitCells(lines[j]);
      if (row.length) rows.push(row.slice(0, header.length));
    }
    if (header.length > 1) return { header, rows };
  }

  let value: unknown;
  try { value = JSON.parse(trimmed); } catch {
    // The model may return a Python-style dictionary with single quotes.
    try {
      const jsonLike = trimmed
        .replace(/([{,]\s*)([A-Za-z_][\w]*)(\s*:)/g, '$1"$2"$3')
        .replace(/'((?:\\.|[^'\\])*)'/g, (_match, content: string) => JSON.stringify(content.replace(/\\'/g, "'")));
      value = JSON.parse(jsonLike);
    } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.header) || !Array.isArray(obj.rows)) return null;
  if (!obj.header.every((cell) => typeof cell === "string" || typeof cell === "number")) return null;
  if (!obj.rows.every((row) => Array.isArray(row) && row.every((cell) => ["string", "number", "boolean"].includes(typeof cell)))) return null;
  return { header: obj.header.map(String), rows: (obj.rows as unknown[][]).map(row => row.map(String)) };
}

function MessageBody({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const table = parseStructuredTable(text);
  const codeMatch = !table && text.match(/^\s*```([\w+-]*)\s*\n([\s\S]*?)\n```\s*$/);
  const copy = async (content: string) => {
    try { await navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* Clipboard may be unavailable in non-secure contexts. */ }
  };
  if (table) return <div className="formatted-table-wrap"><div className="formatted-output-head"><span>TABLE · {table.rows.length} ROWS</span><button className="output-copy" onClick={() => void copy([table.header, ...table.rows].map(row => row.join("\t")).join("\n"))}><Copy size={13}/>{copied ? "Copied" : "Copy table"}</button></div><div className="formatted-table-scroll"><table className="formatted-table"><thead><tr>{table.header.map((h, i) => <th key={`${h}-${i}`}>{h}</th>)}</tr></thead><tbody>{table.rows.map((row, ri) => <tr key={ri}>{table.header.map((_, ci) => <td key={ci}>{row[ci] ?? ""}</td>)}</tr>)}</tbody></table></div></div>;
  if (codeMatch) return <div className="formatted-code"><div className="formatted-output-head"><span>{(codeMatch[1] || "CODE").toUpperCase()}</span><button className="output-copy" onClick={() => void copy(codeMatch[2])}><Copy size={13}/>{copied ? "Copied" : "Copy code"}</button></div><pre><code>{codeMatch[2]}</code></pre></div>;
  return <div className="formatted-text">{text.split(/(```[\s\S]*?```)/g).map((part, i) => {
    const match = part.match(/^```([\w+-]*)\n([\s\S]*?)```$/);
    if (match) return <div className="formatted-code" key={i}><div className="formatted-output-head"><span>{(match[1] || "CODE").toUpperCase()}</span><button className="output-copy" onClick={() => void copy(match[2])}><Copy size={13}/>{copied ? "Copied" : "Copy code"}</button></div><pre><code>{match[2]}</code></pre></div>;
    return <span key={i}>{part.split(/(\*\*.*?\*\*|`[^`]+`)/g).map((chunk, j) => chunk.startsWith("**") && chunk.endsWith("**") ? <strong key={j}>{chunk.slice(2, -2)}</strong> : chunk.startsWith("`") && chunk.endsWith("`") ? <code className="inline-code" key={j}>{chunk.slice(1, -1)}</code> : chunk)}</span>;
  })}</div>;
}

const API_BASE = "http://127.0.0.1:8000";
const starters = [
  { icon: "scan", title: "Describe this image", text: "Describe this image in detail, including the main subjects and background." },
  { icon: "type", title: "Read text in an image", text: "Read and transcribe all visible text as accurately as possible." },
  { icon: "layout", title: "Review a UI design", text: "Analyze this UI design and suggest practical improvements." },
  { icon: "eye", title: "Find visual details", text: "List the important visual details and explain what is happening." },
];

export default function App() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [question, setQuestion] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>(() => readStored<ChatSession[]>(SESSIONS_KEY, []));
  const [activeSessionId, setActiveSessionId] = useState<string>(() => readStored<ChatSession[]>(SESSIONS_KEY, [])[0]?.id || "");
  const [messages, setMessages] = useState<ChatMessage[]>(() => { const list = readStored<ChatSession[]>(SESSIONS_KEY, []); const active = list[0]; return active?.messages || []; });
  const [gallery, setGallery] = useState<GalleryImage[]>(() => readStored<GalleryImage[]>(GALLERY_KEY, []));
  const [showGallery, setShowGallery] = useState(false);
  const [viewImage, setViewImage] = useState<GalleryImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<"checking" | "ready" | "error">("checking");
  const [healthMessage, setHealthMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUpload, setShowUpload] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }, [sessions]);
  useEffect(() => { localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery)); }, [gallery]);

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then(async (r) => {
        const data = await r.json();
        if (r.ok && data.status === "ready") setHealth("ready");
        else {
          setHealth("error");
          setHealthMessage(data.message || "Model is not ready");
        }
      })
      .catch(() => {
        setHealth("error");
        setHealthMessage("Backend is offline. Start the local FastAPI server.");
      });
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  async function selectImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image file."); return; }
    if (file.size > 12 * 1024 * 1024) { alert("Please choose an image smaller than 12 MB."); return; }
    try {
      const dataUrl = await imageToDataUrl(file);
      setImage(file);
      setPreview(dataUrl);
      setGallery(prev => [{ id: crypto.randomUUID(), name: file.name, dataUrl, createdAt: Date.now() }, ...prev.filter(item => item.dataUrl !== dataUrl)].slice(0, 40));
      setShowUpload(false);
    } catch (error) { alert(error instanceof Error ? error.message : "Unable to open image."); }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    selectImage(e.target.files?.[0]);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    selectImage(e.dataTransfer.files?.[0]);
  }

  async function sendMessage(e?: FormEvent, preset?: string) {
    e?.preventDefault();
    const prompt = (preset ?? question).trim();
    if (!prompt || loading) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: prompt, imageUrl: preview || undefined, filename: image?.name };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setQuestion("");
    setLoading(true);
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      setActiveSessionId(sessionId);
    }

    try {
      const body = new FormData();
      body.append("question", prompt);
      if (image) body.append("image", image);
      const response = await fetch(`${API_BASE}/api/chat`, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The model request failed.");
      const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: data.answer || "No response was returned." };
      const finalMessages = [...nextMessages, assistantMessage];
      setMessages(finalMessages);
      setSessions(prev => {
        const existing = prev.find(item => item.id === sessionId);
        const title = existing?.title || prompt.slice(0, 42) || "New conversation";
        const updated: ChatSession = { id: sessionId, title, updatedAt: Date.now(), messages: finalMessages };
        return [updated, ...prev.filter(item => item.id !== sessionId)].slice(0, 50);
      });
    } catch (err) {
      const errorMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: `I couldn't reach the model. ${err instanceof Error ? err.message : "Check that the backend is running."}` };
      const finalMessages = [...nextMessages, errorMessage];
      setMessages(finalMessages);
      setSessions(prev => [{ id: sessionId, title: prev.find(item => item.id === sessionId)?.title || prompt.slice(0, 42), updatedAt: Date.now(), messages: finalMessages }, ...prev.filter(item => item.id !== sessionId)].slice(0, 50));
    } finally { setLoading(false); textarea.current?.focus(); }
  }

  function clearChat() {
    setMessages([]); setQuestion(""); setImage(null); setPreview(""); setShowUpload(true); setActiveSessionId("");
  }

  function openSession(session: ChatSession) {
    setActiveSessionId(session.id); setMessages(session.messages); setImage(null); setPreview(""); setQuestion("");
  }

  function deleteSession(id: string) {
    setSessions(prev => prev.filter(session => session.id !== id));
    if (activeSessionId === id) { setActiveSessionId(""); setMessages([]); }
  }


  return (
    <div className="app-shell" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
    }} onDrop={onDrop}>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onFileChange}/>
      {dragging && <div className="drop-overlay"><div className="drop-card"><Upload size={30}/><b>Drop your image here</b><span>PNG, JPG or WebP · up to 12 MB</span></div></div>}
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-hidden"}`}>
        <div className="brand">
          <div className="brand-mark"><Sparkles size={20}/></div>
          <div className="brand-copy"><strong>luma<span>.</span></strong><small>VISION STUDIO</small></div>
          <button className="icon-button sidebar-close" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><X size={17}/></button>
        </div>
        <button className="new-chat" onClick={clearChat}><Plus size={17}/> New conversation <span>⌘ K</span></button>
        <div className="side-label">WORKSPACE</div>
        <button className="nav-item active"><MessageSquare size={17}/> Vision chat <span className="nav-dot"/></button>
        <button className="nav-item" onClick={() => setShowGallery(true)}><ImagePlus size={17}/> Image gallery <span>{gallery.length}</span></button>
        <div className="side-label recent-label">RECENT</div>
        {sessions.length > 0 ? sessions.slice(0, 8).map(session => <div className="session-entry" key={session.id}><button className={`recent-item ${activeSessionId === session.id ? "selected" : ""}`} onClick={() => openSession(session)}><Clock3 size={15}/><span>{session.title}</span></button><button className="session-delete" title="Delete conversation" onClick={() => deleteSession(session.id)}><X size={13}/></button></div>) : <div className="empty-recent">Your saved conversations will appear here.</div>}
        <div className="sidebar-bottom">
          <div className="privacy-card"><div className="privacy-icon"><ShieldCheck size={17}/></div><div><b>Your data stays local</b><p>Images are processed on this machine.</p></div></div>
          <div className="profile-row"><div className="avatar">LV</div><div className="profile-copy"><b>Local workspace</b><span>Personal instance</span></div><button className="icon-button" aria-label="Help" title="Help"><CircleHelp size={17}/></button></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="top-left">
            {!sidebarOpen && <button className="icon-button" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}><Menu size={19}/></button>}
            <div className="breadcrumb">Workspace <span>/</span> <b>Vision chat</b></div>
          </div>
          <div className="top-actions">
            <div className={`status-pill ${health}`}><span className="status-light"/>{health === "ready" ? "Model ready" : health === "checking" ? "Connecting…" : "Backend offline"}</div>
            <button className="icon-button" aria-label="Clear conversation" title="Clear conversation" onClick={clearChat}><Trash2 size={17}/></button>
          </div>
        </header>

        <section className="chat-scroll">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="hero-orb"><div className="orb-inner"><Sparkles size={30}/></div><span className="orb-spark spark-a">✦</span><span className="orb-spark spark-b">✧</span></div>
              <div className="eyebrow"><span/> PRIVATE AI · RUNNING LOCALLY</div>
              <h1>See beyond<br/><em>the image.</em></h1>
              <p className="welcome-sub">Your visual thinking partner. Upload an image, ask anything about it, and explore the details with AI.</p>
              <div className="feature-row">
                <div><div className="feature-icon violet"><Activity size={17}/></div><span>Image understanding</span></div>
                <div><div className="feature-icon blue"><FileImage size={17}/></div><span>Visual analysis</span></div>
                <div><div className="feature-icon green"><ShieldCheck size={17}/></div><span>Local & private</span></div>
              </div>
              <div className="upload-panel">
                {preview ? (
                  <div className="selected-image">
                    <img src={preview} alt="Selected upload"/>
                    <div className="selected-meta"><b>{image?.name}</b><span>{image ? `${(image.size / 1024 / 1024).toFixed(2)} MB` : ""}</span></div>
                    <button className="icon-button" aria-label="Remove image" onClick={() => { setImage(null); URL.revokeObjectURL(preview); setPreview(""); setShowUpload(true); }}><X size={17}/></button>
                  </div>
                ) : (
                  <button className="upload-drop" onClick={() => fileInput.current?.click()}>
                    <div className="upload-symbol"><Upload size={20}/></div><div className="upload-copy"><b>Drop an image or <span>browse files</span></b><small>PNG, JPG or WebP · Maximum 12 MB</small></div><div className="upload-shortcut">Choose image <ArrowUp size={14}/></div>
                  </button>
                )}
              </div>
              <div className="suggestion-heading"><span>TRY ASKING</span><div/></div>
              <div className="suggestions">
                {starters.map((s) => <button key={s.title} className="suggestion" onClick={() => {
                  if (!image) { setQuestion(s.text); setShowUpload(true); fileInput.current?.click(); }
                  else setQuestion(s.text);
                }}><span className="suggestion-icon"><Sparkles size={15}/></span><span>{s.title}</span><ArrowDown size={14}/></button>)}
              </div>
              {health === "error" && <div className="backend-warning"><span className="warning-dot"/><div><b>Backend connection needed</b><p>{healthMessage || "Start the FastAPI server, then refresh this page."}</p></div></div>}
            </div>
          ) : (
            <div className="conversation">
              <div className="conversation-title"><div><span className="conversation-kicker">YOUR SESSION</span><h2>{sessions.find(session => session.id === activeSessionId)?.title || "Conversation"}</h2></div><span className="message-count">{messages.length} messages</span></div>
              {messages.map((m) => <div className={`message-row ${m.role}`} key={m.id}>
                <div className={`message-avatar ${m.role}`} >{m.role === "assistant" ? <Sparkles size={17}/> : "You"}</div>
                <div className="message-content">
                  <div className="message-meta"><b>{m.role === "assistant" ? "Luma Vision" : "You"}</b><span>{m.role === "assistant" ? "LFM2-VL · Local" : "Image question"}</span></div>
                  {m.imageUrl && <button className="message-image-button" onClick={() => setViewImage({ id: m.id, name: m.filename || "Uploaded image", dataUrl: m.imageUrl!, createdAt: Date.now() })} title="Open image"><img className="message-image" src={m.imageUrl} alt={m.filename || "Uploaded image"}/><span>Click to view</span></button>}
                  <MessageBody text={m.text} />
                </div>
              </div>)}
              {loading && <div className="message-row assistant"><div className="message-avatar assistant"><Sparkles size={17}/></div><div className="message-content"><div className="message-meta"><b>Luma Vision</b><span>Thinking locally</span></div><div className="thinking"><span/><span/><span/><em>{image ? "Analyzing your image…" : "Thinking…"}</em></div></div></div>}
              <div ref={bottom}/>
            </div>
          )}
        </section>

        <footer className="composer-wrap">
          {preview && <div className="composer-attachment"><img src={preview} alt="Attached image"/><div><b>{image?.name}</b><span>Attached for visual analysis</span></div><button className="icon-button" onClick={() => { setImage(null); URL.revokeObjectURL(preview); setPreview(""); }} aria-label="Remove attached image"><X size={16}/></button></div>}
          <form className="composer" onSubmit={(e) => sendMessage(e)}>
            <textarea ref={textarea} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={image ? "Ask about the image or anything else…" : "Message Luma Vision — image optional"} rows={1} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} />
            <div className="composer-bottom">
              <div className="composer-tools">
                <button type="button" className="tool-button" onClick={() => fileInput.current?.click()}><Paperclip size={15}/><span>Add image</span></button>
                <button type="button" className="tool-button" onClick={clearChat}><Plus size={14}/><span>New chat</span></button><span className="local-note"><span/> Local processing · image optional</span>
              </div>
              <button type="submit" className="send-button" disabled={loading || !question.trim()} aria-label="Send message">{loading ? <LoaderCircle className="spin" size={17}/> : <ArrowUp size={18}/>}</button>
            </div>
          </form>
          <div className="footer-note">Luma can make mistakes. Verify important details. <span>·</span> Conversations and gallery are stored in this browser.</div>
        </footer>
      </main>
      {showGallery && <div className="modal-backdrop" onClick={() => setShowGallery(false)}><section className="gallery-modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><b>Image gallery</b><span>{gallery.length} images saved locally</span></div><button className="icon-button" onClick={() => setShowGallery(false)}><X size={18}/></button></div>{gallery.length ? <div className="gallery-grid">{gallery.map(item => <button className="gallery-tile" key={item.id} onClick={() => setViewImage(item)}><img src={item.dataUrl} alt={item.name}/><span>{item.name}</span></button>)}</div> : <div className="gallery-empty"><ImagePlus size={28}/><b>No uploaded images yet</b><span>Images you attach to a chat will appear here.</span><button className="tool-button" onClick={() => { setShowGallery(false); fileInput.current?.click(); }}><Upload size={15}/> Upload image</button></div>}</section></div>}
      {viewImage && <div className="modal-backdrop image-viewer-backdrop" onClick={() => setViewImage(null)}><section className="image-viewer" onClick={e => e.stopPropagation()}><div className="modal-head"><div><b>{viewImage.name}</b><span>Image preview</span></div><button className="icon-button" onClick={() => setViewImage(null)}><X size={18}/></button></div><img src={viewImage.dataUrl} alt={viewImage.name}/><div className="viewer-actions"><button className="tool-button" onClick={() => { setPreview(viewImage.dataUrl); setImage(dataUrlToFile(viewImage.dataUrl, viewImage.name)); setViewImage(null); }}><ImagePlus size={15}/> Attach to composer</button><button className="tool-button" onClick={() => { const a = document.createElement("a"); a.href = viewImage.dataUrl; a.download = viewImage.name; a.click(); }}><ArrowDown size={15}/> Save image</button></div></section></div>}
    </div>
  );
}
