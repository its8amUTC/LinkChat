
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const STORE_KEY = "linkchat_demo_v1";
  const SESSION_KEY = "linkchat_demo_session";

  const screens = {
    auth: $("#authScreen"),
    dashboard: $("#dashboardScreen"),
    chat: $("#chatScreen")
  };

  let db = readDB();
  let currentUser = sessionStorage.getItem(SESSION_KEY) || "";
  let currentRoom = "";
  let authMode = "signup";
  let toastTimer;

  function readDB() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && saved.users && saved.rooms) return saved;
    } catch (error) {
      console.warn("Could not read LinkChat data.", error);
    }
    return { users: {}, rooms: {} };
  }

  function saveDB() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
      return true;
    } catch (error) {
      showToast("Browser storage is unavailable or full.");
      return false;
    }
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function formatCode(value) {
    const digits = String(value).replace(/\D/g, "").slice(0, 9);
    return digits.match(/.{1,3}/g)?.join("-") || "";
  }

  function normalizeCode(value) {
    return String(value).replace(/\D/g, "");
  }

  function makeRoomCode() {
    // Nine random digits, including possible leading zeroes.
    const cryptoAPI = window.crypto;
    for (let attempt = 0; attempt < 100; attempt++) {
      const digits = Array.from(
        { length: 9 },
        () => cryptoAPI
          ? cryptoAPI.getRandomValues(new Uint32Array(1))[0] % 10
          : Math.floor(Math.random() * 10)
      ).join("");

      if (!db.rooms[digits]) return digits;
    }
    throw new Error("Could not generate a unique room code. Try again.");
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function feedback(element, message, type = "error") {
    element.textContent = message;
    element.className = "feedback " + type;
  }

  function showScreen(name) {
    Object.values(screens).forEach((screen) => screen.classList.add("hidden"));
    screens[name].classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function user() {
    return db.users[currentUser] || null;
  }

  function setAuthMode(mode) {
    authMode = mode;
    const isSignup = mode === "signup";

    document.querySelectorAll("[data-auth]").forEach((button) => {
      const active = button.dataset.auth === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    $("#authTitle").textContent = isSignup
      ? "Create your account" : "Welcome back";
    $("#authSubtitle").textContent = isSignup
      ? "Your next conversation starts here."
      : "Log in to reconnect with your people.";
    $("#authSubmit").innerHTML = isSignup
      ? 'Create account <span>→</span>' : 'Log in <span>→</span>';
    $("#password").autocomplete = isSignup ? "new-password" : "current-password";
    $("#authFeedback").textContent = "";
  }

  function login(username) {
    currentUser = username;
    sessionStorage.setItem(SESSION_KEY, username);
    $("#logoutBtn").classList.remove("hidden");
    renderDashboard();
    showScreen("dashboard");
  }

  function logout() {
    currentUser = "";
    currentRoom = "";
    sessionStorage.removeItem(SESSION_KEY);
    $("#logoutBtn").classList.add("hidden");
    $("#authForm").reset();
    showScreen("auth");
    showToast("You have logged out.");
  }

  $("#logoutBtn").addEventListener("click", logout);

  document.querySelectorAll("[data-auth]").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.auth));
  });

  $("#authForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const username = $("#username").value.trim();
    const password = $("#password").value;
    const output = $("#authFeedback");

    if (!/^[a-zA-Z0-9_-]{2,24}$/.test(username)) {
      feedback(output, "Use 2–24 letters, numbers, underscores, or hyphens.");
      return;
    }

    if (password.length < 6) {
      feedback(output, "Your password must have at least 6 characters.");
      return;
    }

    if (authMode === "signup") {
      if (db.users[username.toLowerCase()]) {
        feedback(output, "That username already exists. Try logging in.");
        return;
      }

      // DEMO ONLY: Never store raw passwords in a real application.
      db.users[username.toLowerCase()] = {
        username,
        password,
        rooms: []
      };

      if (!saveDB()) {
        delete db.users[username.toLowerCase()];
        return;
      }

      login(username.toLowerCase());
      showToast("Welcome to LinkChat!");
      return;
    }

    const account = db.users[username.toLowerCase()];

    if (!account || account.password !== password) {
      feedback(output, "Incorrect username or password.");
      return;
    }

    login(username.toLowerCase());
    showToast("Welcome back!");
  });

  $("#showJoinBtn").addEventListener("click", () => {
    if (!user()) {
      setAuthMode("signup");
      $("#username").focus();
      feedback($("#authFeedback"), "Create an account or log in first.", "success");
      return;
    }

    showScreen("dashboard");
    $("#joinCode").focus();
  });

  function addMember(room, username) {
    if (!room.members.includes(username)) room.members.push(username);
    const account = db.users[username];
    if (account && !account.rooms.includes(room.code)) {
      account.rooms.push(room.code);
    }
  }

  $("#createRoomForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!user()) return showScreen("auth");

    const name = $("#roomName").value.trim();
    if (!name) return;

    try {
      const code = makeRoomCode();
      db.rooms[code] = {
        code,
        name: name.slice(0, 48),
        owner: currentUser,
        members: [],
        messages: [],
        createdAt: Date.now()
      };

      addMember(db.rooms[code], currentUser);

      if (!saveDB()) {
        delete db.rooms[code];
        user().rooms = user().rooms.filter((item) => item !== code);
        return;
      }

      $("#roomName").value = "";
      renderDashboard();
      openRoom(code);
      showToast("Room created! Share your code.");
    } catch (error) {
      showToast(error.message);
    }
  });

  $("#joinCode").addEventListener("input", (event) => {
    const digits = normalizeCode(event.target.value);
    event.target.value = formatCode(digits);
  });

  $("#joinRoomForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const code = normalizeCode($("#joinCode").value);
    const output = $("#joinFeedback");

    if (code.length !== 9) {
      feedback(output, "Enter all 9 digits in XXX-XXX-XXX format.");
      return;
    }

    const room = db.rooms[code];

    if (!room) {
      feedback(output, "Room not found in this browser. Check your code.");
      return;
    }

    addMember(room, currentUser);
    if (!saveDB()) return;

    $("#joinCode").value = "";
    feedback(output, "Joined successfully!", "success");
    renderDashboard();
    openRoom(code);
  });

  function renderDashboard() {
    const account = user();
    if (!account) return;

    $("#welcomeName").textContent = account.username;
    $("#profileAvatar").textContent = account.username[0].toUpperCase();
    $("#logoutBtn").classList.remove("hidden");

    const rooms = account.rooms
      .map((code) => db.rooms[code])
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt);

    $("#roomCount").textContent = `${rooms.length} room${rooms.length === 1 ? "" : "s"}`;

    const roomList = $("#roomList");

    if (!rooms.length) {
      roomList.innerHTML = `
        <div class="empty-state">
          <div style="font-size:28px;margin-bottom:8px">✳</div>
          <strong>No conversations yet</strong>
          <p>Create your first room or join one with a code.</p>
        </div>`;
      return;
    }

    roomList.innerHTML = rooms.map((room) => `
      <article class="room-item">
        <div class="room-item-icon">✳</div>
        <div class="room-item-info">
          <strong>${escapeHTML(room.name)}</strong>
          <span>${escapeHTML(formatCode(room.code))} · ${room.members.length} member(s)</span>
        </div>
        <div class="room-item-actions">
          <button class="button button-secondary" data-open="${room.code}">Open chat →</button>
          <button class="button button-ghost" data-copy="${room.code}">Copy code</button>
        </div>
      </article>
    `).join("");

    roomList.querySelectorAll("[data-open]").forEach((button) => {
      button.addEventListener("click", () => openRoom(button.dataset.open));
    });

    roomList.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", () => copyCode(button.dataset.copy));
    });
  }

  function openRoom(code) {
    const room = db.rooms[code];
    if (!room || !user()) return;

    if (!room.members.includes(currentUser)) {
      addMember(room, currentUser);
      if (!saveDB()) return;
    }

    currentRoom = code;
    $("#chatRoomName").textContent = room.name;
    $("#displayRoomCode").textContent = formatCode(room.code);
    $("#sidebarCode").textContent = formatCode(room.code);
    $("#roomOwner").textContent = db.users[room.owner]?.username || room.owner;
    $("#chatMemberCount").textContent = room.members.length;
    $("#sidebarMembers").textContent = room.members.length;

    renderMessages();
    showScreen("chat");
    $("#messageInput").focus();
  }

  function renderMessages() {
    const room = db.rooms[currentRoom];
    const container = $("#messages");
    if (!room) return;

    if (!room.messages.length) {
      container.innerHTML = `
        <div class="empty-state">
          <strong>You're at the start of the conversation.</strong>
          <p>Say hello and get things going!</p>
        </div>`;
      return;
    }

    container.innerHTML = room.messages.map((message) => {
      const own = message.sender === currentUser;
      const time = new Date(message.time).toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit"
      });

      return `
        <article class="message ${own ? "own" : ""}">
          <div class="message-meta">
            <strong>${escapeHTML(message.displayName)}</strong>
            <time>${escapeHTML(time)}</time>
          </div>
          <div class="message-bubble">${escapeHTML(message.text)}</div>
        </article>`;
    }).join("");

    container.scrollTop = container.scrollHeight;
  }

  $("#messageForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const text = $("#messageInput").value.trim();
    const room = db.rooms[currentRoom];

    if (!text || !room || !user()) return;

    room.messages.push({
      id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      sender: currentUser,
      displayName: user().username,
      text: text.slice(0, 2000),
      time: Date.now()
    });

    if (room.messages.length > 500) room.messages.shift();

    if (!saveDB()) {
      room.messages.pop();
      return;
    }

    $("#messageInput").value = "";
    renderMessages();
  });

  async function copyCode(code) {
    const formatted = formatCode(code);

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(formatted);
      } else {
        const helper = document.createElement("textarea");
        helper.value = formatted;
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        const copied = document.execCommand("copy");
        helper.remove();
        if (!copied) throw new Error("Clipboard unavailable");
      }
      showToast(`Room code ${formatted} copied!`);
    } catch {
      showToast(`Your room code: ${formatted}`);
    }
  }

  $("#copyCodeBtn").addEventListener("click", () => copyCode(currentRoom));
  $("#copyCodeBtn2").addEventListener("click", () => copyCode(currentRoom));

  $("#backBtn").addEventListener("click", () => {
    renderDashboard();
    showScreen("dashboard");
  });

  // Restore a session for this browser tab.
  if (currentUser && db.users[currentUser]) {
    login(currentUser);
  } else {
    currentUser = "";
    sessionStorage.removeItem(SESSION_KEY);
    $("#logoutBtn").classList.add("hidden");
    showScreen("auth");
  }
})();
