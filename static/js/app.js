/**
 * MultiMind — Frontend Logic
 * Phase 1: Ask all models → show side-by-side
 * Phase 2: Continue with chosen model → chat interface
 */

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  phase: "compare",          // "compare" | "chat"
  chosenModel: null,         // e.g. "claude"
  chosenModelInfo: null,     // { label, color, icon }
  chatHistory: [],           // [{ role, content }, ...]
  loading: false,
};

// ── DOM Refs ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const comparePhase  = $("compare-phase");
const chatPhase     = $("chat-phase");
const emptyState    = $("empty-state");
const loadingState  = $("loading-state");
const answerGrid    = $("answer-grid");
const chatMessages  = $("chat-messages");
const userInput     = $("user-input");
const sendBtn       = $("send-btn");
const backBtn       = $("back-btn");
const chosenBadge   = $("chosen-model-badge");

// ── Model accent colors (must match backend AVAILABLE_MODELS) ─────────────
const MODEL_COLORS = {
  openai:  "#10A37F",
  claude:  "#D97757",
  gemini:  "#4285F4",
};

// ── Auto-grow textarea ────────────────────────────────────────────────────
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 160) + "px";
});

// ── Send on Enter (Shift+Enter = newline) ─────────────────────────────────
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
sendBtn.addEventListener("click", handleSend);

// ── Back button ───────────────────────────────────────────────────────────
backBtn.addEventListener("click", () => {
  // Reset to compare phase
  state.phase = "compare";
  state.chosenModel = null;
  state.chatHistory = [];
  chatMessages.innerHTML = "";

  comparePhase.classList.add("active");
  chatPhase.classList.add("hidden");
  chatPhase.classList.remove("active");
  comparePhase.classList.remove("hidden");
});

// ── Main Send Handler ─────────────────────────────────────────────────────
function handleSend() {
  const msg = userInput.value.trim();
  if (!msg || state.loading) return;

  userInput.value = "";
  userInput.style.height = "auto";

  if (state.phase === "compare") {
    askAllModels(msg);
  } else {
    continueChat(msg);
  }
}

// ── Phase 1: Ask All Models ───────────────────────────────────────────────
async function askAllModels(message) {
  setLoading(true);
  emptyState.classList.add("hidden");
  answerGrid.classList.add("hidden");
  loadingState.classList.remove("hidden");

  try {
    const res = await fetch("/api/ask-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();

    renderAnswerGrid(data.results, message);

  } catch (err) {
    loadingState.classList.add("hidden");
    emptyState.classList.remove("hidden");
    alert("Error fetching responses: " + err.message);
  } finally {
    setLoading(false);
  }
}

// ── Render Side-by-Side Cards ─────────────────────────────────────────────
function renderAnswerGrid(results, userMessage) {
  loadingState.classList.add("hidden");
  answerGrid.innerHTML = "";

  for (const [modelKey, info] of Object.entries(results)) {
    const card = document.createElement("div");
    card.className = "answer-card";

    card.innerHTML = `
      <div class="card-header" style="border-left: 3px solid ${info.color}; padding-left: 15px;">
        <span class="card-icon">${info.icon}</span>
        <span class="card-title" style="color: ${info.color}">${info.label}</span>
      </div>
      <div class="card-body">${escapeHtml(info.answer)}</div>
      <div class="card-footer">
        <button
          class="continue-btn"
          style="background: ${info.color}20; color: ${info.color}; border: 1px solid ${info.color}40;"
          data-model="${modelKey}"
          data-label="${info.label}"
          data-color="${info.color}"
          data-icon="${info.icon}"
          data-user-msg="${escapeAttr(userMessage)}"
          data-ai-msg="${escapeAttr(info.answer)}"
        >
          Continue with ${info.label} →
        </button>
      </div>
    `;
    answerGrid.appendChild(card);
  }

  answerGrid.classList.remove("hidden");

  // Attach continue button listeners
  answerGrid.querySelectorAll(".continue-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { model, label, color, icon } = btn.dataset;
      const userMsg = btn.getAttribute("data-user-msg");
      const aiMsg   = btn.getAttribute("data-ai-msg");
      startChat(model, { label, color, icon }, userMsg, aiMsg);
    });
  });
}

// ── Phase 2: Switch to Single-Model Chat ──────────────────────────────────
function startChat(modelKey, modelInfo, firstUserMsg, firstAiMsg) {
  state.phase = "compare";   // will flip to "chat" below
  state.chosenModel = modelKey;
  state.chosenModelInfo = modelInfo;

  // Seed history with the existing exchange
  state.chatHistory = [
    { role: "user",      content: firstUserMsg },
    { role: "assistant", content: firstAiMsg   },
  ];

  // Update badge
  chosenBadge.textContent = `${modelInfo.icon} ${modelInfo.label}`;
  chosenBadge.style.background = `${modelInfo.color}20`;
  chosenBadge.style.color = modelInfo.color;
  chosenBadge.style.border = `1px solid ${modelInfo.color}40`;

  // Render first two messages
  chatMessages.innerHTML = "";
  appendChatMessage("user", firstUserMsg, "You");
  appendChatMessage("assistant", firstAiMsg, modelInfo.label, modelInfo.color);

  // Flip phases
  comparePhase.classList.remove("active");
  comparePhase.classList.add("hidden");
  chatPhase.classList.remove("hidden");
  chatPhase.classList.add("active");

  state.phase = "chat";
}

// ── Phase 2: Continue Conversation ───────────────────────────────────────
async function continueChat(message) {
  setLoading(true);
  appendChatMessage("user", message, "You");

  const thinkingEl = appendThinking();

  try {
    const res = await fetch("/api/continue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: state.chosenModel,
        history: state.chatHistory,
        message,
      }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();

    // Update history
    state.chatHistory.push({ role: "user",      content: message       });
    state.chatHistory.push({ role: "assistant",  content: data.response });

    thinkingEl.remove();
    appendChatMessage(
      "assistant",
      data.response,
      state.chosenModelInfo.label,
      state.chosenModelInfo.color
    );

  } catch (err) {
    thinkingEl.remove();
    appendChatMessage("assistant", "❌ Error: " + err.message, "System");
  } finally {
    setLoading(false);
  }
}

// ── Chat Helpers ──────────────────────────────────────────────────────────
function appendChatMessage(role, content, label, accentColor = null) {
  const div = document.createElement("div");
  div.className = `msg msg-${role}`;

  const labelEl = document.createElement("div");
  labelEl.className = "msg-label";
  if (accentColor) labelEl.style.color = accentColor;
  labelEl.textContent = label;

  const contentEl = document.createElement("div");
  contentEl.textContent = content;

  div.appendChild(labelEl);
  div.appendChild(contentEl);
  chatMessages.appendChild(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
  return div;
}

function appendThinking() {
  const div = document.createElement("div");
  div.className = "msg msg-assistant";
  div.innerHTML = `
    <div class="msg-label" style="color: ${state.chosenModelInfo?.color}">
      ${state.chosenModelInfo?.label}
    </div>
    <div style="color: #555; font-style: italic; font-size: 13px;">Thinking…</div>
  `;
  chatMessages.appendChild(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
  return div;
}

// ── Utilities ─────────────────────────────────────────────────────────────
function setLoading(val) {
  state.loading = val;
  sendBtn.disabled = val;
  userInput.disabled = val;
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return (str || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
