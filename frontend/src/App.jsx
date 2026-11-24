import React, { useState, useRef, useEffect } from "react";

// Robust Markdown formatter supporting Code Blocks, Headers, Lists, Bold, and Inline Code
function FormattedMarkdown({ content, isDark = true }) {
  if (!content) return null;

  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className={`space-y-2.5 text-sm leading-relaxed ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
      {parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).trim().split("\n");
          const firstLine = lines[0].trim();
          const hasLang = firstLine && !firstLine.includes(" ");
          const language = hasLang ? firstLine : "";
          const codeBody = hasLang ? lines.slice(1).join("\n") : lines.join("\n");

          return (
            <div
              key={index}
              className={`my-3 rounded-lg overflow-hidden border font-mono text-xs shadow-md ${
                isDark ? "border-zinc-700/80 bg-zinc-950" : "border-slate-300 bg-slate-900"
              }`}
            >
              {language && (
                <div
                  className={`px-3 py-1 text-[11px] font-semibold border-b uppercase tracking-wider ${
                    isDark ? "bg-zinc-800/80 text-zinc-400 border-zinc-700/60" : "bg-slate-800 text-slate-300 border-slate-700"
                  }`}
                >
                  {language}
                </div>
              )}
              <pre className="p-3 text-indigo-300 overflow-x-auto whitespace-pre">
                <code>{codeBody}</code>
              </pre>
            </div>
          );
        }

        // Regular text formatting (headings, lists, paragraphs)
        const paragraphs = part.split(/\n\n+/);
        return paragraphs.map((para, pIdx) => {
          const trimmed = para.trim();
          if (!trimmed) return null;

          // Headings
          if (trimmed.startsWith("### ")) {
            return (
              <h3 key={pIdx} className={`text-base font-bold mt-4 mb-1 ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                {renderInline(trimmed.slice(4), isDark)}
              </h3>
            );
          }
          if (trimmed.startsWith("## ")) {
            return (
              <h2
                key={pIdx}
                className={`text-lg font-bold mt-5 mb-1.5 border-b pb-1 ${
                  isDark ? "text-zinc-100 border-zinc-800" : "text-slate-900 border-slate-200"
                }`}
              >
                {renderInline(trimmed.slice(3), isDark)}
              </h2>
            );
          }
          if (trimmed.startsWith("# ")) {
            return (
              <h1 key={pIdx} className={`text-xl font-extrabold mt-6 mb-2 ${isDark ? "text-white" : "text-slate-950"}`}>
                {renderInline(trimmed.slice(2), isDark)}
              </h1>
            );
          }

          // Bullet list or numbered list
          const lines = trimmed.split("\n");
          const isList = lines.every((line) => /^(\* |- |\d+\. )/.test(line.trim()));

          if (isList) {
            return (
              <ul key={pIdx} className="space-y-1.5 my-2 pl-2">
                {lines.map((line, lIdx) => {
                  const cleaned = line.trim().replace(/^(\* |- |\d+\. )/, "");
                  return (
                    <li key={lIdx} className="flex items-start gap-2">
                      <span className={`mt-1 text-xs ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>•</span>
                      <span>{renderInline(cleaned, isDark)}</span>
                    </li>
                  );
                })}
              </ul>
            );
          }

          // Normal Paragraph
          return (
            <p key={pIdx} className="my-1.5">
              {lines.map((l, lIdx) => (
                <React.Fragment key={lIdx}>
                  {renderInline(l, isDark)}
                  {lIdx < lines.length - 1 && <br />}
                </React.Fragment>
              ))}
            </p>
          );
        });
      })}
    </div>
  );
}

// Inline parser for bold, italics, and inline code
function renderInline(text, isDark = true) {
  if (!text) return "";
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return tokens.map((tok, i) => {
    if (tok.startsWith("`") && tok.endsWith("`")) {
      return (
        <code
          key={i}
          className={`px-1.5 py-0.5 rounded font-mono text-xs font-medium border ${
            isDark ? "bg-zinc-800 border-zinc-700 text-indigo-300" : "bg-slate-100 border-slate-300 text-indigo-700"
          }`}
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith("**") && tok.endsWith("**")) {
      return (
        <strong key={i} className={`font-semibold ${isDark ? "text-zinc-100" : "text-slate-900"}`}>
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith("*") && tok.endsWith("*")) {
      return (
        <em key={i} className={`italic ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
          {tok.slice(1, -1)}
        </em>
      );
    }
    return tok;
  });
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadToast, setUploadToast] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedSources, setExpandedSources] = useState({});
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [systemHealth, setSystemHealth] = useState({ gateway: "checking", rag: "checking" });

  // Persistent Light/Dark theme state (defaults to dark)
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("eduquery-theme");
    return saved ? saved === "dark" : true;
  });

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const API_BASE = "http://localhost:5000/api";

  const starterPrompts = [
    { title: "Summarize Syllabus", desc: "Overview of key modules & concepts", query: "Summarize the core concepts and units from my uploaded notes." },
    { title: "Explain AVL Rotations", desc: "LL, RR, LR, RL balancing cases", query: "Explain AVL tree balancing rotations and their time complexity." },
    { title: "Exam / Viva Questions", desc: "5 rigorous test questions", query: "Generate 5 tough viva or exam questions based on my course material." },
    { title: "Algorithm Complexities", desc: "Compare sorting & graph algorithms", query: "Compare time and space complexities of QuickSort, MergeSort, and HeapSort." },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Sync theme changes with DOM and localStorage
  useEffect(() => {
    localStorage.setItem("eduquery-theme", isDark ? "dark" : "light");
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  // Load documents and check system health on mount
  useEffect(() => {
    fetchDocuments();
    checkHealth();

    const interval = setInterval(() => {
      checkHealth();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setSystemHealth({
          gateway: data.gateway || "online",
          rag: data.ragService === "online" ? "online" : "offline",
        });
      } else {
        setSystemHealth({ gateway: "error", rag: "offline" });
      }
    } catch {
      setSystemHealth({ gateway: "offline", rag: "offline" });
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.warn("Could not fetch documents:", err);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "txt", "md"].includes(ext)) {
      setUploadToast({ type: "error", message: "Only PDF, TXT, and MD files are supported." });
      setTimeout(() => setUploadToast(null), 5000);
      return;
    }

    setIsUploading(true);
    setUploadToast({ type: "info", message: `Extracting, chunking & embedding "${file.name}"...` });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadToast({
        type: "success",
        message: `Successfully ingested "${file.name}" (${data.chunkCount} chunks generated)!`,
      });
      fetchDocuments();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setUploadToast({ type: "error", message: err.message || "Failed to upload document." });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadToast(null), 6000);
    }
  };

  const handleDeleteDocument = async (docId, filename) => {
    try {
      setDocuments((prev) => prev.filter((d) => d.documentId !== docId));
      const res = await fetch(`${API_BASE}/documents/${docId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        fetchDocuments();
      }
    } catch (err) {
      console.error("Delete error:", err);
      fetchDocuments();
    }
  };

  const handleSend = async (queryText) => {
    const query = (queryText || input).trim();
    if (!query || isLoading) return;

    setInput("");
    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: query,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Server responded with ${response.status}`);
      }

      const botMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer || "No response received.",
        sources: data.sources || [],
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `⚠️ **Request Error**: ${err.message}\n\nPlease verify that both the backend (:5000) and RAG service (:8000) are running.`,
          isError: true,
          sources: [],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSourceExpand = (msgId, sourceIdx) => {
    const key = `${msgId}-${sourceIdx}`;
    setExpandedSources((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
  };

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden font-sans antialiased transition-colors duration-200 ${
        isDark
          ? "bg-zinc-950 text-zinc-100 selection:bg-indigo-600 selection:text-white"
          : "bg-slate-50 text-slate-800 selection:bg-indigo-500 selection:text-white"
      }`}
    >
      {/* 1. LEFT COLLAPSIBLE SIDEBAR */}
      <aside
        className={`${
          sidebarOpen ? "w-80" : "w-0 -translate-x-full"
        } transition-all duration-300 ease-in-out flex flex-col border-r relative z-30 flex-shrink-0 h-full overflow-hidden ${
          isDark
            ? "border-zinc-800/80 bg-zinc-900/90 backdrop-blur-xl"
            : "border-slate-200 bg-white/95 backdrop-blur-xl shadow-lg"
        }`}
      >
        {/* Brand Header */}
        <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-zinc-800" : "border-slate-200"}`}>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 font-black text-sm text-white">
              EQ
            </div>
            <div>
              <h2 className={`font-bold text-sm tracking-wide flex items-center gap-1.5 ${isDark ? "text-zinc-100" : "text-slate-900"}`}>
                EduQuery AI
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-semibold border border-indigo-500/30">
                  RAG
                </span>
              </h2>
              <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Academic Knowledge Hub</p>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className={`p-1 rounded-md transition ${
              isDark ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            }`}
            title="Collapse Sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition shadow-sm border ${
              isDark
                ? "bg-zinc-800/80 hover:bg-zinc-700/80 border-zinc-700/60 text-zinc-200 hover:text-white"
                : "bg-slate-100 hover:bg-slate-200/90 border-slate-300/80 text-slate-700 hover:text-slate-900"
            }`}
          >
            <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>New Chat Session</span>
          </button>
        </div>

        {/* Upload Zone */}
        <div className="px-3 py-2">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-xl p-3.5 text-center cursor-pointer transition group ${
              isDark
                ? "border-zinc-700/80 hover:border-indigo-500/80 bg-zinc-950/40 hover:bg-indigo-950/10"
                : "border-slate-300 hover:border-indigo-500 bg-slate-50/70 hover:bg-indigo-50/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
              }}
              className="hidden"
            />
            {isUploading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-1">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px] font-medium text-indigo-500 animate-pulse">
                  Chunking & Embedding...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                    isDark
                      ? "bg-zinc-800 text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10"
                      : "bg-slate-200 text-slate-600 group-hover:text-indigo-600 group-hover:bg-indigo-100"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <p className={`text-xs font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`}>Drop syllabus or notes</p>
                <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>Supports PDF, TXT, MD (Max 25MB)</p>
              </div>
            )}
          </div>
        </div>

        {/* Knowledge Base Header & List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="flex items-center justify-between px-1 py-1.5 text-[11px] font-semibold tracking-wider uppercase">
            <span className={isDark ? "text-zinc-400" : "text-slate-500"}>Knowledge Base ({documents.length})</span>
            <button
              onClick={fetchDocuments}
              className={`text-xs transition ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-700"}`}
              title="Refresh Knowledge Base"
            >
              ↻
            </button>
          </div>

          {documents.length === 0 ? (
            <div
              className={`p-3 text-center rounded-xl border ${
                isDark ? "bg-zinc-950/30 border-zinc-800/40 text-zinc-400" : "bg-slate-100/60 border-slate-200 text-slate-500"
              }`}
            >
              <p className="text-xs">No documents indexed yet.</p>
              <p className="text-[10px] mt-0.5 opacity-80">Upload a PDF to ground AI responses.</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.documentId}
                className={`group flex items-center justify-between p-2.5 rounded-lg border transition ${
                  isDark
                    ? "bg-zinc-950/40 hover:bg-zinc-800/50 border-zinc-800/60"
                    : "bg-white hover:bg-slate-100 border-slate-200 shadow-sm"
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-6 h-6 rounded bg-indigo-500/10 text-indigo-500 flex items-center justify-center flex-shrink-0 text-xs">
                    📄
                  </div>
                  <div className="truncate">
                    <p className={`text-xs font-medium truncate ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
                      {doc.filename}
                    </p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      {doc.chunkCount} vector chunks
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDocument(doc.documentId, doc.filename);
                  }}
                  className={`opacity-0 group-hover:opacity-100 p-1 rounded transition ${
                    isDark
                      ? "text-zinc-500 hover:text-rose-400 hover:bg-zinc-800"
                      : "text-slate-400 hover:text-rose-600 hover:bg-slate-200"
                  }`}
                  title="Remove from knowledge base"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Live System Status Bar */}
        <div
          className={`p-3 border-t text-xs flex flex-col gap-1.5 ${
            isDark ? "border-zinc-800 bg-zinc-950/60" : "border-slate-200 bg-slate-100/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium ${isDark ? "text-zinc-400" : "text-slate-500"}`}>System Pipeline:</span>
            <span className={`text-[10px] font-mono ${isDark ? "text-zinc-500" : "text-slate-400"}`}>Port 5000 ➔ 8000</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  systemHealth.gateway === "online" ? "bg-emerald-400" : "bg-rose-500"
                } ${systemHealth.gateway === "online" ? "animate-pulse" : ""}`}
              />
              <span className={isDark ? "text-zinc-300" : "text-slate-700"}>Gateway (Node)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  systemHealth.rag === "online" ? "bg-emerald-400" : "bg-rose-500"
                } ${systemHealth.rag === "online" ? "animate-pulse" : ""}`}
              />
              <span className={isDark ? "text-zinc-300" : "text-slate-700"}>RAG Engine (FastAPI)</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CHAT WORKSPACE */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        {/* Workspace Top Header */}
        <header
          className={`h-14 border-b flex items-center justify-between px-4 z-10 flex-shrink-0 transition-colors duration-200 ${
            isDark
              ? "border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md"
              : "border-slate-200/90 bg-white/80 backdrop-blur-md shadow-sm"
          }`}
        >
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className={`p-1.5 rounded-lg transition ${
                  isDark ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                }`}
                title="Expand Sidebar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <h1 className={`font-semibold text-sm ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
              Academic Query Workspace
            </h1>
            <span className={`text-[11px] font-mono hidden sm:inline ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              • {documents.length} document{documents.length !== 1 ? "s" : ""} active
            </span>
          </div>

          {/* Header Controls: Clear Chat + Light/Dark Mode Switcher */}
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={handleNewChat}
                className={`text-xs px-2.5 py-1 rounded-md transition ${
                  isDark
                    ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                }`}
              >
                Clear Messages
              </button>
            )}

            {/* LIGHT / DARK MODE TOGGLE BUTTON */}
            <button
              onClick={() => setIsDark((prev) => !prev)}
              className={`p-1.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-medium shadow-sm ${
                isDark
                  ? "bg-zinc-800/90 border-zinc-700/80 text-amber-300 hover:bg-zinc-700 hover:text-amber-200"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-indigo-600"
              }`}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? (
                /* Sun Icon */
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                /* Moon Icon */
                <svg className="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
              <span className="text-[11px] font-semibold hidden md:inline">
                {isDark ? "Light" : "Dark"}
              </span>
            </button>
          </div>
        </header>

        {/* Toast Notification Banner */}
        {uploadToast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
            <div
              className={`p-3 rounded-xl border text-xs shadow-xl flex items-center justify-between ${
                uploadToast.type === "success"
                  ? isDark
                    ? "bg-emerald-950/90 border-emerald-800/80 text-emerald-200"
                    : "bg-emerald-100 border-emerald-300 text-emerald-900"
                  : uploadToast.type === "error"
                  ? isDark
                    ? "bg-rose-950/90 border-rose-800/80 text-rose-200"
                    : "bg-rose-100 border-rose-300 text-rose-900"
                  : isDark
                  ? "bg-indigo-950/90 border-indigo-800/80 text-indigo-200"
                  : "bg-indigo-100 border-indigo-300 text-indigo-900"
              }`}
            >
              <span>{uploadToast.message}</span>
              <button onClick={() => setUploadToast(null)} className="ml-2 font-bold opacity-60 hover:opacity-100">
                ×
              </button>
            </div>
          </div>
        )}

        {/* Message Stream or Empty Welcome State */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto w-full space-y-6">
            {messages.length === 0 ? (
              /* Perplexity-style Welcome Empty State */
              <div className="pt-10 pb-6 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-500/25 mb-4 font-black text-xl text-white">
                  EQ
                </div>
                <h2 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  What would you like to explore today?
                </h2>
                <p className={`text-sm mt-1.5 max-w-md ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                  Ask any question grounded in your course documents, exam patterns, or lecture notes.
                </p>

                {/* 4 Starter Prompts Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full">
                  {starterPrompts.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(item.query)}
                      className={`text-left p-3.5 rounded-xl border transition group shadow-sm ${
                        isDark
                          ? "border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-800/70 hover:border-indigo-500/40"
                          : "border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-300"
                      }`}
                    >
                      <p
                        className={`text-xs font-semibold transition ${
                          isDark ? "text-zinc-200 group-hover:text-indigo-300" : "text-slate-800 group-hover:text-indigo-600"
                        }`}
                      >
                        {item.title}
                      </p>
                      <p className={`text-[11px] mt-1 line-clamp-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                        {item.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Message Thread */
              messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-start gap-3 max-w-[88%] sm:max-w-[80%]">
                    {msg.role === "assistant" && (
                      <div
                        className={`h-7 w-7 rounded-lg border flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1 ${
                          isDark
                            ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400"
                            : "bg-indigo-50 border-indigo-200 text-indigo-600"
                        }`}
                      >
                        EQ
                      </div>
                    )}

                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-tr-none"
                          : msg.isError
                          ? isDark
                            ? "bg-rose-950/40 border border-rose-800/50 text-rose-200 rounded-tl-none w-full"
                            : "bg-rose-50 border border-rose-200 text-rose-800 rounded-tl-none w-full"
                          : isDark
                          ? "bg-zinc-900/90 border border-zinc-800 text-zinc-100 rounded-tl-none w-full"
                          : "bg-white border border-slate-200 text-slate-800 rounded-tl-none w-full shadow-sm"
                      }`}
                    >
                      {/* Message Content with Markdown Formatting */}
                      {msg.role === "assistant" ? (
                        <div className="relative group/msg">
                          <FormattedMarkdown content={msg.content} isDark={isDark} />
                          {/* Copy Response Button */}
                          <button
                            onClick={() => copyToClipboard(msg.content, idx)}
                            className={`absolute -top-1 -right-1 opacity-0 group-hover/msg:opacity-100 p-1.5 rounded-md text-xs transition ${
                              isDark
                                ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 shadow-sm"
                            }`}
                            title="Copy response"
                          >
                            {copiedIndex === idx ? (
                              <span className="text-emerald-500 text-[10px] font-semibold">Copied!</span>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      )}

                      {/* Interactive Grounded Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className={`mt-3 pt-3 border-t ${isDark ? "border-zinc-800" : "border-slate-200"}`}>
                          <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2 ${
                            isDark ? "text-zinc-400" : "text-slate-500"
                          }`}>
                            <span>Retrieved Sources ({msg.sources.length})</span>
                          </div>

                          <div className="space-y-1.5">
                            {msg.sources.map((src, sIdx) => {
                              const isExpanded = expandedSources[`${msg.id}-${sIdx}`];
                              return (
                                <div
                                  key={sIdx}
                                  className={`rounded-lg border overflow-hidden text-xs transition ${
                                    isDark
                                      ? "border-zinc-800/80 bg-zinc-950/60"
                                      : "border-slate-200 bg-slate-50/80"
                                  }`}
                                >
                                  <button
                                    onClick={() => toggleSourceExpand(msg.id, sIdx)}
                                    className={`w-full flex items-center justify-between p-2 text-left transition ${
                                      isDark ? "hover:bg-zinc-800/40" : "hover:bg-slate-100"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 overflow-hidden">
                                      <span className="text-indigo-500">📄</span>
                                      <span className={`font-medium truncate ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                                        {src.filename || src.document_id || "Document"}
                                      </span>
                                      {src.page && (
                                        <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                                          isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-200 text-slate-600"
                                        }`}>
                                          Page {src.page}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {src.score && (
                                        <span className="text-[10px] text-emerald-500 font-mono font-semibold">
                                          {(src.score * 100).toFixed(0)}% match
                                        </span>
                                      )}
                                      <span className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                                        {isExpanded ? "▲" : "▼"}
                                      </span>
                                    </div>
                                  </button>

                                  {isExpanded && (
                                    <div
                                      className={`p-2.5 border-t text-xs font-serif leading-relaxed italic border-l-2 border-l-indigo-500 ${
                                        isDark
                                          ? "border-zinc-800/60 bg-zinc-950 text-zinc-400"
                                          : "border-slate-200 bg-slate-100/70 text-slate-700"
                                      }`}
                                    >
                                      "{src.snippet}"
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-start gap-3">
                <div
                  className={`h-7 w-7 rounded-lg border flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1 ${
                    isDark
                      ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400"
                      : "bg-indigo-50 border-indigo-200 text-indigo-600"
                  }`}
                >
                  EQ
                </div>
                <div
                  className={`border rounded-2xl rounded-tl-none px-4 py-3 text-xs flex items-center gap-2.5 shadow-sm ${
                    isDark
                      ? "bg-zinc-900 border-zinc-800 text-zinc-400"
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                >
                  <div className="flex gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce" />
                  </div>
                  <span>Retrieving knowledge chunks & synthesizing academic response...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 3. BOTTOM FLOATING INPUT DOCK */}
        <footer
          className={`p-4 flex-shrink-0 transition-colors duration-200 ${
            isDark
              ? "bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent"
              : "bg-gradient-to-t from-slate-50 via-slate-50 to-transparent"
          }`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className={`max-w-3xl mx-auto flex items-end gap-2 border rounded-2xl p-2 transition shadow-xl ${
              isDark
                ? "bg-zinc-900/90 border-zinc-800 focus-within:border-indigo-500/80 focus-within:ring-1 focus-within:ring-indigo-500/40"
                : "bg-white border-slate-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30"
            }`}
          >
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isLoading}
              placeholder="Ask a question about your syllabus, lecture notes, or assignments..."
              className={`flex-1 max-h-32 bg-transparent text-sm placeholder-zinc-500 focus:outline-none resize-none px-2 py-1.5 disabled:opacity-50 ${
                isDark ? "text-zinc-100 placeholder-zinc-500" : "text-slate-900 placeholder-slate-400"
              }`}
            />

            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl transition shadow-md shadow-indigo-600/30 flex-shrink-0"
              title="Send Query"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </form>
          <p className={`text-center text-[10px] mt-2 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
            EduQuery AI grounds all answers with vector embeddings and synthesizes with Google Gemini.
          </p>
        </footer>
      </main>
    </div>
  );
}
