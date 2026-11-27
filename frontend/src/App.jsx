import React, { useState, useRef, useEffect } from "react";
import {
  GraduationCap,
  ShieldCheck,
  BookOpen,
  MessageSquare,
  Bookmark,
  BarChart3,
  Sparkles,
  Layers,
  Sun,
  Moon,
  UploadCloud,
  FileText,
  Trash2,
  Eye,
  Search,
  Filter,
  Plus,
  ExternalLink,
  Send,
  RefreshCw,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Users,
  Download,
  UserCheck,
  KeyRound,
  Tag,
  Info,
} from "lucide-react";

const API_BASE = "http://localhost:5000/api";

// ==========================================
// MARKDOWN FORMATTER COMPONENT
// ==========================================
function FormattedMarkdown({ content, isDark = true }) {
  if (!content) return null;
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
              className={`my-3 rounded-xl overflow-hidden border font-mono text-xs shadow-md ${
                isDark ? "border-zinc-800 bg-zinc-950" : "border-slate-300 bg-slate-900"
              }`}
            >
              {language && (
                <div
                  className={`px-3 py-1 text-[11px] font-semibold border-b uppercase tracking-wider ${
                    isDark ? "bg-zinc-900 text-zinc-400 border-zinc-800" : "bg-slate-800 text-slate-300 border-slate-700"
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

        const paragraphs = part.split(/\n\n+/);
        return paragraphs.map((para, pIdx) => {
          const trimmed = para.trim();
          if (!trimmed) return null;

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

          const lines = trimmed.split("\n");
          const isList = lines.every((line) => /^(\* |- |\d+\. )/.test(line.trim()));

          if (isList) {
            return (
              <ul key={pIdx} className="space-y-1.5 my-2 pl-2">
                {lines.map((line, lIdx) => {
                  const cleaned = line.trim().replace(/^(\* |- |\d+\. )/, "");
                  return (
                    <li key={lIdx} className="flex items-start gap-2">
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${isDark ? "bg-indigo-400" : "bg-indigo-600"}`} />
                      <span>{renderInline(cleaned, isDark)}</span>
                    </li>
                  );
                })}
              </ul>
            );
          }

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

function renderInline(text, isDark = true) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className={`font-semibold ${isDark ? "text-zinc-100" : "text-slate-900"}`}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={index} className={isDark ? "text-zinc-300" : "text-slate-700"}>
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className={`px-1.5 py-0.5 rounded text-xs font-mono border ${
            isDark
              ? "bg-zinc-800 text-indigo-300 border-zinc-700/60"
              : "bg-slate-100 text-indigo-700 border-slate-200"
          }`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// ==========================================
// MAIN EDUQUERY APPLICATION
// ==========================================
export default function App() {
  // Theme State
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("eduquery-theme");
    return saved ? saved === "dark" : true;
  });

  // Auth & RBAC State
  const [token, setToken] = useState(() => localStorage.getItem("eduquery-token") || "");
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("eduquery-user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Persistent Student Session ID for Analytics
  const [sessionId] = useState(() => {
    let sid = localStorage.getItem("eduquery-session-id");
    if (!sid) {
      sid = "sess_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();
      localStorage.setItem("eduquery-session-id", sid);
    }
    return sid;
  });

  const [hasEntered, setHasEntered] = useState(() => {
    return Boolean(localStorage.getItem("eduquery-entered"));
  });

  const [authRole, setAuthRole] = useState(() => {
    return localStorage.getItem("eduquery-role") || "student";
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
    department: "Computer Science",
  });
  const [authError, setAuthError] = useState("");

  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState("chat"); // "chat" | "materials" | "notes" | "analytics"
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // System & Health
  const [systemHealth, setSystemHealth] = useState({ gateway: "checking", rag: "checking" });

  // Documents & Courses
  const [documents, setDocuments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("All Courses");
  const [documentSearchQuery, setDocumentSearchQuery] = useState("");
  const [materialsCourseFilter, setMaterialsCourseFilter] = useState("All Courses");

  // Document Details Modal (Student / Faculty)
  const [selectedDocDetails, setSelectedDocDetails] = useState(null);

  // Ingestion Upload State (Faculty)
  const [uploadForm, setUploadForm] = useState({ title: "", course: "", unit: "" });
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadToast, setUploadToast] = useState(null);
  const fileInputRef = useRef(null);

  // Delete Document Modal
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Chat & History
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0); // 0: Scanning, 1: Context, 2: Synthesis
  const [retryCountdown, setRetryCountdown] = useState(0); // Rate limit (429) cooldown countdown
  const messagesEndRef = useRef(null);

  // Sources & Feedback & Copying
  const [expandedSources, setExpandedSources] = useState({});
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [feedbackState, setFeedbackState] = useState({}); // { [msgId]: 'like' | 'dislike' }

  // Saved Notes
  const [savedNotes, setSavedNotes] = useState(() => {
    try {
      const saved = localStorage.getItem("eduquery-notes");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Faculty Analytics
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Sync Theme
  useEffect(() => {
    localStorage.setItem("eduquery-theme", isDark ? "dark" : "light");
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  // Sync Saved Notes
  useEffect(() => {
    localStorage.setItem("eduquery-notes", JSON.stringify(savedNotes));
  }, [savedNotes]);

  // Loading Steps Timer
  useEffect(() => {
    let timer;
    if (isLoading) {
      setLoadingStep(0);
      timer = setInterval(() => {
        setLoadingStep((prev) => (prev < 2 ? prev + 1 : prev));
      }, 900);
    }
    return () => clearInterval(timer);
  }, [isLoading]);

  // Rate-Limit (429) Cooldown Countdown Timer
  useEffect(() => {
    let timer;
    if (retryCountdown > 0) {
      timer = setInterval(() => {
        setRetryCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [retryCountdown]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Initial Data Fetching & Polling
  useEffect(() => {
    if (hasEntered) {
      fetchDocuments();
      fetchCourses();
      fetchConversations();
      checkHealth();

      const healthInterval = setInterval(checkHealth, 15000);
      return () => clearInterval(healthInterval);
    }
  }, [hasEntered, token]);

  // Track session visit
  useEffect(() => {
    if (hasEntered) {
      const trackVisit = async () => {
        try {
          await fetch(`${API_BASE}/analytics/visit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              role: user ? user.role : authRole || "student",
              userId: user ? user.id : null,
            }),
          });
        } catch {
          // ignore tracking error
        }
      };
      trackVisit();
    }
  }, [hasEntered, sessionId, user, authRole]);

  // If Analytics Tab opened, fetch analytics
  useEffect(() => {
    if (activeTab === "analytics" && isFacultyOrAdmin()) {
      fetchAnalytics();
    }
  }, [activeTab, token]);

  const getAuthHeaders = () => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  };

  const isFacultyOrAdmin = () => {
    if (user && (user.role === "faculty" || user.role === "admin")) return true;
    return authRole === "faculty" || authRole === "admin";
  };

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

  const fetchCourses = async () => {
    try {
      const res = await fetch(`${API_BASE}/courses`);
      if (res.ok) {
        const data = await res.json();
        setCourses(data);
      }
    } catch (err) {
      console.warn("Could not fetch courses:", err);
    }
  };

  const fetchConversations = async () => {
    try {
      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/chat/conversations`, { headers });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.warn("Could not fetch conversations:", err);
    }
  };

  const fetchAnalytics = async () => {
    if (!token) return;
    setIsLoadingAnalytics(true);
    try {
      const res = await fetch(`${API_BASE}/analytics`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.warn("Could not fetch analytics:", err);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  // Auth Operations
  const handleAuthSubmit = async (e) => {
    if (e) e.preventDefault();
    setAuthError("");

    const endpoint = authMode === "login" ? `${API_BASE}/auth/login` : `${API_BASE}/auth/register`;
    const payload =
      authMode === "login"
        ? { email: authForm.email, password: authForm.password }
        : {
            name: authForm.name,
            email: authForm.email,
            password: authForm.password,
            role: authRole,
            department: authForm.department,
          };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      setToken(data.token);
      setUser(data.user);
      setAuthRole(data.user.role);
      setHasEntered(true);
      setAuthModalOpen(false);

      localStorage.setItem("eduquery-token", data.token);
      localStorage.setItem("eduquery-user", JSON.stringify(data.user));
      localStorage.setItem("eduquery-role", data.user.role);
      localStorage.setItem("eduquery-entered", "true");
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleUseDemoFaculty = async () => {
    setAuthMode("login");
    setAuthRole("faculty");
    setAuthError("");

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "faculty@eduquery.edu",
          password: "Faculty@123",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Demo login failed.");
      }

      setToken(data.token);
      setUser(data.user);
      setAuthRole(data.user.role);
      setHasEntered(true);
      setAuthModalOpen(false);

      localStorage.setItem("eduquery-token", data.token);
      localStorage.setItem("eduquery-user", JSON.stringify(data.user));
      localStorage.setItem("eduquery-role", data.user.role);
      localStorage.setItem("eduquery-entered", "true");
    } catch {
      // If server unreachable, populate form
      setAuthForm({
        name: "Dr. Anish",
        email: "faculty@eduquery.edu",
        password: "Faculty@123",
        role: "faculty",
        department: "Computer Science & Engineering",
      });
      setAuthModalOpen(true);
    }
  };

  const handleContinueAsStudent = () => {
    setAuthRole("student");
    setUser({ name: "Guest Student", role: "student", department: "Undergraduate Studies" });
    setHasEntered(true);
    localStorage.setItem("eduquery-role", "student");
    localStorage.setItem("eduquery-entered", "true");
  };

  const handleSignOut = () => {
    setToken("");
    setUser(null);
    setHasEntered(false);
    setAuthRole("student");
    localStorage.removeItem("eduquery-token");
    localStorage.removeItem("eduquery-user");
    localStorage.removeItem("eduquery-role");
    localStorage.removeItem("eduquery-entered");
    setMessages([]);
    setActiveConversationId(null);
  };

  // Chat Operations
  const handleNewChat = () => {
    setMessages([]);
    setActiveConversationId(null);
    setActiveTab("chat");
  };

  const handleLoadConversation = async (convId) => {
    try {
      const res = await fetch(`${API_BASE}/chat/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveConversationId(data.id);
        if (data.courseFilter) setSelectedCourse(data.courseFilter);

        const loadedMsgs = (data.turns || []).map((t, idx) => ({
          id: `${data.id}-${idx}`,
          role: t.role,
          content: t.content,
          sources: t.sources || [],
          timestamp: t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
        }));
        setMessages(loadedMsgs);
        setActiveTab("chat");
      }
    } catch (err) {
      console.warn("Failed loading conversation:", err);
    }
  };

  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/chat/conversations/${convId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        handleNewChat();
      }
    } catch (err) {
      console.warn("Failed deleting conversation:", err);
    }
  };

  const handleSend = async (overrideText = null) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!overrideText) setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 80000);

    try {
      const res = await fetch(`${API_BASE}/chat/query`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          query: textToSend.trim(),
          conversationId: activeConversationId,
          courseFilter: selectedCourse !== "All Courses" ? selectedCourse : null,
          saveConversation: true,
        }),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorDetail = data.error || data.detail || `Query failed with status ${res.status}`;
        const errObj = new Error(errorDetail);
        errObj.status = res.status;
        throw errObj;
      }

      if (data.conversationId && !activeConversationId) {
        setActiveConversationId(data.conversationId);
        fetchConversations();
      }

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        grounded: data.grounded,
        cached: Boolean(data.cached),
        modelUsed: data.model_used,
        emptyKnowledgeBase: Boolean(data.emptyKnowledgeBase),
        queryLogId: data.queryLogId,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const isTimeout = err.name === "AbortError";
      const is429 = err.status === 429 || (err.message && (err.message.includes("429") || err.message.toLowerCase().includes("rate limit") || err.message.toLowerCase().includes("quota")));

      if (is429) {
        setRetryCountdown(15);
      }

      let errorMsg = err.message || "Failed to generate answer. Please ensure both Backend and RAG service are online.";
      if (isTimeout) {
        errorMsg = "Gateway Timeout (504): Request timed out after 80s. The RAG service or AI model is experiencing high queue latency. Please retry.";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `${errorMsg}`,
          isError: true,
          status: err.status || (isTimeout ? 504 : is429 ? 429 : 500),
          retryQuery: textToSend,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
      setLoadingStep(0);
    }
  };

  // Feedback on Answers
  const handleFeedback = async (msgId, queryLogId, feedback) => {
    setFeedbackState((prev) => ({ ...prev, [msgId]: feedback }));
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          queryLogId,
          conversationId: activeConversationId,
          feedback,
          course: selectedCourse,
        }),
      });
      setUploadToast({ message: `Recorded your ${feedback === "like" ? "positive" : "constructive"} feedback.`, type: "info" });
    } catch {
      // ignore
    }
  };

  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSaveNote = (msg) => {
    const newNote = {
      id: Date.now().toString(),
      content: msg.content,
      course: selectedCourse,
      timestamp: new Date().toLocaleString(),
    };
    setSavedNotes((prev) => [newNote, ...prev]);
    setUploadToast({ message: "Saved answer to your Bookmarked Notes.", type: "success" });
  };

  const handleDeleteNote = (noteId) => {
    setSavedNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  const handleExportChat = () => {
    if (messages.length === 0) return;
    let md = `# EduQuery AI — Academic Query Export\n\n`;
    md += `**Scope:** ${selectedCourse}  \n`;
    md += `**Date:** ${new Date().toLocaleString()}  \n`;
    md += `**User:** ${user ? user.name : "Student Session"}  \n\n---\n\n`;

    messages.forEach((m) => {
      if (m.role === "user") {
        md += `### 🙋 Student\n*${m.timestamp}*\n\n${m.content}\n\n`;
      } else {
        md += `### 🤖 EduQuery Assistant\n*${m.timestamp}*\n\n${m.content}\n\n`;
        if (m.sources && m.sources.length > 0) {
          md += `#### Citations\n`;
          m.sources.forEach((s) => {
            md += `- **${s.filename || "Document"}** (Page ${s.page || "N/A"}): "${s.snippet.trim()}"\n`;
          });
          md += `\n`;
        }
      }
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EduQuery-${selectedCourse.replace(/\s+/g, "_")}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Document Ingestion Upload (Faculty Only)
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const validateAndSetFile = (file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "txt", "md"].includes(ext)) {
      setUploadToast({ message: "Only text-based .pdf, .txt, and .md files are supported.", type: "error" });
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setUploadToast({ message: "File exceeds 30 MB maximum size limit.", type: "error" });
      return;
    }
    setSelectedFile(file);
    if (!uploadForm.title) {
      setUploadForm((prev) => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, "") }));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleUploadSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!selectedFile) {
      setUploadToast({ message: "Please select a course document to upload.", type: "error" });
      return;
    }

    if (!uploadForm.course.trim()) {
      setUploadToast({ message: "Course Code / Name is required (e.g. CS101).", type: "error" });
      return;
    }

    setIsUploading(true);
    setUploadToast({ message: "Uploading and indexing vector chunks via Gemini...", type: "info" });

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("title", uploadForm.title || selectedFile.name);
    formData.append("course", uploadForm.course.trim());
    formData.append("unit", uploadForm.unit.trim() || "General");

    try {
      const res = await fetch(`${API_BASE}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Document upload and ingestion failed.");
      }

      setUploadToast({
        message: `Indexed "${data.title}" successfully into ${data.chunkCount} vector chunks.`,
        type: "success",
      });

      // Reset Form
      setSelectedFile(null);
      setUploadForm({ title: "", course: "", unit: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Refresh documents and courses
      await fetchDocuments();
      await fetchCourses();
    } catch (err) {
      setUploadToast({ message: err.message, type: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    try {
      const res = await fetch(`${API_BASE}/documents/${docId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setUploadToast({ message: "Document and all vector chunks deleted.", type: "info" });
        setDeleteConfirm(null);
        await fetchDocuments();
        await fetchCourses();
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete document.");
      }
    } catch (err) {
      setUploadToast({ message: err.message, type: "error" });
    }
  };

  // Preview Document & Increment View Count
  const handleOpenDocDetails = async (doc) => {
    setSelectedDocDetails(doc);
    try {
      const res = await fetch(`${API_BASE}/documents/${doc.documentId}/view`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        // Update local views count
        setDocuments((prev) =>
          prev.map((d) => (d.documentId === doc.documentId ? { ...d, views: data.views } : d))
        );
      }
    } catch {
      // ignore
    }
  };

  const handleAskAboutDocument = (doc, starterPrompt = null) => {
    setSelectedDocDetails(null);
    setSelectedCourse(doc.course);
    setActiveTab("chat");
    if (starterPrompt) {
      handleSend(starterPrompt);
    }
  };

  const toggleSourceExpand = (msgId, sIdx) => {
    const key = `${msgId}-${sIdx}`;
    setExpandedSources((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getScopeDocCount = () => {
    if (selectedCourse === "All Courses") return documents.length;
    return documents.filter((d) => d.course.toLowerCase() === selectedCourse.toLowerCase()).length;
  };

  // Dynamic starter questions from uploaded documents for current scope
  const getDynamicStarterQuestions = () => {
    const relevantDocs =
      selectedCourse === "All Courses"
        ? documents
        : documents.filter((d) => d.course.toLowerCase() === selectedCourse.toLowerCase());

    const extracted = [];
    relevantDocs.forEach((d) => {
      if (d.starterQuestions && Array.isArray(d.starterQuestions)) {
        d.starterQuestions.forEach((q) => {
          if (q && !extracted.includes(q)) extracted.push(q);
        });
      }
    });

    if (extracted.length > 0) return extracted.slice(0, 4);

    if (selectedCourse !== "All Courses") {
      return [
        `What are the foundational definitions and concepts covered in ${selectedCourse}?`,
        `Summarize the key exam takeaways from the ${selectedCourse} syllabus.`,
        `Explain the core theories and problem-solving steps outlined for ${selectedCourse}.`,
      ];
    }

    return [
      "Summarize the key foundational concepts from the uploaded course notes.",
      "What are the main definitions, formulas, and theories outlined in the syllabus?",
      "Explain the step-by-step methodologies described across the materials.",
      "What are high-yield exam takeaways from the indexed course modules?",
    ];
  };

  // Filtered documents in library
  const getFilteredDocuments = () => {
    return documents.filter((d) => {
      const matchesSearch =
        documentSearchQuery === "" ||
        d.title.toLowerCase().includes(documentSearchQuery.toLowerCase()) ||
        d.filename.toLowerCase().includes(documentSearchQuery.toLowerCase()) ||
        d.course.toLowerCase().includes(documentSearchQuery.toLowerCase()) ||
        (d.unit && d.unit.toLowerCase().includes(documentSearchQuery.toLowerCase()));

      const matchesCourse =
        materialsCourseFilter === "All Courses" ||
        d.course.toLowerCase() === materialsCourseFilter.toLowerCase();

      return matchesSearch && matchesCourse;
    });
  };

  // ==========================================
  // RENDER: AUTH MODAL
  // ==========================================
  const renderAuthModal = () => {
    if (!authModalOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 transition-all ${
            isDark ? "bg-zinc-900 border-zinc-800 text-zinc-100" : "bg-white border-slate-200 text-slate-900"
          }`}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-4 border-b border-inherit">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl ${
                  authRole === "faculty"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                }`}
              >
                {authRole === "faculty" ? <ShieldCheck className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="font-bold text-base">
                  {authRole === "faculty" ? "Faculty & Admin Portal" : "Student Account"}
                </h3>
                <p className="text-xs text-zinc-500">
                  {authMode === "login" ? "Sign in to access your workspace" : "Create a new verified account"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setAuthModalOpen(false)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className={`mt-4 p-1 rounded-xl flex gap-1 ${isDark ? "bg-zinc-950" : "bg-slate-100"}`}>
            <button
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                authMode === "login"
                  ? isDark
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "bg-white text-slate-900 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setAuthMode("register");
                setAuthError("");
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                authMode === "register"
                  ? isDark
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "bg-white text-slate-900 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleAuthSubmit} className="mt-4 space-y-3.5">
            {authError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {authMode === "register" && (
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-400">Full Name</label>
                <input
                  type="text"
                  required
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  placeholder={authRole === "faculty" ? "Dr. Anish" : "Alex Rivera"}
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition ${
                    isDark
                      ? "bg-zinc-950 border-zinc-800 focus:border-indigo-500 text-white"
                      : "bg-white border-slate-300 focus:border-indigo-600 text-slate-900"
                  }`}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1 text-zinc-400">Email Address</label>
              <input
                type="email"
                required
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                placeholder={authRole === "faculty" ? "faculty@eduquery.edu" : "student@university.edu"}
                className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition ${
                  isDark
                    ? "bg-zinc-950 border-zinc-800 focus:border-indigo-500 text-white"
                    : "bg-white border-slate-300 focus:border-indigo-600 text-slate-900"
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-zinc-400">Password</label>
              <input
                type="password"
                required
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                placeholder="••••••••"
                className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition ${
                  isDark
                    ? "bg-zinc-950 border-zinc-800 focus:border-indigo-500 text-white"
                    : "bg-white border-slate-300 focus:border-indigo-600 text-slate-900"
                }`}
              />
            </div>

            {authMode === "register" && (
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-400">Department / Major</label>
                <input
                  type="text"
                  value={authForm.department}
                  onChange={(e) => setAuthForm({ ...authForm, department: e.target.value })}
                  placeholder="Computer Science & Engineering"
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition ${
                    isDark
                      ? "bg-zinc-950 border-zinc-800 focus:border-indigo-500 text-white"
                      : "bg-white border-slate-300 focus:border-indigo-600 text-slate-900"
                  }`}
                />
              </div>
            )}

            <button
              type="submit"
              className={`w-full py-2.5 rounded-xl font-semibold text-xs text-white shadow-md transition flex items-center justify-center gap-2 ${
                authRole === "faculty"
                  ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20"
                  : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20"
              }`}
            >
              <KeyRound className="h-4 w-4" />
              <span>{authMode === "login" ? "Sign In to Workspace" : "Complete Registration"}</span>
            </button>

            {/* Quick Demo Faculty Auto-fill */}
            {authRole === "faculty" && (
              <button
                type="button"
                onClick={handleUseDemoFaculty}
                className="w-full py-2 rounded-xl border border-dashed border-amber-500/40 hover:border-amber-500 text-amber-400 text-xs font-medium transition flex items-center justify-center gap-1.5"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Demo Faculty (Dr. Anish) — 1-Click Login</span>
              </button>
            )}
          </form>
        </div>
      </div>
    );
  };

  // ==========================================
  // RENDER: DOCUMENT DETAILS PREVIEW MODAL
  // ==========================================
  const renderDocDetailsModal = () => {
    if (!selectedDocDetails) return null;
    const doc = selectedDocDetails;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className={`w-full max-w-lg rounded-2xl border shadow-2xl p-6 transition-all ${
            isDark ? "bg-zinc-900 border-zinc-800 text-zinc-100" : "bg-white border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between pb-4 border-b border-inherit">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <FileText className="h-5 w-5" />
              </div>
              <div className="overflow-hidden">
                <h3 className="font-bold text-base truncate">{doc.title}</h3>
                <p className="text-xs text-zinc-500 truncate">{doc.filename}</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedDocDetails(null)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="py-4 space-y-4 text-xs">
            {/* Metadata Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                {doc.course}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700">
                {doc.unit || "General Unit"}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1">
                <Layers className="h-3 w-3 text-indigo-400" />
                {doc.chunkCount} vector chunks
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1">
                <Eye className="h-3 w-3 text-indigo-400" />
                {doc.views || 0} student views
              </span>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-zinc-400 space-y-1 text-[11px]">
              <p>
                <span className="font-semibold text-zinc-300">Uploaded By:</span> {doc.uploadedByName || "Dr. Anish"}
              </p>
              {doc.createdAt && (
                <p>
                  <span className="font-semibold text-zinc-300">Indexed:</span>{" "}
                  {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Starter Questions */}
            <div>
              <p className="font-semibold text-zinc-300 mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                Recommended Study Questions
              </p>
              <div className="space-y-1.5">
                {(doc.starterQuestions && doc.starterQuestions.length > 0
                  ? doc.starterQuestions
                  : [
                      `What are the core concepts covered in ${doc.title}?`,
                      `Explain the main algorithms and definitions in ${doc.course}.`,
                    ]
                ).map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAskAboutDocument(doc, q)}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs transition flex items-center justify-between group ${
                      isDark
                        ? "bg-zinc-950 border-zinc-800 hover:border-indigo-500/60 hover:text-indigo-300"
                        : "bg-slate-50 border-slate-200 hover:border-indigo-400 text-slate-700"
                    }`}
                  >
                    <span className="truncate pr-2">{q}</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-inherit flex items-center justify-end gap-2">
            <button
              onClick={() => setSelectedDocDetails(null)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            >
              Close
            </button>
            <button
              onClick={() => handleAskAboutDocument(doc)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Ask About This Course</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // RENDER: DELETE CONFIRMATION MODAL
  // ==========================================
  const renderDeleteConfirmModal = () => {
    if (!deleteConfirm) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className={`w-full max-w-sm rounded-2xl border shadow-2xl p-6 transition-all ${
            isDark ? "bg-zinc-900 border-zinc-800 text-zinc-100" : "bg-white border-slate-200 text-slate-900"
          }`}
        >
          <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mb-4">
            <Trash2 className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base">Delete Course Document?</h3>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Are you sure you want to delete <strong className="text-zinc-200">{deleteConfirm.title}</strong>? All
            corresponding vector chunks will be purged from the knowledge base.
          </p>

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDeleteDocument(deleteConfirm.documentId)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition shadow-md shadow-rose-600/20"
            >
              Delete Material
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // RENDER: 1. LANDING & ROLE-GATE SCREEN
  // ==========================================
  if (!hasEntered) {
    return (
      <div
        className={`min-h-screen flex flex-col justify-between transition-colors duration-200 relative overflow-hidden ${
          isDark
            ? "bg-zinc-950 text-zinc-100 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:20px_20px]"
            : "bg-slate-50 text-slate-900 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px]"
        }`}
      >
        {/* Top Navbar */}
        <header
          className={`h-16 border-b px-6 flex items-center justify-between backdrop-blur-md z-10 ${
            isDark ? "border-zinc-800/80 bg-zinc-950/70" : "border-slate-200/90 bg-white/70"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-white text-sm shadow-md shadow-indigo-600/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight">EduQuery AI</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                v2.5
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsDark((prev) => !prev)}
            className={`p-2 rounded-xl border text-xs font-medium transition flex items-center gap-1.5 ${
              isDark ? "bg-zinc-900 border-zinc-800 text-amber-300 hover:bg-zinc-800" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
            }`}
            title="Toggle Theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        {/* Hero & Role Gate Selection */}
        <main className="max-w-4xl mx-auto px-6 py-12 flex flex-col items-center text-center my-auto z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium mb-6 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm">
            <GraduationCap className="h-3.5 w-3.5" />
            <span>Academic Retrieval-Augmented Generation</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight max-w-2xl">
            Syllabus-Grounded Academic Intelligence.
          </h1>
          <p className={`mt-4 text-base max-w-xl ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
            Connect verified course syllabi, lecture notes, and study guides. Instant vector retrieval with zero hallucinations and page-level citations.
          </p>

          {/* Two Structured Role Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-10 w-full max-w-2xl">
            {/* 1. Student Portal Card */}
            <div
              className={`p-6 rounded-2xl border text-left flex flex-col justify-between transition-all duration-200 ${
                isDark
                  ? "bg-zinc-900/60 border-zinc-800 hover:border-indigo-500/60 hover:shadow-xl hover:shadow-indigo-500/10"
                  : "bg-white border-slate-200 hover:border-indigo-400 hover:shadow-xl"
              }`}
            >
              <div>
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold">Student Explorer</h3>
                <p className="text-[11px] font-mono text-indigo-400 mb-1.5">Study & Exam Assistant</p>
                <p className={`text-xs leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                  Ask questions strictly grounded in your department's uploaded course materials. Includes citations, bookmarks, and markdown export.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-inherit space-y-2">
                <button
                  onClick={() => {
                    setAuthRole("student");
                    setAuthMode("login");
                    setAuthModalOpen(true);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/25 transition"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>Sign In / Create Account</span>
                </button>
                <button
                  onClick={handleContinueAsStudent}
                  className={`w-full py-2 px-3 rounded-xl border text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                    isDark
                      ? "border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      : "border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>Continue as Guest</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* 2. Faculty / Admin Portal Card */}
            <div
              className={`p-6 rounded-2xl border text-left flex flex-col justify-between transition-all duration-200 ${
                isDark
                  ? "bg-zinc-900/60 border-zinc-800 hover:border-amber-500/60 hover:shadow-xl hover:shadow-amber-500/10"
                  : "bg-white border-slate-200 hover:border-amber-400 hover:shadow-xl"
              }`}
            >
              <div>
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold">Faculty & Admin Portal</h3>
                <p className="text-[11px] font-mono text-amber-400 mb-1.5">Knowledge Base Control</p>
                <p className={`text-xs leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                  Upload and index lecture slides, manage syllabus vector chunks, observe real-time student query trends, and identify learning gaps.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-inherit space-y-2">
                <button
                  onClick={() => {
                    setAuthRole("faculty");
                    setAuthMode("login");
                    setAuthModalOpen(true);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/25 transition"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Faculty Sign In</span>
                </button>
                <button
                  onClick={handleUseDemoFaculty}
                  className={`w-full py-2 px-3 rounded-xl border border-dashed text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                    isDark
                      ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                      : "border-amber-500/50 text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>Try Demo Account (Dr. Anish)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Minimal 3-Item Feature Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 w-full max-w-3xl pt-8 border-t border-inherit text-left">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-xs text-zinc-200">Zero-Hallucination Citations</h4>
                <p className="text-[11px] text-zinc-500 mt-0.5">Strict vector thresholds ensure answers reference uploaded course materials.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Layers className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-xs text-zinc-200">Course-Scoped Vector Search</h4>
                <p className="text-[11px] text-zinc-500 mt-0.5">Filter answers by specific course codes and unit modules with zero bleed.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <BarChart3 className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-xs text-zinc-200">Faculty Knowledge Control</h4>
                <p className="text-[11px] text-zinc-500 mt-0.5">Curate notes, inspect student engagement, and track learning struggles in real-time.</p>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className={`py-6 text-center text-xs border-t z-10 ${isDark ? "border-zinc-900 text-zinc-600" : "border-slate-200 text-slate-400"}`}>
          EduQuery AI • 3-Tier Academic RAG Engine • Powered by MongoDB Atlas & Google Gemini
        </footer>

        {renderAuthModal()}
      </div>
    );
  }

  // ==========================================
  // RENDER: 2. MAIN WORKSPACE
  // ==========================================
  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-200 ${
      isDark ? "bg-[#09090b] text-zinc-100" : "bg-slate-50 text-slate-900"
    }`}>
      {/* -------------------------------------- */}
      {/* LEFT FIXED SIDEBAR (260px) */}
      {/* -------------------------------------- */}
      <aside
        className={`flex-shrink-0 flex flex-col border-r transition-all duration-300 z-20 ${
          sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden border-none"
        } ${isDark ? "bg-zinc-900/90 border-zinc-800" : "bg-white/95 border-slate-200"}`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b flex items-center justify-between border-inherit">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-white text-sm shadow-md shadow-indigo-600/30">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm">EduQuery AI</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium ${
                  isFacultyOrAdmin()
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                }`}>
                  {isFacultyOrAdmin() ? "FACULTY" : "STUDENT"}
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 truncate max-w-[140px]">
                {user ? user.name : "Guest Student"}
              </p>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className={`p-1.5 rounded-lg text-xs transition ${
              isDark ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            }`}
            title="Collapse Sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Primary Vertical Navigation Pills */}
        <div className="p-3 border-b border-inherit space-y-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={`w-full py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-between transition ${
              activeTab === "chat"
                ? isDark
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "bg-slate-100 text-slate-900 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <MessageSquare className="h-4 w-4 text-indigo-400" />
              <span>Ask AI</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab("materials")}
            className={`w-full py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-between transition ${
              activeTab === "materials"
                ? isDark
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "bg-slate-100 text-slate-900 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="h-4 w-4 text-indigo-400" />
              <span>Course Library</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
              {documents.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("notes")}
            className={`w-full py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-between transition ${
              activeTab === "notes"
                ? isDark
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "bg-slate-100 text-slate-900 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Bookmark className="h-4 w-4 text-amber-400" />
              <span>Saved Notes</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
              {savedNotes.length}
            </span>
          </button>

          {isFacultyOrAdmin() && (
            <button
              onClick={() => setActiveTab("analytics")}
              className={`w-full py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-between transition ${
                activeTab === "analytics"
                  ? isDark
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "bg-slate-100 text-slate-900 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="h-4 w-4 text-amber-400" />
                <span>Analytics</span>
              </div>
            </button>
          )}
        </div>

        {/* Contextual Section for Ask AI: Course Scope + New Chat + Recent Chats */}
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-3">
            <button
              onClick={handleNewChat}
              className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-indigo-600/25"
            >
              <Plus className="h-4 w-4" />
              <span>New Academic Query</span>
            </button>

            {/* Course Scope Filter Dropdown */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Course Scope Filter
              </label>
              <div className="relative">
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className={`w-full py-2 pl-3 pr-8 rounded-xl border text-xs font-medium appearance-none cursor-pointer outline-none transition ${
                    isDark
                      ? "bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-indigo-500"
                      : "bg-white border-slate-300 text-slate-800 focus:border-indigo-600"
                  }`}
                >
                  <option value="All Courses">
                    All Courses ({documents.length} {documents.length === 1 ? "doc" : "docs"})
                  </option>
                  {courses.map((c) => (
                    <option key={c.course} value={c.course}>
                      {c.course} ({c.documentCount} {c.documentCount === 1 ? "doc" : "docs"})
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Recent Conversations */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Recent Conversations
              </label>
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {conversations.length === 0 ? (
                  <p className="text-[11px] text-zinc-600 italic py-2">No saved conversations yet.</p>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleLoadConversation(c.id)}
                      className={`group px-2.5 py-2 rounded-lg text-xs cursor-pointer flex items-center justify-between transition ${
                        activeConversationId === c.id
                          ? isDark
                            ? "bg-zinc-800/90 text-white font-medium shadow-sm"
                            : "bg-slate-200 text-slate-900 font-medium"
                          : isDark
                          ? "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      <span className="truncate pr-2">{c.title}</span>
                      <button
                        onClick={(e) => handleDeleteConversation(e, c.id)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1 transition"
                        title="Delete Conversation"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* If other tabs active, empty filler space to keep footer pinned */}
        {activeTab !== "chat" && <div className="flex-1" />}

        {/* Sidebar Footer: Profile + Health Indicators */}
        <div className="p-3 border-t border-inherit space-y-2 mt-auto">
          {/* Health Status Dots */}
          <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1 font-mono">
            <span>Services:</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    systemHealth.gateway === "online" ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                Gateway
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    systemHealth.rag === "online" ? "bg-emerald-500" : "bg-rose-500 animate-pulse"
                  }`}
                />
                RAG
              </span>
            </div>
          </div>

          {/* Account Profile Bar */}
          <div className={`p-2 rounded-xl border flex items-center justify-between ${
            isDark ? "bg-zinc-950 border-zinc-800" : "bg-slate-100 border-slate-200"
          }`}>
            <div className="overflow-hidden">
              <p className="font-semibold text-xs truncate">{user ? user.name : "Guest Student"}</p>
              <p className="text-[10px] text-zinc-500 truncate">{user ? user.email || user.role : "Guest Mode"}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition"
              title="Switch Role / Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* -------------------------------------- */}
      {/* MAIN VIEWPORT (CANVAS) */}
      {/* -------------------------------------- */}
      <main className={`flex-1 flex flex-col h-full overflow-hidden relative ${
        isDark ? "bg-[#09090b]" : "bg-slate-50"
      }`}>
        {/* Top Header */}
        <header
          className={`h-14 border-b flex items-center justify-between px-4 z-10 flex-shrink-0 transition-colors duration-200 ${
            isDark
              ? "border-zinc-800/80 bg-[#09090b]/80 backdrop-blur-md"
              : "border-slate-200 bg-white/80 backdrop-blur-md shadow-sm"
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
                <ChevronRight className="h-4 w-4" />
              </button>
            )}

            <div>
              <h1 className={`font-semibold text-sm ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
                {activeTab === "chat" && "Academic Query Workspace"}
                {activeTab === "materials" && "Course Knowledge Base"}
                {activeTab === "notes" && "Saved Academic Notes"}
                {activeTab === "analytics" && "Faculty Analytics & Engagement"}
              </h1>
              <p className="text-[10px] text-indigo-400 font-mono">
                {activeTab === "chat" && `Scope: ${selectedCourse} • ${getScopeDocCount()} Document${getScopeDocCount() !== 1 ? "s" : ""}`}
                {activeTab === "materials" && `${documents.length} verified course material${documents.length !== 1 ? "s" : ""} indexed`}
                {activeTab === "notes" && `${savedNotes.length} saved note${savedNotes.length !== 1 ? "s" : ""} bookmarked`}
                {activeTab === "analytics" && `Faculty overview for ${user ? user.name : "Dr. Anish"}`}
              </p>
            </div>
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-2">
            {activeTab === "chat" && messages.length > 0 && (
              <button
                onClick={handleExportChat}
                className={`text-xs px-2.5 py-1.5 rounded-xl border transition flex items-center gap-1.5 font-medium ${
                  isDark
                    ? "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
                title="Export Conversation as Markdown"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export</span>
              </button>
            )}

            <button
              onClick={() => setIsDark((prev) => !prev)}
              className={`p-1.5 rounded-xl border transition flex items-center gap-1.5 text-xs font-medium shadow-sm ${
                isDark
                  ? "bg-zinc-800 border-zinc-700 text-amber-300 hover:bg-zinc-700"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-indigo-600"
              }`}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Global Toast Banner */}
        {uploadToast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
            <div
              className={`p-3 rounded-xl border text-xs shadow-xl flex items-center justify-between ${
                uploadToast.type === "success"
                  ? isDark
                    ? "bg-emerald-950/90 border-emerald-800 text-emerald-200"
                    : "bg-emerald-100 border-emerald-300 text-emerald-900"
                  : uploadToast.type === "error"
                  ? isDark
                    ? "bg-rose-950/90 border-rose-800 text-rose-200"
                    : "bg-rose-100 border-rose-300 text-rose-900"
                  : isDark
                  ? "bg-indigo-950/90 border-indigo-800 text-indigo-200"
                  : "bg-indigo-100 border-indigo-300 text-indigo-900"
              }`}
            >
              <div className="flex items-center gap-2">
                {uploadToast.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                ) : uploadToast.type === "error" ? (
                  <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                ) : (
                  <Info className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                )}
                <span>{uploadToast.message}</span>
              </div>
              <button
                onClick={() => setUploadToast(null)}
                className="text-xs opacity-70 hover:opacity-100 ml-2"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: ASK AI VIEWPORT (Chat Canvas) */}
        {/* ========================================================= */}
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Full-width scroll container with flush right scrollbar */}
            <div className="flex-1 w-full overflow-y-auto">
              <div className="max-w-4xl w-full mx-auto px-4 py-6 space-y-6">
              {messages.length === 0 ? (
                /* Dynamic Clean Empty State */
                <div className="h-full flex flex-col items-center justify-center text-center my-auto px-4 py-12">
                  {documents.length === 0 ? (
                    <div className="max-w-md p-6 rounded-2xl border text-center space-y-3 bg-zinc-900/40 border-zinc-800">
                      <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto">
                        <AlertCircle className="h-5 w-5" />
                      </div>
                      <h3 className="font-bold text-base">No Course Materials Uploaded Yet</h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        EduQuery AI requires verified syllabus or lecture notes to generate grounded academic responses.
                      </p>
                      {isFacultyOrAdmin() && (
                        <button
                          onClick={() => setActiveTab("materials")}
                          className="mt-2 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition"
                        >
                          <UploadCloud className="h-3.5 w-3.5" />
                          <span>Open Course Library to Upload</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="max-w-2xl space-y-4">
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white mx-auto shadow-lg shadow-indigo-600/30">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <h2 className="text-2xl font-bold tracking-tight">What would you like to explore today?</h2>
                      <p className="text-xs text-zinc-400 max-w-md mx-auto">
                        Grounding answers in <span className="text-indigo-400 font-semibold">{selectedCourse}</span> (
                        {getScopeDocCount()} document{getScopeDocCount() !== 1 ? "s" : ""} available). Click any suggested topic or type below.
                      </p>

                      {/* Dynamic Starter Question Chips */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-4 text-left">
                        {getDynamicStarterQuestions().map((question, qIdx) => (
                          <button
                            key={qIdx}
                            onClick={() => handleSend(question)}
                            className={`p-3.5 rounded-xl border text-xs transition-all duration-200 text-left flex flex-col justify-between group ${
                              isDark
                                ? "bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900 hover:border-indigo-500/50"
                                : "bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md text-slate-800"
                            }`}
                          >
                            <span className="font-medium leading-relaxed">{question}</span>
                            <span className="text-[10px] text-indigo-400 mt-2 font-mono flex items-center gap-1 group-hover:translate-x-0.5 transition">
                              <span>Ask this</span>
                              <ArrowRight className="h-3 w-3" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Active Message Thread */
                messages.map((msg, idx) => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div className="flex items-start gap-3 max-w-[92%] sm:max-w-[85%]">
                      {msg.role === "assistant" && (
                        <div className={`h-7 w-7 rounded-lg border flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1 ${
                          isDark ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400" : "bg-indigo-50 border-indigo-200 text-indigo-600"
                        }`}>
                          <Sparkles className="h-3.5 w-3.5" />
                        </div>
                      )}

                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                          msg.role === "user"
                            ? "bg-indigo-600 text-white rounded-tr-none"
                            : msg.isError
                            ? isDark
                              ? "bg-rose-950/40 border border-rose-800 text-rose-200 rounded-tl-none w-full"
                              : "bg-rose-50 border border-rose-200 text-rose-800 rounded-tl-none w-full"
                            : isDark
                            ? "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-none w-full"
                            : "bg-white border border-slate-200 text-slate-800 rounded-tl-none w-full shadow-sm"
                        }`}
                      >
                        {/* Assistant Header: Verification + Cache Badge + Model Badge */}
                        {msg.role === "assistant" && !msg.isError && (
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/50 text-[10px]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {msg.emptyKnowledgeBase ? (
                                <span className="flex items-center gap-1 text-amber-400 font-semibold">
                                  <AlertCircle className="h-3 w-3" />
                                  Knowledge Base Notice
                                </span>
                              ) : msg.grounded ? (
                                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Grounded Syllabus Answer
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-zinc-400 font-semibold">
                                  <Info className="h-3 w-3" />
                                  General Academic Overview
                                </span>
                              )}

                              {msg.cached && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 font-mono text-[9px] border border-amber-500/20">
                                  Cached (&lt;50ms)
                                </span>
                              )}

                              {msg.modelUsed && (
                                <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 font-mono text-[9px] border border-indigo-500/20">
                                  {msg.modelUsed.replace("models/", "").replace("groq/", "groq: ")}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSaveNote(msg)}
                                className="text-zinc-400 hover:text-amber-300 text-[10px] font-medium flex items-center gap-1"
                                title="Save to bookmarks"
                              >
                                <Bookmark className="h-3 w-3" />
                                <span>Bookmark</span>
                              </button>
                              <button
                                onClick={() => copyToClipboard(msg.content, idx)}
                                className="text-zinc-400 hover:text-zinc-200 text-[10px] font-medium flex items-center gap-1"
                              >
                                {copiedIndex === idx ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                <span>{copiedIndex === idx ? "Copied" : "Copy"}</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Message Content */}
                        {msg.role === "assistant" ? (
                          <FormattedMarkdown content={msg.content} isDark={isDark} />
                        ) : (
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        )}

                        {/* One-Click Retry for Failed Queries (with 15s Countdown on 429) */}
                        {msg.isError && msg.retryQuery && (
                          <div className="mt-2.5 pt-2 border-t border-rose-800/40 flex items-center justify-between">
                            <span className="text-[10px] text-rose-300">
                              {retryCountdown > 0
                                ? `Rate limit cooldown active (${retryCountdown}s remaining)...`
                                : "Would you like to try sending this query again?"}
                            </span>
                            <button
                              onClick={() => handleSend(msg.retryQuery)}
                              disabled={isLoading || retryCountdown > 0}
                              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition"
                            >
                              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
                              <span>{retryCountdown > 0 ? `Retry in ${retryCountdown}s` : "Retry Query"}</span>
                            </button>
                          </div>
                        )}

                        {/* Retrieved Citations */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className={`mt-3 pt-3 border-t ${isDark ? "border-zinc-800" : "border-slate-200"}`}>
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2 text-zinc-400">
                              <FileText className="h-3.5 w-3.5 text-indigo-400" />
                              <span>Retrieved Citations ({msg.sources.length})</span>
                            </div>

                            <div className="space-y-1.5">
                              {msg.sources.map((src, sIdx) => {
                                const isExpanded = expandedSources[`${msg.id}-${sIdx}`];
                                return (
                                  <div
                                    key={sIdx}
                                    className={`rounded-lg border overflow-hidden text-xs transition ${
                                      isDark ? "border-zinc-800 bg-zinc-950/60" : "border-slate-200 bg-slate-50/80"
                                    }`}
                                  >
                                    <button
                                      onClick={() => toggleSourceExpand(msg.id, sIdx)}
                                      className={`w-full flex items-center justify-between p-2 text-left transition ${
                                        isDark ? "hover:bg-zinc-800/40" : "hover:bg-slate-100"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 overflow-hidden">
                                        <FileText className="h-3 w-3 text-indigo-400 flex-shrink-0" />
                                        <span className={`font-medium truncate ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                                          {src.filename || src.document_id || "Document"}
                                        </span>
                                        {src.page && (
                                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-800 text-zinc-400 font-mono">
                                            Page {src.page}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {src.score && (
                                          <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                                            {(src.score * 100).toFixed(0)}% match
                                          </span>
                                        )}
                                        {isExpanded ? (
                                          <ChevronUp className="h-3.5 w-3.5 text-zinc-500" />
                                        ) : (
                                          <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                                        )}
                                      </div>
                                    </button>

                                    {isExpanded && (
                                      <div
                                        className={`p-2.5 border-t text-xs font-serif leading-relaxed italic border-l-2 border-l-indigo-500 ${
                                          isDark
                                            ? "border-zinc-800 bg-zinc-950 text-zinc-400"
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

                        {/* Feedback Thumbs */}
                        {msg.role === "assistant" && !msg.isError && msg.queryLogId && (
                          <div className="mt-3 pt-2 border-t border-zinc-800/40 flex items-center justify-between text-[11px] text-zinc-500">
                            <span>Was this answer helpful?</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleFeedback(msg.id, msg.queryLogId, "like")}
                                className={`p-1 rounded hover:text-emerald-400 transition ${
                                  feedbackState[msg.id] === "like" ? "text-emerald-400 font-bold" : ""
                                }`}
                                title="Helpful"
                              >
                                <ThumbsUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleFeedback(msg.id, msg.queryLogId, "dislike")}
                                className={`p-1 rounded hover:text-rose-400 transition ${
                                  feedbackState[msg.id] === "dislike" ? "text-rose-400 font-bold" : ""
                                }`}
                                title="Not helpful"
                              >
                                <ThumbsDown className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Progress Loading Step */}
              {isLoading && (
                <div className="flex items-start gap-3 max-w-[85%]">
                  <div className={`h-7 w-7 rounded-lg border flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1 ${
                    isDark ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400" : "bg-indigo-50 border-indigo-200 text-indigo-600"
                  }`}>
                    <Sparkles className="h-3.5 w-3.5 animate-spin" />
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-3 text-xs leading-relaxed rounded-tl-none border shadow-sm flex items-center gap-2.5 ${
                      isDark ? "bg-zinc-900 border-zinc-800 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
                    }`}
                  >
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                    <span>
                      {loadingStep === 0 && "1/3 Vector scanning MongoDB Atlas & local memory store..."}
                      {loadingStep === 1 && "2/3 Grounding context & evaluating course threshold..."}
                      {loadingStep === 2 && "3/3 Synthesizing rigorous academic response with Gemini..."}
                    </span>
                  </div>
                </div>
              )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Unified Chat Input Bar */}
            <div className={`p-4 border-t flex-shrink-0 ${isDark ? "border-zinc-800/80 bg-[#09090b]/80 backdrop-blur-md" : "border-slate-200 bg-white/80 backdrop-blur-md"}`}>
              <div className="max-w-4xl mx-auto">
                <div
                  className={`flex items-center gap-2 p-1.5 pl-4 rounded-2xl border transition-all shadow-sm focus-within:ring-1 focus-within:ring-indigo-500/60 ${
                    isDark
                      ? "bg-zinc-900/90 border-zinc-800 focus-within:border-indigo-500/60"
                      : "bg-white border-slate-300 focus-within:border-indigo-500/60"
                  }`}
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={`Ask anything about ${selectedCourse}...`}
                    disabled={isLoading}
                    className="flex-1 bg-transparent py-2 text-xs outline-none text-inherit placeholder-zinc-500"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={isLoading || !input.trim()}
                    className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition shadow-sm flex-shrink-0 flex items-center justify-center"
                    title="Send Query"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: FULL-WIDTH COURSE LIBRARY VIEW */}
        {/* ========================================================= */}
        {activeTab === "materials" && (
          <div className="flex-1 overflow-y-auto p-6 max-w-6xl w-full mx-auto space-y-6 custom-scrollbar">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-inherit">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Course Knowledge Base</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  {isFacultyOrAdmin()
                    ? "Upload, index, and organize lecture slides, textbook excerpts, and exam syllabi."
                    : "Browse verified course materials, study guides, and review suggested exam questions."}
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={documentSearchQuery}
                  onChange={(e) => setDocumentSearchQuery(e.target.value)}
                  placeholder="Search materials or courses..."
                  className={`w-full py-2 pl-9 pr-3 rounded-xl border text-xs outline-none transition ${
                    isDark
                      ? "bg-zinc-950 border-zinc-800 text-white placeholder-zinc-500 focus:border-indigo-500"
                      : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600"
                  }`}
                />
              </div>
            </div>

            {/* Course Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setMaterialsCourseFilter("All Courses")}
                className={`px-3 py-1.5 rounded-xl font-semibold transition ${
                  materialsCourseFilter === "All Courses"
                    ? isDark
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-600 text-white"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All Courses ({documents.length})
              </button>
              {courses.map((c) => (
                <button
                  key={c.course}
                  onClick={() => setMaterialsCourseFilter(c.course)}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition ${
                    materialsCourseFilter === c.course
                      ? isDark
                        ? "bg-indigo-600 text-white"
                        : "bg-indigo-600 text-white"
                      : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {c.course} ({c.documentCount})
                </button>
              ))}
            </div>

            {/* FACULTY VIEW: Upload Course Material Card */}
            {isFacultyOrAdmin() && (
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
                }`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <UploadCloud className="h-5 w-5 text-indigo-400" />
                  <h3 className="font-bold text-sm">Upload Course Material</h3>
                </div>

                <form onSubmit={handleUploadSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Course Code / Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={uploadForm.course}
                        onChange={(e) => setUploadForm({ ...uploadForm, course: e.target.value })}
                        placeholder="e.g. CS101 or Algorithms"
                        className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition ${
                          isDark
                            ? "bg-zinc-950 border-zinc-800 text-white focus:border-indigo-500"
                            : "bg-white border-slate-300 text-slate-900 focus:border-indigo-600"
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Unit / Module</label>
                      <input
                        type="text"
                        value={uploadForm.unit}
                        onChange={(e) => setUploadForm({ ...uploadForm, unit: e.target.value })}
                        placeholder="e.g. Unit 3: Graph Traversal"
                        className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition ${
                          isDark
                            ? "bg-zinc-950 border-zinc-800 text-white focus:border-indigo-500"
                            : "bg-white border-slate-300 text-slate-900 focus:border-indigo-600"
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Display Title (Optional)</label>
                      <input
                        type="text"
                        value={uploadForm.title}
                        onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                        placeholder="e.g. Lecture 4 Notes"
                        className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition ${
                          isDark
                            ? "bg-zinc-950 border-zinc-800 text-white focus:border-indigo-500"
                            : "bg-white border-slate-300 text-slate-900 focus:border-indigo-600"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center ${
                      isDragging
                        ? "border-indigo-500 bg-indigo-500/10"
                        : isDark
                        ? "border-zinc-800 hover:border-zinc-700 bg-zinc-950/40"
                        : "border-slate-300 hover:border-indigo-400 bg-slate-50"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.txt,.md"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <UploadCloud className="h-8 w-8 text-indigo-400 mb-2" />
                    {selectedFile ? (
                      <div className="space-y-1">
                        <p className="font-semibold text-xs text-indigo-300">{selectedFile.name}</p>
                        <p className="text-[11px] text-zinc-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    ) : (
                      <>
                        <p className="font-semibold text-xs text-zinc-200">
                          Drag & drop your course document here, or click to browse
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-1">
                          Text-based PDF, TXT, or MD — max 30 MB
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={isUploading || !selectedFile}
                      className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/25 transition"
                    >
                      {isUploading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Generating Embeddings & Ingesting...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-4 w-4" />
                          <span>Upload & Index Document</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Course Materials Table / Cards */}
            <div>
              <h3 className="font-bold text-sm mb-3">Indexed Course Documents ({getFilteredDocuments().length})</h3>

              {getFilteredDocuments().length === 0 ? (
                <div className="p-8 rounded-2xl border text-center text-zinc-500 text-xs border-inherit bg-zinc-900/20">
                  No course materials found matching your criteria.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {getFilteredDocuments().map((doc) => (
                    <div
                      key={doc.documentId}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                        isDark ? "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700" : "bg-white border-slate-200 shadow-sm"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex-shrink-0">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="overflow-hidden">
                              <h4 className="font-bold text-xs truncate">{doc.title}</h4>
                              <p className="text-[10px] text-zinc-500 truncate">{doc.filename}</p>
                            </div>
                          </div>

                          {isFacultyOrAdmin() && (
                            <button
                              onClick={() => setDeleteConfirm(doc)}
                              className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-zinc-800 transition flex-shrink-0"
                              title="Delete Material"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-3">
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 font-mono text-[10px] border border-indigo-500/20">
                            {doc.course}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-400 text-[10px]">
                            {doc.unit || "General"}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-400 text-[10px] flex items-center gap-1">
                            <Layers className="h-2.5 w-2.5" />
                            {doc.chunkCount} chunks
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-400 text-[10px] flex items-center gap-1">
                            <Eye className="h-2.5 w-2.5" />
                            {doc.views || 0} views
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-inherit flex items-center justify-between text-[11px] text-zinc-500">
                        <span>By {doc.uploadedByName || "Dr. Anish"}</span>
                        <button
                          onClick={() => handleOpenDocDetails(doc)}
                          className="font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
                        >
                          <span>View Details & Questions</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: SAVED NOTES VIEWPORT */}
        {/* ========================================================= */}
        {activeTab === "notes" && (
          <div className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto space-y-4 custom-scrollbar">
            <div className="flex items-center justify-between pb-4 border-b border-inherit">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Saved Academic Notes</h2>
                <p className="text-xs text-zinc-400 mt-1">Review and manage bookmarked answers and exam summaries.</p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-xl bg-zinc-800 text-zinc-300">
                {savedNotes.length} saved
              </span>
            </div>

            {savedNotes.length === 0 ? (
              <div className="p-8 rounded-2xl border text-center text-zinc-500 text-xs border-inherit bg-zinc-900/20">
                You haven't bookmarked any answers yet. Click the "Bookmark" button on any assistant answer to save it here.
              </div>
            ) : (
              savedNotes.map((note) => (
                <div
                  key={note.id}
                  className={`p-4 rounded-2xl border space-y-3 transition ${
                    isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-inherit">
                    <span className="font-semibold text-indigo-400">{note.course}</span>
                    <span className="text-zinc-500">{note.timestamp}</span>
                  </div>
                  <FormattedMarkdown content={note.content} isDark={isDark} />
                  <div className="pt-2 border-t border-inherit flex items-center justify-end gap-2 text-xs">
                    <button
                      onClick={() => copyToClipboard(note.content, note.id)}
                      className="px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition flex items-center gap-1"
                    >
                      {copiedIndex === note.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedIndex === note.id ? "Copied" : "Copy"}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: FACULTY ANALYTICS DASHBOARD */}
        {/* ========================================================= */}
        {activeTab === "analytics" && isFacultyOrAdmin() && (
          <div className="flex-1 overflow-y-auto p-6 max-w-6xl w-full mx-auto space-y-6 custom-scrollbar">
            <div className="pb-4 border-b border-inherit">
              <h2 className="text-xl font-bold tracking-tight">Faculty Analytics Dashboard</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Monitor student adoption, query patterns, and knowledge base coverage.
              </p>
            </div>

            {isLoadingAnalytics && !analyticsData ? (
              <div className="p-12 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                <span>Aggregating real-time student analytics...</span>
              </div>
            ) : analyticsData ? (
              <>
                {/* 4 Clean KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div
                    className={`p-4 rounded-2xl border ${
                      isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between text-zinc-400 text-xs">
                      <span>Unique Students</span>
                      <Users className="h-4 w-4 text-indigo-400" />
                    </div>
                    <p className="text-2xl font-extrabold mt-2">{analyticsData.uniqueStudents}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Active student accounts & sessions</p>
                  </div>

                  <div
                    className={`p-4 rounded-2xl border ${
                      isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between text-zinc-400 text-xs">
                      <span>Total Academic Queries</span>
                      <MessageSquare className="h-4 w-4 text-violet-400" />
                    </div>
                    <p className="text-2xl font-extrabold mt-2">{analyticsData.totalQueries}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Questions asked across courses</p>
                  </div>

                  <div
                    className={`p-4 rounded-2xl border ${
                      isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between text-zinc-400 text-xs">
                      <span>Document Views</span>
                      <Eye className="h-4 w-4 text-emerald-400" />
                    </div>
                    <p className="text-2xl font-extrabold mt-2">{analyticsData.totalDocumentViews || 0}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Syllabus & note previews</p>
                  </div>

                  <div
                    className={`p-4 rounded-2xl border ${
                      isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between text-zinc-400 text-xs">
                      <span>Answer Satisfaction</span>
                      <Sparkles className="h-4 w-4 text-amber-400" />
                    </div>
                    <p className="text-2xl font-extrabold mt-2">{analyticsData.satisfactionRate}%</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Positive student feedback rating</p>
                  </div>
                </div>

                {/* Two Column Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Left Column: Top Queried Courses + Student Learning Gaps */}
                  <div className="space-y-5">
                    {/* Top Courses */}
                    <div
                      className={`p-5 rounded-2xl border ${
                        isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
                      }`}
                    >
                      <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-indigo-400" />
                        Top Queried Courses
                      </h4>
                      {analyticsData.topCourses && analyticsData.topCourses.length > 0 ? (
                        <div className="space-y-2.5">
                          {analyticsData.topCourses.map((c, idx) => {
                            const maxVal = Math.max(...analyticsData.topCourses.map((x) => x.count), 1);
                            const pct = Math.round((c.count / maxVal) * 100);
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="font-medium text-zinc-300">{c.course}</span>
                                  <span className="text-zinc-500 font-mono">{c.count} queries</span>
                                </div>
                                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">No course queries recorded yet.</p>
                      )}
                    </div>

                    {/* Student Learning Gaps / Difficult Topics */}
                    <div
                      className={`p-5 rounded-2xl border ${
                        isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
                      }`}
                    >
                      <h4 className="font-bold text-xs uppercase tracking-wider text-rose-400 mb-3 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" />
                        Learning Gaps & Low-Confidence Queries
                      </h4>
                      {analyticsData.strugglingQueries && analyticsData.strugglingQueries.length > 0 ? (
                        <div className="space-y-2 text-xs">
                          {analyticsData.strugglingQueries.map((sq) => (
                            <div
                              key={sq.id}
                              className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-start justify-between gap-2"
                            >
                              <div className="space-y-0.5 overflow-hidden">
                                <p className="font-medium text-zinc-200 truncate">{sq.query}</p>
                                <span className="text-[10px] text-zinc-500">{sq.course}</span>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 flex-shrink-0">
                                Needs Notes
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">No learning gaps detected so far.</p>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Document Engagement + Recent Student Activity Feed */}
                  <div className="space-y-5">
                    {/* Document Engagement Table */}
                    <div
                      className={`p-5 rounded-2xl border ${
                        isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
                      }`}
                    >
                      <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                        <Eye className="h-4 w-4 text-emerald-400" />
                        Document Engagement
                      </h4>
                      {analyticsData.documentStats && analyticsData.documentStats.length > 0 ? (
                        <div className="space-y-2 text-xs">
                          {analyticsData.documentStats.slice(0, 5).map((ds) => (
                            <div
                              key={ds.id}
                              className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between gap-2"
                            >
                              <div className="overflow-hidden">
                                <p className="font-medium text-zinc-200 truncate">{ds.title}</p>
                                <p className="text-[10px] text-zinc-500">{ds.course} • By {ds.uploadedByName}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 font-mono text-[11px]">
                                <span className="text-indigo-400">{ds.chunkCount} chunks</span>
                                <span className="text-emerald-400">{ds.views} views</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">No documents indexed yet.</p>
                      )}
                    </div>

                    {/* Recent Student Queries Feed */}
                    <div
                      className={`p-5 rounded-2xl border ${
                        isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
                      }`}
                    >
                      <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-indigo-400" />
                        Recent Student Activity Feed
                      </h4>
                      {analyticsData.recentQueries && analyticsData.recentQueries.length > 0 ? (
                        <div className="space-y-2 text-xs">
                          {analyticsData.recentQueries.slice(0, 6).map((rq) => (
                            <div
                              key={rq.id}
                              className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between gap-2"
                            >
                              <div className="space-y-0.5 overflow-hidden">
                                <p className="font-medium text-zinc-200 truncate">{rq.query}</p>
                                <p className="text-[10px] text-zinc-500">{rq.course}</p>
                              </div>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 font-mono flex-shrink-0 ${
                                  rq.grounded
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}
                              >
                                {rq.grounded ? <CheckCircle2 className="h-3 w-3" /> : null}
                                {rq.grounded ? "Grounded" : "Overview"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">No recent queries.</p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Modals */}
        {renderAuthModal()}
        {renderDocDetailsModal()}
        {renderDeleteConfirmModal()}
      </main>
    </div>
  );
}
