/* =========================================================================
   DocuMind AI — Frontend Logic
   Compatible with the existing FastAPI backend.
   ========================================================================= */

const API_BASE = "";


/* =========================================================================
   STATE
============================================================================ */

const state = {
  documents: [],
  chatHistory: [],

  // Optional browser-specific Groq key.
  // If empty, backend uses GROQ_API_KEY from Vercel.
  groqApiKeyOverride:
    localStorage.getItem("groq_api_key_override") || "",

  pendingQuotaAction: null,
};


/* =========================================================================
   ELEMENT REFERENCES
============================================================================ */

const el = {
  keyStatus:
    document.getElementById("keyStatus"),

  apiKeyModal:
    document.getElementById("apiKeyModal"),

  apiKeyModalClose:
    document.getElementById("apiKeyModalClose"),

  apiKeyModalCancel:
    document.getElementById("apiKeyModalCancel"),

  apiKeyModalForm:
    document.getElementById("apiKeyModalForm"),

  apiKeyModalInput:
    document.getElementById("apiKeyModalInput"),

  apiKeyModalMessage:
    document.getElementById("apiKeyModalMessage"),

  dropzone:
    document.getElementById("dropzone"),

  fileInput:
    document.getElementById("fileInput"),

  uploadProgress:
    document.getElementById("uploadProgress"),

  uploadProgressLabel:
    document.getElementById("uploadProgressLabel"),

  docList:
    document.getElementById("docList"),

  docCount:
    document.getElementById("docCount"),

  scopeSelect:
    document.getElementById("scopeSelect"),

  chatLog:
    document.getElementById("chatLog"),

  chatForm:
    document.getElementById("chatForm"),

  chatInput:
    document.getElementById("chatInput"),

  chatSend:
    document.getElementById("chatSend"),

  sourceCardTemplate:
    document.getElementById("sourceCardTemplate"),

  excerptModal:
    document.getElementById("excerptModal"),

  excerptModalClose:
    document.getElementById("excerptModalClose"),

  excerptModalTitle:
    document.getElementById("excerptModalTitle"),

  excerptModalBody:
    document.getElementById("excerptModalBody"),
};


/* =========================================================================
   SAFE API RESPONSE PARSING
============================================================================ */

async function readApiResponse(response) {
  const contentType =
    response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (error) {
      return {
        detail: `Invalid JSON returned by server (${response.status})`,
      };
    }
  }

  const text = await response.text();

  return {
    detail:
      text ||
      `Server request failed (${response.status})`,
  };
}


function getErrorMessage(
  data,
  fallback = "Something went wrong."
) {
  if (!data) {
    return fallback;
  }

  if (typeof data === "string") {
    return data;
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  /*
    FastAPI 422 responses can return:

    {
      detail: [
        {
          loc: ["body", "message"],
          msg: "Field required"
        }
      ]
    }
  */
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((item) => {
        if (item.msg) {
          return item.msg;
        }

        return JSON.stringify(item);
      })
      .join(", ");
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  if (typeof data.error === "string") {
    return data.error;
  }

  return fallback;
}


/* =========================================================================
   HTML HELPERS
============================================================================ */

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================================
   GROQ KEY
============================================================================ */

function showKeyStatus(message, kind = "") {
  if (!el.keyStatus) {
    return;
  }

  el.keyStatus.textContent = message;
  el.keyStatus.className =
    `key-status ${kind}`.trim();
}


function groqHeaders(isJson = false) {
  const headers = {};

  if (isJson) {
    headers["Content-Type"] =
      "application/json";
  }

  /*
    Backend expects visitor override key here:

    X-Groq-Api-Key: gsk_...

    NOT inside the JSON body.
  */
  if (state.groqApiKeyOverride) {
    headers["X-Groq-Api-Key"] =
      state.groqApiKeyOverride;
  }

  return headers;
}


function applyGroqOverrideKey(apiKey) {
  state.groqApiKeyOverride =
    String(apiKey || "").trim();

  if (state.groqApiKeyOverride) {
    localStorage.setItem(
      "groq_api_key_override",
      state.groqApiKeyOverride
    );

    showKeyStatus(
      "Using API key from this browser.",
      "ok"
    );
  } else {
    localStorage.removeItem(
      "groq_api_key_override"
    );

    showKeyStatus("", "");
  }
}


function openApiKeyModal(
  message = "Enter your Groq API key.",
  retryAction = null
) {
  if (!el.apiKeyModal) {
    return;
  }

  state.pendingQuotaAction =
    retryAction;

  if (el.apiKeyModalMessage) {
    el.apiKeyModalMessage.textContent =
      message;
  }

  if (el.apiKeyModalInput) {
    el.apiKeyModalInput.value =
      state.groqApiKeyOverride || "";
  }

  el.apiKeyModal.classList.remove(
    "hidden"
  );

  setTimeout(() => {
    el.apiKeyModalInput?.focus();
  }, 50);
}


function closeApiKeyModal() {
  if (!el.apiKeyModal) {
    return;
  }

  el.apiKeyModal.classList.add(
    "hidden"
  );

  state.pendingQuotaAction = null;
}


el.apiKeyModalClose?.addEventListener(
  "click",
  closeApiKeyModal
);


el.apiKeyModalCancel?.addEventListener(
  "click",
  closeApiKeyModal
);


el.apiKeyModal
  ?.querySelector(".modal__backdrop")
  ?.addEventListener(
    "click",
    closeApiKeyModal
  );


el.apiKeyModalForm?.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    const apiKey =
      el.apiKeyModalInput?.value.trim();

    if (!apiKey) {
      if (el.apiKeyModalMessage) {
        el.apiKeyModalMessage.textContent =
          "Please enter a valid API key.";
      }

      return;
    }

    const retryAction =
      state.pendingQuotaAction;

    applyGroqOverrideKey(apiKey);

    closeApiKeyModal();

    if (retryAction) {
      retryAction();
    }
  }
);


applyGroqOverrideKey(
  state.groqApiKeyOverride
);


/* =========================================================================
   DOCUMENT UPLOAD
============================================================================ */

el.dropzone?.addEventListener(
  "click",
  () => {
    el.fileInput?.click();
  }
);


el.dropzone?.addEventListener(
  "dragover",
  (event) => {
    event.preventDefault();

    el.dropzone.classList.add(
      "dragover"
    );
  }
);


el.dropzone?.addEventListener(
  "dragleave",
  () => {
    el.dropzone.classList.remove(
      "dragover"
    );
  }
);


el.dropzone?.addEventListener(
  "drop",
  (event) => {
    event.preventDefault();

    el.dropzone.classList.remove(
      "dragover"
    );

    const file =
      event.dataTransfer?.files?.[0];

    if (file) {
      uploadFile(file);
    }
  }
);


el.fileInput?.addEventListener(
  "change",
  () => {
    const file =
      el.fileInput.files?.[0];

    if (file) {
      uploadFile(file);
    }

    el.fileInput.value = "";
  }
);


function setUploadProgress(
  visible,
  label = "Processing document..."
) {
  if (!el.uploadProgress) {
    return;
  }

  if (visible) {
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
  if (!file) {
    return;
  }

  const allowedExtensions = [
    ".pdf",
    ".docx",
    ".txt",
    ".md",
  ];

  const lowerName =
    file.name.toLowerCase();

  const allowed =
    allowedExtensions.some(
      (extension) =>
        lowerName.endsWith(extension)
    );

  if (!allowed) {
    showKeyStatus(
      "Unsupported file type.",
      "err"
    );

    return;
  }

  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  setUploadProgress(
    true,
    `Processing ${file.name}...`
  );

  showKeyStatus("", "");

  try {
    const response = await fetch(
      `${API_BASE}/api/upload`,
      {
        method: "POST",

        headers:
          groqHeaders(false),

        body: formData,
      }
    );

    const data =
      await readApiResponse(response);

    /*
      Backend returns 401/429 when Groq key
      is missing/invalid/rate-limited.
    */
    if (
      response.status === 401 ||
      response.status === 429
    ) {
      openApiKeyModal(
        getErrorMessage(
          data,
          "Groq API key required."
        ),

        () => uploadFile(file)
      );

      return;
    }

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          data,
          `Upload failed (${response.status}).`
        )
      );
    }

    showKeyStatus(
      "Document uploaded successfully",
      "ok"
    );

    await loadDocuments();

  } catch (error) {
    console.error(
      "Upload error:",
      error
    );

    showKeyStatus(
      error.message,
      "err"
    );

  } finally {
    setUploadProgress(false);
  }
}


/* =========================================================================
   DOCUMENT LIST
============================================================================ */

async function loadDocuments() {
  try {
    const response = await fetch(
      `${API_BASE}/api/documents`
    );

    const data =
      await readApiResponse(response);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          data,
          "Could not load documents."
        )
      );
    }

    /*
      Existing backend returns a plain array:

      [
        {
          doc_id,
          filename,
          document_type,
          summary,
          key_entities,
          confidence,
          num_chunks
        }
      ]
    */
    state.documents =
      Array.isArray(data)
        ? data
        : [];

    renderDocuments();

  } catch (error) {
    console.error(
      "Document loading error:",
      error
    );

    showKeyStatus(
      error.message,
      "err"
    );
  }
}


function renderDocuments() {
  if (
    !el.docList ||
    !el.docCount ||
    !el.scopeSelect
  ) {
    return;
  }

  el.docCount.textContent =
    String(state.documents.length);

  el.docList.innerHTML = "";

  if (!state.documents.length) {
    const empty =
      document.createElement("div");

    empty.className =
      "doc-list__empty";

    empty.textContent =
      "No documents yet. Upload one above to get started.";

    el.docList.appendChild(empty);
  }


  for (const doc of state.documents) {
    const card =
      document.createElement("div");

    card.className =
      "doc-card";

    card.innerHTML = `
      <div class="doc-card__top">

        <div
          class="doc-card__filename"
          title="${escapeHtml(doc.filename || "Document")}"
        >
          ${escapeHtml(doc.filename || "Document")}
        </div>

        <button
          class="doc-card__delete"
          type="button"
          title="Delete document"
          aria-label="Delete ${escapeHtml(doc.filename || "document")}"
        >
          ×
        </button>

      </div>

      <div class="doc-card__stamp">
        ${escapeHtml(
          doc.document_type ||
          "INDEXED"
        )}
      </div>

      <div class="doc-card__summary">
        ${escapeHtml(
          doc.summary ||
          "Document indexed successfully."
        )}
      </div>

      <div class="doc-card__meta">

        <span>
          ${Number(doc.num_chunks || 0)}
          chunks
        </span>

        ${
          doc.confidence !==
            undefined &&
          doc.confidence !== null

            ? `
              <span>
                ${Math.round(
                  Number(doc.confidence) *
                  100
                )}% confidence
              </span>
            `

            : ""
        }

      </div>
    `;


    const deleteButton =
      card.querySelector(
        ".doc-card__delete"
      );

    deleteButton?.addEventListener(
      "click",
      () => {
        deleteDocument(
          doc.doc_id
        );
      }
    );


    el.docList.appendChild(card);
  }


  /*
    Rebuild search scope.
  */

  const currentScope =
    el.scopeSelect.value;

  el.scopeSelect.innerHTML = `
    <option value="all">
      All documents
    </option>
  `;


  for (
    const doc of state.documents
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      doc.doc_id;

    option.textContent =
      doc.filename;

    el.scopeSelect.appendChild(
      option
    );
  }


  const currentStillExists =
    state.documents.some(
      (doc) =>
        doc.doc_id ===
        currentScope
    );


  el.scopeSelect.value =
    currentStillExists
      ? currentScope
      : "all";
}


/* =========================================================================
   DELETE DOCUMENT
============================================================================ */

async function deleteDocument(
  docId
) {
  if (!docId) {
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE}/api/documents/${encodeURIComponent(docId)}`,
      {
        method: "DELETE",
      }
    );

    const data =
      await readApiResponse(response);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          data,
          "Could not delete document."
        )
      );
    }

    state.documents =
      state.documents.filter(
        (doc) =>
          doc.doc_id !== docId
      );

    renderDocuments();

  } catch (error) {
    console.error(
      "Delete error:",
      error
    );

    showKeyStatus(
      error.message,
      "err"
    );
  }
}


/* =========================================================================
   CHAT SUBMIT
============================================================================ */

el.chatForm?.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    const message =
      el.chatInput?.value.trim();

    if (!message) {
      return;
    }

    sendMessage(message);
  }
);


/* =========================================================================
   EXAMPLE PROMPTS
============================================================================ */

document
  .querySelectorAll(".example-chip")
  .forEach((chip) => {
    chip.addEventListener(
      "click",
      () => {
        const message =
          chip.dataset.example;

        if (!message) {
          return;
        }

        /*
          Put the suggestion into the box instead
          of immediately sending it.
        */
        if (el.chatInput) {
          el.chatInput.value =
            message;

          el.chatInput.focus();
        }
      }
    );
  });


/* =========================================================================
   SEND CHAT MESSAGE
============================================================================ */

async function sendMessage(
  message
) {
  const cleanMessage =
    String(message || "").trim();

  if (!cleanMessage) {
    return;
  }

  clearWelcomeIfPresent();

  appendUserMessage(
    cleanMessage
  );

  if (el.chatInput) {
    el.chatInput.value = "";
  }

  setSending(true);

  const typingId =
    appendTypingIndicator();

  try {
    /*
      IMPORTANT:

      This matches backend/main.py exactly:

      class ChatRequest(BaseModel):
          message: str
          doc_id: Optional[str] = "all"
          history: Optional[List[ChatTurn]] = None
    */

    const payload = {
      message:
        cleanMessage,

      doc_id:
        el.scopeSelect?.value ||
        "all",

      history:
        state.chatHistory.slice(-6),
    };


    console.log(
      "Sending chat payload:",
      payload
    );


    const response = await fetch(
      `${API_BASE}/api/chat`,
      {
        method: "POST",

        headers:
          groqHeaders(true),

        body:
          JSON.stringify(payload),
      }
    );


    const data =
      await readApiResponse(
        response
      );


    removeTypingIndicator(
      typingId
    );


    if (
      response.status === 401 ||
      response.status === 429
    ) {
      openApiKeyModal(
        getErrorMessage(
          data,
          "Groq API key required."
        ),

        () =>
          sendMessage(
            cleanMessage
          )
      );

      return;
    }


    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          data,
          `Chat request failed (${response.status}).`
        )
      );
    }


    const answer =
      data.answer ||
      "No answer was returned.";


    appendAssistantMessage(
      answer,
      data.sources || []
    );


    /*
      Store conversation only after a
      successful response.
    */

    state.chatHistory.push({
      role: "user",
      content:
        cleanMessage,
    });


    state.chatHistory.push({
      role: "assistant",
      content:
        answer,
    });


    /*
      Prevent unlimited browser-side history.
    */

    if (
      state.chatHistory.length > 20
    ) {
      state.chatHistory =
        state.chatHistory.slice(-20);
    }

  } catch (error) {
    console.error(
      "Chat error:",
      error
    );


    removeTypingIndicator(
      typingId
    );


    appendAssistantMessage(
      error.message,
      [],
      true
    );

  } finally {
    setSending(false);
  }
}


/* =========================================================================
   CHAT UI
============================================================================ */

function setSending(isSending) {
  if (el.chatSend) {
    el.chatSend.disabled =
      isSending;
  }

  if (el.chatInput) {
    el.chatInput.disabled =
      isSending;
  }
}


function clearWelcomeIfPresent() {
  const welcome =
    el.chatLog?.querySelector(
      ".chat-welcome"
    );

  if (welcome) {
    welcome.remove();
  }
}


function appendUserMessage(
  text
) {
  if (!el.chatLog) {
    return;
  }

  const wrap =
    document.createElement(
      "div"
    );

  wrap.className =
    "msg msg--user";


  wrap.innerHTML = `
    <div class="msg__bubble">
      ${escapeHtml(text)}
    </div>
  `;


  el.chatLog.appendChild(
    wrap
  );


  scrollChatToBottom();
}


function appendAssistantMessage(
  text,
  sources = [],
  isError = false
) {
  if (!el.chatLog) {
    return;
  }

  const wrap =
    document.createElement(
      "div"
    );

  wrap.className =
    "msg msg--assistant";


  const bubble =
    document.createElement(
      "div"
    );


  bubble.className =
    "msg__bubble" +
    (
      isError
        ? " error"
        : ""
    );


  bubble.innerHTML =
    escapeHtml(
      text || ""
    ).replace(
      /\n/g,
      "<br>"
    );


  wrap.appendChild(
    bubble
  );


  if (
    Array.isArray(sources) &&
    sources.length
  ) {
    const sourcesRow =
      document.createElement(
        "div"
      );

    sourcesRow.className =
      "sources";


    for (
      const source of sources
    ) {
      sourcesRow.appendChild(
        buildSourceCard(
          source
        )
      );
    }


    wrap.appendChild(
      sourcesRow
    );
  }


  el.chatLog.appendChild(
    wrap
  );


  scrollChatToBottom();
}


/* =========================================================================
   TYPING INDICATOR
============================================================================ */

function appendTypingIndicator() {
  if (!el.chatLog) {
    return null;
  }

  const id =
    `typing-${Date.now()}`;


  const wrap =
    document.createElement(
      "div"
    );


  wrap.id = id;

  wrap.className =
    "msg msg--assistant";


  wrap.innerHTML = `
    <div class="msg__bubble">

      <span class="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </span>

    </div>
  `;


  el.chatLog.appendChild(
    wrap
  );


  scrollChatToBottom();


  return id;
}


function removeTypingIndicator(
  id
) {
  if (!id) {
    return;
  }

  document
    .getElementById(id)
    ?.remove();
}


/* =========================================================================
   SOURCE CARDS
============================================================================ */

function buildSourceCard(
  source
) {
  let card;


  if (
    el.sourceCardTemplate
      ?.content
      ?.firstElementChild
  ) {
    card =
      el.sourceCardTemplate
        .content
        .firstElementChild
        .cloneNode(true);
  } else {
    card =
      document.createElement(
        "button"
      );

    card.type = "button";

    card.className =
      "source-card";

    card.innerHTML = `
      <div class="source-card__index"></div>

      <div class="source-card__body">

        <div class="source-card__filename"></div>

        <div class="source-card__snippet"></div>

      </div>

      <div class="source-card__score"></div>
    `;
  }


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


  /*
    Backend source format:

    {
      index,
      doc_id,
      filename,
      snippet,
      relevance
    }
  */

  if (indexEl) {
    indexEl.textContent =
      source.index ?? "";
  }


  if (filenameEl) {
    filenameEl.textContent =
      source.filename ||
      "Source";
  }


  if (snippetEl) {
    snippetEl.textContent =
      source.snippet ||
      "";
  }


  if (scoreEl) {
    const relevance =
      Number(
        source.relevance
      );

    scoreEl.textContent =
      Number.isFinite(
        relevance
      )
        ? `${Math.round(
            relevance * 100
          )}%`
        : "";
  }


  card.addEventListener(
    "click",
    () => {
      openExcerptModal(
        source.filename ||
          "Source",

        source.snippet ||
          ""
      );
    }
  );


  return card;
}


/* =========================================================================
   SOURCE MODAL
============================================================================ */

function openExcerptModal(
  title,
  body
) {
  if (!el.excerptModal) {
    return;
  }


  if (el.excerptModalTitle) {
    el.excerptModalTitle.textContent =
      title || "Source";
  }


  if (el.excerptModalBody) {
    el.excerptModalBody.textContent =
      body || "";
  }


  el.excerptModal.classList.remove(
    "hidden"
  );
}


function closeExcerptModal() {
  el.excerptModal?.classList.add(
    "hidden"
  );
}


el.excerptModalClose
  ?.addEventListener(
    "click",
    closeExcerptModal
  );


el.excerptModal
  ?.querySelector(
    ".modal__backdrop"
  )
  ?.addEventListener(
    "click",
    closeExcerptModal
  );


/* =========================================================================
   SCROLL
============================================================================ */

function scrollChatToBottom() {
  if (!el.chatLog) {
    return;
  }

  requestAnimationFrame(
    () => {
      el.chatLog.scrollTop =
        el.chatLog.scrollHeight;
    }
  );
}


/* =========================================================================
   ESCAPE KEY
============================================================================ */

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
      !el.excerptModal
        .classList
        .contains("hidden")
    ) {
      closeExcerptModal();
    }


    if (
      el.apiKeyModal &&
      !el.apiKeyModal
        .classList
        .contains("hidden")
    ) {
      closeApiKeyModal();
    }
  }
);


/* =========================================================================
   INITIAL LOAD
============================================================================ */

async function initialise() {
  await loadDocuments();
}


initialise();
