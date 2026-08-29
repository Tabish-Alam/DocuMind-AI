const API_BASE = "";


/* =========================================================
   ELEMENT REFERENCES
========================================================= */

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


/* =========================================================
   STATE
========================================================= */

let documents = [];
let pendingApiKeyResolver = null;


/* =========================================================
   API RESPONSE SAFETY
========================================================= */

async function readApiResponse(res) {
  const contentType =
    res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await res.json();
    } catch (error) {
      return {
        detail: `Invalid JSON response from server (${res.status})`,
      };
    }
  }

  const text = await res.text();

  return {
    detail:
      text ||
      `Server error (${res.status})`,
  };
}


/* =========================================================
   GENERAL HELPERS
========================================================= */

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


function getErrorMessage(data, fallback = "Something went wrong.") {
  if (!data) return fallback;

  if (typeof data === "string") {
    return data;
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  if (typeof data.error === "string") {
    return data.error;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  return fallback;
}


/* =========================================================
   API KEY MODAL
========================================================= */

function openApiKeyModal(message = "Enter your Groq API key.") {
  if (!el.apiKeyModal) {
    return Promise.resolve(null);
  }

  el.apiKeyModalMessage.textContent = message;
  el.apiKeyModalInput.value = "";

  el.apiKeyModal.classList.remove("hidden");

  setTimeout(() => {
    el.apiKeyModalInput.focus();
  }, 50);

  return new Promise((resolve) => {
    pendingApiKeyResolver = resolve;
  });
}


function closeApiKeyModal(value = null) {
  if (!el.apiKeyModal) return;

  el.apiKeyModal.classList.add("hidden");

  if (pendingApiKeyResolver) {
    pendingApiKeyResolver(value);
    pendingApiKeyResolver = null;
  }
}


if (el.apiKeyModalClose) {
  el.apiKeyModalClose.addEventListener("click", () => {
    closeApiKeyModal(null);
  });
}


if (el.apiKeyModalCancel) {
  el.apiKeyModalCancel.addEventListener("click", () => {
    closeApiKeyModal(null);
  });
}


if (el.apiKeyModalForm) {
  el.apiKeyModalForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const apiKey =
      el.apiKeyModalInput.value.trim();

    if (!apiKey) {
      el.apiKeyModalMessage.textContent =
        "Please enter a valid API key.";
      return;
    }

    closeApiKeyModal(apiKey);
  });
}


/* =========================================================
   API KEY STATUS
========================================================= */

async function checkApiKeyStatus() {
  if (!el.keyStatus) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/key-status`
    );

    const data = await readApiResponse(res);

    if (!res.ok) {
      throw new Error(
        getErrorMessage(
          data,
          "Could not check API key status."
        )
      );
    }

    if (data.configured) {
      el.keyStatus.className =
        "key-status ok";

      el.keyStatus.textContent =
        "Groq API connected";
    } else {
      el.keyStatus.className =
        "key-status err";

      el.keyStatus.textContent =
        "Groq API key not configured";
    }

  } catch (error) {
    el.keyStatus.className =
      "key-status err";

    el.keyStatus.textContent =
      error.message;
  }
}


/* =========================================================
   DOCUMENTS
========================================================= */

async function loadDocuments() {
  try {
    const res = await fetch(
      `${API_BASE}/api/documents`
    );

    const data = await readApiResponse(res);

    if (!res.ok) {
      throw new Error(
        getErrorMessage(
          data,
          "Failed to load documents."
        )
      );
    }

    documents =
      Array.isArray(data)
        ? data
        : data.documents || [];

    renderDocuments();

  } catch (error) {
    console.error(error);

    documents = [];

    renderDocuments();

    if (el.keyStatus) {
      el.keyStatus.className =
        "key-status err";

      el.keyStatus.textContent =
        error.message;
    }
  }
}


function renderDocuments() {
  if (!el.docList || !el.docCount) {
    return;
  }

  el.docCount.textContent =
    String(documents.length);

  el.docList.innerHTML = "";

  if (!documents.length) {
    const empty =
      document.createElement("div");

    empty.className =
      "doc-list__empty";

    empty.textContent =
      "No documents yet. Upload one above to get started.";

    el.docList.appendChild(empty);

    renderScopeOptions();

    return;
  }

  documents.forEach((doc) => {
    const card =
      document.createElement("div");

    card.className =
      "doc-card";

    const id =
      doc.id ??
      doc.document_id ??
      "";

    const filename =
      doc.filename ??
      doc.name ??
      "Document";

    const summary =
      doc.summary ??
      doc.preview ??
      "";

    const fileSize =
      doc.size ??
      doc.file_size ??
      null;

    const chunks =
      doc.chunks ??
      doc.chunk_count ??
      null;

    card.innerHTML = `
      <div class="doc-card__top">
        <div
          class="doc-card__filename"
          title="${escapeHtml(filename)}"
        >
          ${escapeHtml(filename)}
        </div>

        <button
          class="doc-card__delete"
          type="button"
          aria-label="Delete document"
          title="Delete document"
        >
          ×
        </button>
      </div>

      <div class="doc-card__stamp">
        INDEXED
      </div>

      ${
        summary
          ? `
            <div class="doc-card__summary">
              ${escapeHtml(summary)}
            </div>
          `
          : ""
      }

      <div class="doc-card__meta">
        <span>
          ${
            fileSize !== null
              ? formatBytes(Number(fileSize))
              : ""
          }
        </span>

        <span>
          ${
            chunks !== null
              ? `${chunks} chunks`
              : ""
          }
        </span>
      </div>
    `;

    const deleteButton =
      card.querySelector(
        ".doc-card__delete"
      );

    deleteButton.addEventListener(
      "click",
      async () => {
        await deleteDocument(id);
      }
    );

    el.docList.appendChild(card);
  });

  renderScopeOptions();
}


function renderScopeOptions() {
  if (!el.scopeSelect) return;

  const currentValue =
    el.scopeSelect.value;

  el.scopeSelect.innerHTML = `
    <option value="all">
      All documents
    </option>
  `;

  documents.forEach((doc) => {
    const option =
      document.createElement("option");

    const id =
      doc.id ??
      doc.document_id ??
      "";

    const filename =
      doc.filename ??
      doc.name ??
      "Document";

    option.value = id;
    option.textContent = filename;

    el.scopeSelect.appendChild(option);
  });

  const exists =
    Array.from(
      el.scopeSelect.options
    ).some(
      (option) =>
        option.value === currentValue
    );

  if (exists) {
    el.scopeSelect.value =
      currentValue;
  }
}


/* =========================================================
   DOCUMENT DELETE
========================================================= */

async function deleteDocument(documentId) {
  if (!documentId) {
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/documents/${encodeURIComponent(documentId)}`,
      {
        method: "DELETE",
      }
    );

    const data = await readApiResponse(res);

    if (!res.ok) {
      throw new Error(
        getErrorMessage(
          data,
          "Could not delete document."
        )
      );
    }

    await loadDocuments();

  } catch (error) {
    console.error(error);

    if (el.keyStatus) {
      el.keyStatus.className =
        "key-status err";

      el.keyStatus.textContent =
        error.message;
    }
  }
}


/* =========================================================
   UPLOAD
========================================================= */

function setUploadLoading(
  loading,
  label = "Processing document..."
) {
  if (!el.uploadProgress) {
    return;
  }

  if (loading) {
    el.uploadProgress.classList.remove(
      "hidden"
    );

    if (el.uploadProgressLabel) {
      el.uploadProgressLabel.textContent =
        label;
    }
  } else {
    el.uploadProgress.classList.add(
      "hidden"
    );
  }
}


async function uploadFile(file) {
  if (!file) return;

  const allowedExtensions = [
    ".pdf",
    ".docx",
    ".txt",
    ".md",
  ];

  const filename =
    file.name.toLowerCase();

  const valid =
    allowedExtensions.some(
      (ext) =>
        filename.endsWith(ext)
    );

  if (!valid) {
    if (el.keyStatus) {
      el.keyStatus.className =
        "key-status err";

      el.keyStatus.textContent =
        "Unsupported file type.";
    }

    return;
  }

  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  setUploadLoading(
    true,
    `Processing ${file.name}...`
  );

  if (el.keyStatus) {
    el.keyStatus.className =
      "key-status";

    el.keyStatus.textContent = "";
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    const data =
      await readApiResponse(res);

    if (!res.ok) {
      throw new Error(
        getErrorMessage(
          data,
          `Upload failed (${res.status}).`
        )
      );
    }

    if (el.keyStatus) {
      el.keyStatus.className =
        "key-status ok";

      el.keyStatus.textContent =
        "Document uploaded successfully";
    }

    await loadDocuments();

  } catch (error) {
    console.error(
      "Upload error:",
      error
    );

    if (el.keyStatus) {
      el.keyStatus.className =
        "key-status err";

      el.keyStatus.textContent =
        error.message;
    }

  } finally {
    setUploadLoading(false);

    if (el.fileInput) {
      el.fileInput.value = "";
    }
  }
}


/* =========================================================
   DROPZONE EVENTS
========================================================= */

if (el.dropzone && el.fileInput) {
  el.dropzone.addEventListener(
    "click",
    () => {
      el.fileInput.click();
    }
  );

  el.dropzone.addEventListener(
    "dragover",
    (event) => {
      event.preventDefault();

      el.dropzone.classList.add(
        "dragover"
      );
    }
  );

  el.dropzone.addEventListener(
    "dragleave",
    () => {
      el.dropzone.classList.remove(
        "dragover"
      );
    }
  );

  el.dropzone.addEventListener(
    "drop",
    (event) => {
      event.preventDefault();

      el.dropzone.classList.remove(
        "dragover"
      );

      const file =
        event.dataTransfer.files?.[0];

      if (file) {
        uploadFile(file);
      }
    }
  );

  el.fileInput.addEventListener(
    "change",
    () => {
      const file =
        el.fileInput.files?.[0];

      if (file) {
        uploadFile(file);
      }
    }
  );
}


/* =========================================================
   CHAT RENDERING
========================================================= */

function removeWelcomeState() {
  const welcome =
    el.chatLog?.querySelector(
      ".chat-welcome"
    );

  if (welcome) {
    welcome.remove();
  }
}


function createMessage(
  role,
  content,
  extraClass = ""
) {
  if (!el.chatLog) return null;

  removeWelcomeState();

  const wrapper =
    document.createElement("div");

  wrapper.className =
    `msg msg--${role}`;

  const bubble =
    document.createElement("div");

  bubble.className =
    `msg__bubble ${extraClass}`.trim();

  bubble.textContent = content;

  wrapper.appendChild(bubble);

  el.chatLog.appendChild(wrapper);

  scrollChatToBottom();

  return {
    wrapper,
    bubble,
  };
}


function createTypingMessage() {
  if (!el.chatLog) {
    return null;
  }

  removeWelcomeState();

  const wrapper =
    document.createElement("div");

  wrapper.className =
    "msg msg--assistant";

  const bubble =
    document.createElement("div");

  bubble.className =
    "msg__bubble";

  bubble.innerHTML = `
    <span class="typing-dots">
      <span></span>
      <span></span>
      <span></span>
    </span>
  `;

  wrapper.appendChild(bubble);

  el.chatLog.appendChild(wrapper);

  scrollChatToBottom();

  return wrapper;
}


function scrollChatToBottom() {
  if (!el.chatLog) return;

  requestAnimationFrame(() => {
    el.chatLog.scrollTop =
      el.chatLog.scrollHeight;
  });
}


/* =========================================================
   SOURCE CARDS
========================================================= */

function appendSources(
  messageWrapper,
  sources
) {
  if (
    !messageWrapper ||
    !Array.isArray(sources) ||
    !sources.length
  ) {
    return;
  }

  const container =
    document.createElement("div");

  container.className =
    "sources";

  sources.forEach(
    (source, index) => {
      let card;

      if (
        el.sourceCardTemplate &&
        el.sourceCardTemplate.content
      ) {
        card =
          el.sourceCardTemplate.content
            .firstElementChild
            .cloneNode(true);
      } else {
        card =
          document.createElement(
            "button"
          );

        card.className =
          "source-card";

        card.type = "button";

        card.innerHTML = `
          <div class="source-card__index"></div>

          <div class="source-card__body">
            <div class="source-card__filename"></div>
            <div class="source-card__snippet"></div>
          </div>

          <div class="source-card__score"></div>
        `;
      }

      const filename =
        source.filename ??
        source.document ??
        source.name ??
        "Source";

      const snippet =
        source.text ??
        source.content ??
        source.snippet ??
        "";

      const scoreRaw =
        source.score ??
        source.similarity ??
        source.relevance ??
        null;

      const indexEl =
        card.querySelector(
          ".source-card__index"
        );

      const filenameEl =
        card.querySelector(
          ".source-card__filename"
        );

      const snippetEl =
        card.querySelector(
          ".source-card__snippet"
        );

      const scoreEl =
        card.querySelector(
          ".source-card__score"
        );

      if (indexEl) {
        indexEl.textContent =
          String(index + 1);
      }

      if (filenameEl) {
        filenameEl.textContent =
          filename;
      }

      if (snippetEl) {
        snippetEl.textContent =
          snippet;
      }

      if (scoreEl) {
        if (
          scoreRaw !== null &&
          scoreRaw !== undefined
        ) {
          const score =
            Number(scoreRaw);

          scoreEl.textContent =
            Number.isFinite(score)
              ? `${Math.round(score * 100)}%`
              : String(scoreRaw);
        } else {
          scoreEl.textContent = "";
        }
      }

      card.addEventListener(
        "click",
        () => {
          openExcerptModal(
            filename,
            snippet
          );
        }
      );

      container.appendChild(card);
    }
  );

  messageWrapper.appendChild(
    container
  );
}


/* =========================================================
   SOURCE MODAL
========================================================= */

function openExcerptModal(
  title,
  body
) {
  if (!el.excerptModal) {
    return;
  }

  el.excerptModalTitle.textContent =
    title || "Source";

  el.excerptModalBody.textContent =
    body || "";

  el.excerptModal.classList.remove(
    "hidden"
  );
}


function closeExcerptModal() {
  if (!el.excerptModal) {
    return;
  }

  el.excerptModal.classList.add(
    "hidden"
  );
}


if (el.excerptModalClose) {
  el.excerptModalClose.addEventListener(
    "click",
    closeExcerptModal
  );
}


if (el.excerptModal) {
  const backdrop =
    el.excerptModal.querySelector(
      ".modal__backdrop"
    );

  if (backdrop) {
    backdrop.addEventListener(
      "click",
      closeExcerptModal
    );
  }
}


/* =========================================================
   CHAT
========================================================= */

function setChatLoading(loading) {
  if (el.chatSend) {
    el.chatSend.disabled = loading;
  }

  if (el.chatInput) {
    el.chatInput.disabled = loading;
  }
}


async function sendMessage(message) {
  const cleanMessage =
    String(message || "").trim();

  if (!cleanMessage) {
    return;
  }

  createMessage(
    "user",
    cleanMessage
  );

  const typing =
    createTypingMessage();

  setChatLoading(true);

  try {
    const scope =
      el.scopeSelect?.value ||
      "all";

    const payload = {
      question: cleanMessage,
    };

    if (scope !== "all") {
      payload.document_id =
        scope;
    }

    const res = await fetch(
      `${API_BASE}/api/chat`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify(
          payload
        ),
      }
    );

    const data =
      await readApiResponse(res);

    if (!res.ok) {
      const detail =
        getErrorMessage(
          data,
          `Chat request failed (${res.status}).`
        );

      if (
        res.status === 401 ||
        res.status === 403 ||
        detail
          .toLowerCase()
          .includes("api key")
      ) {
        const newKey =
          await openApiKeyModal(
            detail
          );

        if (newKey) {
          if (typing) {
            typing.remove();
          }

          await sendMessageWithApiKey(
            cleanMessage,
            newKey,
            scope
          );

          return;
        }
      }

      throw new Error(detail);
    }

    if (typing) {
      typing.remove();
    }

    const answer =
      data.answer ??
      data.response ??
      data.message ??
      "No answer was returned.";

    const assistant =
      createMessage(
        "assistant",
        answer
      );

    const sources =
      data.sources ??
      data.citations ??
      data.context ??
      [];

    appendSources(
      assistant?.wrapper,
      sources
    );

  } catch (error) {
    console.error(
      "Chat error:",
      error
    );

    if (typing) {
      typing.remove();
    }

    createMessage(
      "assistant",
      error.message,
      "error"
    );

  } finally {
    setChatLoading(false);

    if (el.chatInput) {
      el.chatInput.focus();
    }
  }
}


async function sendMessageWithApiKey(
  message,
  apiKey,
  scope
) {
  const typing =
    createTypingMessage();

  try {
    const payload = {
      question: message,
      api_key: apiKey,
    };

    if (
      scope &&
      scope !== "all"
    ) {
      payload.document_id =
        scope;
    }

    const res = await fetch(
      `${API_BASE}/api/chat`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify(
          payload
        ),
      }
    );

    const data =
      await readApiResponse(res);

    if (!res.ok) {
      throw new Error(
        getErrorMessage(
          data,
          `Chat request failed (${res.status}).`
        )
      );
    }

    if (typing) {
      typing.remove();
    }

    const answer =
      data.answer ??
      data.response ??
      data.message ??
      "No answer was returned.";

    const assistant =
      createMessage(
        "assistant",
        answer
      );

    appendSources(
      assistant?.wrapper,
      data.sources ??
        data.citations ??
        data.context ??
        []
    );

    await checkApiKeyStatus();

  } catch (error) {
    if (typing) {
      typing.remove();
    }

    createMessage(
      "assistant",
      error.message,
      "error"
    );
  }
}


/* =========================================================
   CHAT FORM
========================================================= */

if (el.chatForm) {
  el.chatForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const message =
        el.chatInput.value.trim();

      if (!message) {
        return;
      }

      el.chatInput.value = "";

      await sendMessage(message);
    }
  );
}


/* =========================================================
   EXAMPLE PROMPTS
========================================================= */

document
  .querySelectorAll(
    ".example-chip"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const prompt =
          button.dataset.example;

        if (!prompt) {
          return;
        }

        if (el.chatInput) {
          el.chatInput.value =
            prompt;

          el.chatInput.focus();
        }
      }
    );
  });


/* =========================================================
   ESC KEY
========================================================= */

document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key !== "Escape"
    ) {
      return;
    }

    if (
      el.excerptModal &&
      !el.excerptModal.classList.contains(
        "hidden"
      )
    ) {
      closeExcerptModal();
    }

    if (
      el.apiKeyModal &&
      !el.apiKeyModal.classList.contains(
        "hidden"
      )
    ) {
      closeApiKeyModal(null);
    }
  }
);


/* =========================================================
   INITIAL LOAD
========================================================= */

async function initialise() {
  await Promise.allSettled([
    loadDocuments(),
    checkApiKeyStatus(),
  ]);
}


initialise();
