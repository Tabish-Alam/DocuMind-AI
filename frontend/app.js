/* =========================================================================
   Document Intelligence + RAG — frontend logic
   Talks to the FastAPI backend via /api/*. The Groq key never leaves the
   browser except as a per-request header.
   ========================================================================= */

const API_BASE = ""; // same-origin (backend serves this file too)

const state = {
  documents: [],
  chatHistory: [], // [{role, content}]
  lastSources: {},  // messageId -> sources[]
  groqApiKeyOverride: localStorage.getItem("groq_api_key_override") || "",
  pendingQuotaAction: null,
};

// ---------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------
const el = {
  keyStatus: document.getElementById("keyStatus"),
  apiKeyModal: document.getElementById("apiKeyModal"),
  apiKeyModalClose: document.getElementById("apiKeyModalClose"),
  apiKeyModalCancel: document.getElementById("apiKeyModalCancel"),
  apiKeyModalForm: document.getElementById("apiKeyModalForm"),
  apiKeyModalInput: document.getElementById("apiKeyModalInput"),
  apiKeyModalMessage: document.getElementById("apiKeyModalMessage"),

  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  uploadProgress: document.getElementById("uploadProgress"),
  uploadProgressLabel: document.getElementById("uploadProgressLabel"),

  docList: document.getElementById("docList"),
  docCount: document.getElementById("docCount"),
  scopeSelect: document.getElementById("scopeSelect"),

  chatLog: document.getElementById("chatLog"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  chatSend: document.getElementById("chatSend"),

  sourceCardTemplate: document.getElementById("sourceCardTemplate"),
  excerptModal: document.getElementById("excerptModal"),
  excerptModalClose: document.getElementById("excerptModalClose"),
  excerptModalTitle: document.getElementById("excerptModalTitle"),
  excerptModalBody: document.getElementById("excerptModalBody"),
};

// ---------------------------------------------------------------------
// API key handling
// ---------------------------------------------------------------------
function showKeyStatus(msg, kind) {
  el.keyStatus.textContent = msg;
  el.keyStatus.className = `key-status ${kind}`;
}

function requireKeyOrWarn() {
  return true;
}

function applyGroqOverrideKey(apiKey) {
  state.groqApiKeyOverride = apiKey.trim();
  localStorage.setItem("groq_api_key_override", state.groqApiKeyOverride);
  if (state.groqApiKeyOverride) {
    showKeyStatus("Using override API key from this browser.", "ok");
  } else {
    showKeyStatus("", "");
  }
}

function groqHeaders(isJson = false) {
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (state.groqApiKeyOverride) {
    headers["X-Groq-Api-Key"] = state.groqApiKeyOverride;
  }
  return headers;
}

function openApiKeyModal(message, retryAction) {
  state.pendingQuotaAction = retryAction;
  el.apiKeyModalMessage.textContent = message;
  el.apiKeyModalInput.value = state.groqApiKeyOverride || "";
  el.apiKeyModal.classList.remove("hidden");
  el.apiKeyModalInput.focus();
}

function closeApiKeyModal() {
  el.apiKeyModal.classList.add("hidden");
  state.pendingQuotaAction = null;
}

el.apiKeyModalClose.addEventListener("click", closeApiKeyModal);
el.apiKeyModalCancel.addEventListener("click", closeApiKeyModal);
el.apiKeyModal.querySelector(".modal__backdrop").addEventListener("click", closeApiKeyModal);
el.apiKeyModalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const apiKey = el.apiKeyModalInput.value.trim();
  if (!apiKey) return;
  applyGroqOverrideKey(apiKey);
  const retryAction = state.pendingQuotaAction;
  closeApiKeyModal();
  if (retryAction) retryAction();
});

applyGroqOverrideKey(state.groqApiKeyOverride);

// ---------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------
el.dropzone.addEventListener("click", () => el.fileInput.click());

el.dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  el.dropzone.classList.add("dragover");
});
el.dropzone.addEventListener("dragleave", () => el.dropzone.classList.remove("dragover"));
el.dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  el.dropzone.classList.remove("dragover");
  if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
});

el.fileInput.addEventListener("change", () => {
  if (el.fileInput.files.length) uploadFile(el.fileInput.files[0]);
  el.fileInput.value = "";
});

async function uploadFile(file) {
  if (!requireKeyOrWarn()) return;

  setUploading(true, `Extracting "${file.name}"…`);

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      headers: groqHeaders(),
      body: formData,
    });

    const data = await res.json();
    if (res.status === 429) {
      closeApiKeyModal();
      openApiKeyModal(
        data.detail || "Missing API key.",
        () => uploadFile(file)
      );
      return;
    }
    if (!res.ok) throw new Error(data.detail || "Upload failed.");

    state.documents.unshift(data);
    renderDocuments();
    applyGroqOverrideKey(state.groqApiKeyOverride);
  } catch (err) {
    showKeyStatus(err.message, "err");
  } finally {
    setUploading(false);
  }
}

function setUploading(isUploading, label) {
  el.uploadProgress.classList.toggle("hidden", !isUploading);
  if (label) el.uploadProgressLabel.textContent = label;
}

// ---------------------------------------------------------------------
// Document list + scope selector
// ---------------------------------------------------------------------
function renderDocuments() {
  el.docCount.textContent = state.documents.length;

  if (state.documents.length === 0) {
    el.docList.innerHTML = `<div class="doc-list__empty">No documents yet. Upload one above to get started.</div>`;
  } else {
    el.docList.innerHTML = "";
    for (const doc of state.documents) {
      el.docList.appendChild(buildDocCard(doc));
    }
  }

  // scope selector
  const current = el.scopeSelect.value;
  el.scopeSelect.innerHTML = `<option value="all">All documents</option>`;
  for (const doc of state.documents) {
    const opt = document.createElement("option");
    opt.value = doc.doc_id;
    opt.textContent = doc.filename;
    el.scopeSelect.appendChild(opt);
  }
  el.scopeSelect.value = state.documents.some((d) => d.doc_id === current) ? current : "all";
}

function buildDocCard(doc) {
  const card = document.createElement("div");
  card.className = "doc-card";
  card.innerHTML = `
    <div class="doc-card__top">
      <div class="doc-card__filename">${escapeHtml(doc.filename)}</div>
      <button class="doc-card__delete" title="Remove document" data-doc-id="${doc.doc_id}">×</button>
    </div>
    <span class="doc-card__stamp">${escapeHtml(doc.document_type || "Unclassified")}</span>
    <div class="doc-card__summary">${escapeHtml(doc.summary || "")}</div>
    <div class="doc-card__meta">
      <span>${doc.num_chunks} chunk${doc.num_chunks === 1 ? "" : "s"}</span>
      <span>${Math.round((doc.confidence || 0) * 100)}% confidence</span>
    </div>
  `;
  card.querySelector(".doc-card__delete").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteDocument(doc.doc_id);
  });
  return card;
}

async function deleteDocument(docId) {
  try {
    const res = await fetch(`${API_BASE}/api/documents/${docId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Could not delete document.");
    state.documents = state.documents.filter((d) => d.doc_id !== docId);
    renderDocuments();
  } catch (err) {
    console.error(err);
  }
}

// ---------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------
el.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = el.chatInput.value.trim();
  if (!message) return;
  sendMessage(message);
});

document.querySelectorAll(".example-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (!requireKeyOrWarn()) return;
    sendMessage(chip.dataset.example);
  });
});

async function sendMessage(message) {
  if (!requireKeyOrWarn()) return;

  clearWelcomeIfPresent();
  appendUserMessage(message);
  el.chatInput.value = "";
  setSending(true);

  const typingId = appendTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: groqHeaders(true),
      body: JSON.stringify({
        message,
        doc_id: el.scopeSelect.value,
        history: state.chatHistory.slice(-6),
      }),
    });

    const data = await res.json();
    removeTypingIndicator(typingId);

    if (res.status === 429) {
      openApiKeyModal(
        data.detail || "Missing API key.",
        () => sendMessage(message)
      );
      return;
    }

    if (!res.ok) throw new Error(data.detail || "Something went wrong.");

    appendAssistantMessage(data.answer, data.sources || []);
    state.chatHistory.push({ role: "user", content: message });
    state.chatHistory.push({ role: "assistant", content: data.answer });
  } catch (err) {
    removeTypingIndicator(typingId);
    appendAssistantMessage(err.message, [], true);
  } finally {
    setSending(false);
  }
}

function setSending(isSending) {
  el.chatSend.disabled = isSending;
  el.chatInput.disabled = isSending;
}

function clearWelcomeIfPresent() {
  const welcome = el.chatLog.querySelector(".chat-welcome");
  if (welcome) welcome.remove();
}

function appendUserMessage(text) {
  const wrap = document.createElement("div");
  wrap.className = "msg msg--user";
  wrap.innerHTML = `<div class="msg__bubble">${escapeHtml(text)}</div>`;
  el.chatLog.appendChild(wrap);
  scrollChatToBottom();
}

function appendAssistantMessage(text, sources, isError = false) {
  const wrap = document.createElement("div");
  wrap.className = "msg msg--assistant";

  const bubble = document.createElement("div");
  bubble.className = "msg__bubble" + (isError ? " error" : "");
  // bubble.innerHTML = linkifyCitations(escapeHtml(text), sources);
  bubble.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
  wrap.appendChild(bubble);

  if (sources && sources.length) {
    const sourcesRow = document.createElement("div");
    sourcesRow.className = "sources";
    for (const src of sources) {
      sourcesRow.appendChild(buildSourceCard(src));
    }
    wrap.appendChild(sourcesRow);
  }

  el.chatLog.appendChild(wrap);

  // wire up inline [n] citation clicks to open the same modal
  // bubble.querySelectorAll(".citation").forEach((citeEl) => {
  //   citeEl.addEventListener("click", () => {
  //     const idx = parseInt(citeEl.dataset.index, 10);
  //     const src = sources.find((s) => s.index === idx);
  //     if (src) openExcerptModal(src);
  //   });s
  // });

  scrollChatToBottom();
}

// function linkifyCitations(htmlText, sources) {
//   if (!sources || !sources.length) return htmlText;
//   return htmlText.replace(/\[(\d+)\]/g, (match, num) => {
//     const exists = sources.some((s) => s.index === parseInt(num, 10));
//     return exists
//       ? `<span class="citation" data-index="${num}">[${num}]</span>`
//       : match;
//   });
// }

function buildSourceCard(src) {
  const node = el.sourceCardTemplate.content.cloneNode(true);
  const card = node.querySelector(".source-card");
  card.querySelector(".source-card__index").textContent = src.index;
  card.querySelector(".source-card__filename").textContent = src.filename;
  card.querySelector(".source-card__snippet").textContent = src.snippet;
  card.querySelector(".source-card__score").textContent = src.relevance.toFixed(2);
  card.addEventListener("click", () => openExcerptModal(src));
  return card;
}

function appendTypingIndicator() {
  const id = `typing-${Date.now()}`;
  const wrap = document.createElement("div");
  wrap.className = "msg msg--assistant";
  wrap.id = id;
  wrap.innerHTML = `<div class="msg__bubble"><span class="typing-dots"><span></span><span></span><span></span></span></div>`;
  el.chatLog.appendChild(wrap);
  scrollChatToBottom();
  return id;
}

function removeTypingIndicator(id) {
  const node = document.getElementById(id);
  if (node) node.remove();
}

function scrollChatToBottom() {
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

// ---------------------------------------------------------------------
// Excerpt modal
// ---------------------------------------------------------------------
function openExcerptModal(src) {
  el.excerptModalTitle.textContent = `[${src.index}] ${src.filename} · relevance ${src.relevance.toFixed(2)}`;
  el.excerptModalBody.textContent = src.snippet;
  el.excerptModal.classList.remove("hidden");
}
el.excerptModalClose.addEventListener("click", closeExcerptModal);
el.excerptModal.querySelector(".modal__backdrop").addEventListener("click", closeExcerptModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeExcerptModal();
});
function closeExcerptModal() {
  el.excerptModal.classList.add("hidden");
}

// ---------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Boot: load any documents already indexed server-side
// ---------------------------------------------------------------------
(async function init() {
  try {
    const res = await fetch(`${API_BASE}/api/documents`);
    if (res.ok) {
      state.documents = await res.json();
      renderDocuments();
    }
  } catch (err) {
    console.warn("Could not load existing documents:", err);
  }
})();
