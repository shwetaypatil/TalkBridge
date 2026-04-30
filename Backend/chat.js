// chat.js  (loaded as type="module" in chat.html)

let messagesRealtimeChannel = null;
let refreshMessagesTimer = null;
let currentUserId = null;
let currentChannelId = null;
let messageActionMenu = null;
const LONG_PRESS_MS = 650;
const EMOJIS = ["😀", "😁", "😂", "😊", "😍", "😎", "😢", "😮", "👍", "👏", "🙏", "🔥", "❤️", "🎉", "✅", "💡", "🚀", "👀", "🙌", "✨"];

async function initChat() {
  //Check auth session
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData || !sessionData.session) {
    window.location = "index.html";
    return;
  }

  const user = sessionData.session.user;
  currentUserId = user.id;

  //Get current channel from localStorage
  const channelId = localStorage.getItem("currentChannelId");
  const channelSlug = localStorage.getItem("currentChannelSlug");
  currentChannelId = channelId;

  if (!channelId) {
    // No channel selected
    window.location = "channels.html";
    return;
  }

  const channelTitleEl = document.getElementById("channelTitle");
  if (channelTitleEl) {
    channelTitleEl.textContent = channelSlug ? `${channelSlug}` : "Channel";
  }

  //Load existing messages
  await loadMessages(channelId);

  //Setup realtime subscription for messages
  setupRealtime(channelId);

  // for typing presence
  listenTyping(channelId);

  //Setup send button & Enter key
  setupSendHandler(channelId, user.id);
  setupComposerTools(channelId);

  //Load and listen for online users
  await loadOnlineUsers();
  subscribeUserStatus();
}

async function loadMessages(channelId) {
  const container = document.getElementById("messagesContainer");
  if (!container) return;

  const { data, error } = await supabase
    .from("messages")
    .select("id, message, inserted_at, user_id, users ( username )")
    .eq("channel_id", channelId)
    .order("inserted_at", { ascending: true });

  if (error) {
    console.error("Error loading messages:", error);
    container.innerHTML = `
      <div class="flex h-full items-center justify-center text-center">
        <div class="max-w-sm rounded-xl border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
          <p class="text-sm font-semibold">Messages could not load</p>
          <p class="mt-1 text-sm opacity-80">Refresh the page or try again in a moment.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="flex h-full items-center justify-center text-center">
        <div class="max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
          <div class="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span class="material-symbols-outlined">chat_bubble</span>
          </div>
          <p class="mt-4 text-sm font-semibold text-slate-900 dark:text-white">No messages yet</p>
          <p class="mt-1 text-sm text-slate-500 dark:text-[#92a4c9]">Start the conversation with a quick update.</p>
        </div>
      </div>
    `;
    return;
  }

  data.forEach((msg) => {
    renderMessage(msg);
  });

  container.scrollTop = container.scrollHeight;
}

function renderMessage(msg) {
  const container = document.getElementById("messagesContainer");
  if (!container) return;

  const author = msg.users?.username || "Unknown";
  const time = msg.inserted_at
    ? new Date(msg.inserted_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const wrapper = document.createElement("div");
  const isOwnMessage = msg.user_id === currentUserId;
  wrapper.className =
    "group mb-4 flex flex-col rounded-lg px-3 py-2 transition-colors hover:bg-slate-200/50 dark:hover:bg-white/5 " +
    (isOwnMessage ? "cursor-pointer" : "");
  wrapper.dataset.id = msg.id;
  wrapper.dataset.userId = msg.user_id || "";

  const meta = document.createElement("div");
  meta.className = "flex items-baseline gap-2";

  const authorEl = document.createElement("span");
  authorEl.className = "text-sm font-semibold text-slate-900 dark:text-white";
  authorEl.textContent = author;

  const timeEl = document.createElement("span");
  timeEl.className = "text-xs text-slate-400";
  timeEl.textContent = time;

  const messageEl = document.createElement("p");
  messageEl.className = "mt-1 text-sm leading-6 text-slate-800 dark:text-slate-200 whitespace-pre-wrap";
  messageEl.textContent = msg.message;

  meta.append(authorEl, timeEl);
  wrapper.append(meta, messageEl);
  setupMessageLongPress(wrapper, msg);

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;

  // === REACTION BAR ===
  const reactionBar = document.createElement("div");
  reactionBar.className = "reactions mt-2 flex gap-1 opacity-80 transition-opacity group-hover:opacity-100";

  // Reaction list
  const reactionOptions = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDD25"];

  reactionOptions.forEach(r => {
    const btn = document.createElement("button");
    btn.textContent = r;
    btn.className = "rounded-full px-1.5 py-0.5 text-base hover:bg-slate-200 hover:scale-110 transition dark:hover:bg-white/10";
    btn.onclick = () => addReaction(msg.id, r);
    reactionBar.appendChild(btn);
  });

  // Append reaction bar
  wrapper.appendChild(reactionBar);

  // === SHOW EXISTING REACTIONS ===
  updateReactionsUI(msg.id, wrapper);
}

function scheduleLoadMessages(channelId) {
  if (refreshMessagesTimer) clearTimeout(refreshMessagesTimer);

  refreshMessagesTimer = setTimeout(() => {
    loadMessages(channelId);
  }, 100);
}

function setupRealtime(channelId) {
  if (messagesRealtimeChannel) {
    supabase.removeChannel(messagesRealtimeChannel);
  }

  messagesRealtimeChannel = supabase
    .channel("messages:" + channelId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `channel_id=eq.${channelId}`,
      },
      () => {
        scheduleLoadMessages(channelId);
      }
    )
    .on("broadcast", { event: "message-changed" }, () => {
      scheduleLoadMessages(channelId);
    })
    .subscribe((status, error) => {
      if (error) {
        console.error("Messages realtime error:", error);
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Messages realtime status:", status);
      }
    });
}

function setupMessageLongPress(wrapper, msg) {
  if (msg.user_id !== currentUserId) return;

  let pressTimer = null;

  const clearPressTimer = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };

  wrapper.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, .existing-reactions, textarea")) return;

    pressTimer = setTimeout(() => {
      showMessageActionMenu(msg, event.clientX, event.clientY);
    }, LONG_PRESS_MS);
  });

  wrapper.addEventListener("pointerup", clearPressTimer);
  wrapper.addEventListener("pointerleave", clearPressTimer);
  wrapper.addEventListener("pointercancel", clearPressTimer);

  wrapper.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showMessageActionMenu(msg, event.clientX, event.clientY);
  });
}

function closeMessageActionMenu() {
  if (messageActionMenu) {
    messageActionMenu.remove();
    messageActionMenu = null;
  }
}

function showMessageActionMenu(msg, x, y) {
  closeMessageActionMenu();

  messageActionMenu = document.createElement("div");
  messageActionMenu.className =
    "fixed z-[100] w-36 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#111827]";

  const editButton = document.createElement("button");
  editButton.className =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10";
  editButton.innerHTML = `<span class="material-symbols-outlined text-lg">edit</span><span>Edit</span>`;
  editButton.onclick = () => {
    closeMessageActionMenu();
    startEditingMessage(msg);
  };

  const deleteButton = document.createElement("button");
  deleteButton.className =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30";
  deleteButton.innerHTML = `<span class="material-symbols-outlined text-lg">delete</span><span>Delete</span>`;
  deleteButton.onclick = () => {
    closeMessageActionMenu();
    deleteMessage(msg.id);
  };

  messageActionMenu.append(editButton, deleteButton);
  messageActionMenu.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  document.body.appendChild(messageActionMenu);

  const rect = messageActionMenu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 12);
  const top = Math.min(y, window.innerHeight - rect.height - 12);
  messageActionMenu.style.left = `${Math.max(12, left)}px`;
  messageActionMenu.style.top = `${Math.max(12, top)}px`;

  setTimeout(() => {
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!messageActionMenu?.contains(event.target)) {
          closeMessageActionMenu();
        }
      },
      { once: true }
    );
  }, 0);
}

function startEditingMessage(msg) {
  const wrapper = document.querySelector(`[data-id='${msg.id}']`);
  if (!wrapper) return;

  const oldEditor = document.querySelector("[data-editing-message='true']");
  if (oldEditor) scheduleLoadMessages(currentChannelId);

  const messageEl = wrapper.querySelector("p");
  const reactions = wrapper.querySelector(".reactions");
  const existingReactions = wrapper.querySelector(".existing-reactions");
  if (!messageEl) return;

  messageEl.classList.add("hidden");
  if (reactions) reactions.classList.add("hidden");
  if (existingReactions) existingReactions.classList.add("hidden");

  const editor = document.createElement("div");
  editor.dataset.editingMessage = "true";
  editor.className = "mt-2 flex flex-col gap-2";

  const textarea = document.createElement("textarea");
  textarea.className =
    "form-textarea min-h-20 w-full resize-none rounded-lg border-slate-300 bg-white text-sm text-slate-900 focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-[#192233] dark:text-white";
  textarea.value = msg.message;

  const actions = document.createElement("div");
  actions.className = "flex justify-end gap-2";

  const cancelButton = document.createElement("button");
  cancelButton.className =
    "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10";
  cancelButton.textContent = "Cancel";
  cancelButton.onclick = () => scheduleLoadMessages(currentChannelId);

  const saveButton = document.createElement("button");
  saveButton.className =
    "rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary/90";
  saveButton.textContent = "Save";
  saveButton.onclick = () => saveEditedMessage(msg.id, textarea.value);

  actions.append(cancelButton, saveButton);
  editor.append(textarea, actions);
  wrapper.appendChild(editor);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

async function saveEditedMessage(messageId, value) {
  const text = value.trim();
  if (!text) {
    alert("Message cannot be empty.");
    return;
  }

  const { error } = await supabase
    .from("messages")
    .update({ message: text })
    .eq("id", messageId)
    .eq("user_id", currentUserId);

  if (error) {
    alert(error.message);
    console.error(error);
    return;
  }

  await notifyMessagesChanged();
}

async function deleteMessage(messageId) {
  const shouldDelete = confirm("Delete this message?");
  if (!shouldDelete) return;

  await supabase.from("message_reactions").delete().eq("message_id", messageId);

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("user_id", currentUserId);

  if (error) {
    alert(error.message);
    console.error(error);
    return;
  }

  await notifyMessagesChanged();
}

async function notifyMessagesChanged() {
  if (!currentChannelId) return;

  await loadMessages(currentChannelId);

  if (messagesRealtimeChannel) {
    messagesRealtimeChannel.send({
      type: "broadcast",
      event: "message-changed",
      payload: { channelId: currentChannelId },
    });
  }
}

async function addReaction(messageId, reaction) {
  const session = await supabase.auth.getSession();
  const userId = session.data.session.user.id;

  await supabase.from("message_reactions").upsert({
    message_id: messageId,
    user_id: userId,
    reaction: reaction
  });

  // Update UI instantly
  const msgWrapper = document.querySelector(`[data-id='${messageId}']`);
  updateReactionsUI(messageId, msgWrapper);
}

async function updateReactionsUI(messageId, wrapper) {
  if (!wrapper) return;

  const old = wrapper.querySelector(".existing-reactions");
  if (old) old.remove();

  const reactionArea = document.createElement("div");
  reactionArea.className = "flex gap-2 mt-2";

  const { data } = await supabase
    .from("message_reactions")
    .select("reaction, user_id")
    .eq("message_id", messageId);

  if (!data || data.length === 0) return;

  // Count reactions
  const grouped = {};
  data.forEach(r => {
    if (!grouped[r.reaction]) grouped[r.reaction] = 0;
    grouped[r.reaction]++;
  });

  // Render UI
  Object.keys(grouped).forEach(emoji => {
    const chip = document.createElement("span");
    chip.className =
      "rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700 cursor-pointer hover:border-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
    chip.textContent = `${emoji} ${grouped[emoji]}`;
    chip.onclick = () => removeReaction(messageId, emoji);
    reactionArea.appendChild(chip);
  });

  reactionArea.classList.add("existing-reactions");
  wrapper.appendChild(reactionArea);
}

async function removeReaction(messageId, reaction) {
  const session = await supabase.auth.getSession();
  const userId = session.data.session.user.id;

  await supabase.from("message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("reaction", reaction);

  const msgWrapper = document.querySelector(`[data-id='${messageId}']`);
  updateReactionsUI(messageId, msgWrapper);
}


function setupSendHandler(channelId, userId) {
  const input = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");

  if (!input || !sendBtn) return;

  const send = async () => {
    const text = input.value.trim();
    if (!text) return;

    const { error } = await supabase.from("messages").insert({
      message: text,
      channel_id: channelId,
      user_id: userId,
    });

    if (error) {
      alert(error.message);
      console.error(error);
      return;
    }

    input.value = "";
    await loadMessages(channelId);

    if (messagesRealtimeChannel) {
      messagesRealtimeChannel.send({
        type: "broadcast",
        event: "message-changed",
        payload: { channelId },
      });
    }
  };

  sendBtn.addEventListener("click", send);
  input.addEventListener("input", () => userTyping(channelId));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
}

function setupComposerTools(channelId) {
  const input = document.getElementById("messageInput");
  const mentionBtn = document.getElementById("mentionBtn");
  const emojiBtn = document.getElementById("emojiBtn");
  const mentionPicker = document.getElementById("mentionPicker");
  const emojiPicker = document.getElementById("emojiPicker");

  if (!input) return;

  mentionBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    emojiPicker?.classList.add("hidden");
    await toggleMentionPicker(mentionPicker, input);
  });

  emojiBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    mentionPicker?.classList.add("hidden");
    toggleEmojiPicker(emojiPicker, input);
  });

  input.addEventListener("input", () => {
    const mentionQuery = getActiveMentionQuery(input);
    if (!mentionQuery) return;
    showMentionSuggestions(mentionPicker, input, mentionQuery);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#mentionPicker, #emojiPicker, #mentionBtn, #emojiBtn")) {
      mentionPicker?.classList.add("hidden");
      emojiPicker?.classList.add("hidden");
    }
  });
}

function insertAtCursor(input, value) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + value + input.value.slice(end);
  const nextCursor = start + value.length;
  input.focus();
  input.setSelectionRange(nextCursor, nextCursor);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function replaceActiveMention(input, username) {
  const cursor = input.selectionStart ?? input.value.length;
  const beforeCursor = input.value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([\w.-]*)$/);

  if (!match) {
    insertAtCursor(input, `@${username} `);
    return;
  }

  const mentionStart = cursor - match[2].length - 1;
  input.value = input.value.slice(0, mentionStart) + `@${username} ` + input.value.slice(cursor);
  const nextCursor = mentionStart + username.length + 2;
  input.focus();
  input.setSelectionRange(nextCursor, nextCursor);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getActiveMentionQuery(input) {
  const cursor = input.selectionStart ?? input.value.length;
  const beforeCursor = input.value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([\w.-]{0,30})$/);
  if (!match) return null;
  return match[2].toLowerCase();
}

async function toggleMentionPicker(picker, input) {
  if (!picker) return;

  if (!picker.classList.contains("hidden")) {
    picker.classList.add("hidden");
    return;
  }

  await showMentionSuggestions(picker, input, "");
}

async function showMentionSuggestions(picker, input, query) {
  if (!picker) return;

  const { data, error } = await supabase
    .from("users")
    .select("id, username")
    .not("username", "is", null)
    .order("username", { ascending: true })
    .limit(20);

  if (error) {
    console.error("Could not load users for mentions:", error);
    return;
  }

  const users = (data || []).filter((user) =>
    user.username?.toLowerCase().includes(query)
  );

  picker.innerHTML = "";

  if (users.length === 0) {
    const empty = document.createElement("div");
    empty.className = "px-3 py-2 text-sm text-slate-500 dark:text-slate-400";
    empty.textContent = "No users found";
    picker.appendChild(empty);
  }

  users.forEach((user) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10";

    const avatar = document.createElement("span");
    avatar.className =
      "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white";
    avatar.textContent = user.username.charAt(0).toUpperCase();

    const name = document.createElement("span");
    name.className = "truncate text-sm font-medium text-slate-800 dark:text-slate-100";
    name.textContent = `@${user.username}`;

    button.append(avatar, name);
    button.onclick = () => {
      replaceActiveMention(input, user.username);
      picker.classList.add("hidden");
    };
    picker.appendChild(button);
  });

  picker.classList.remove("hidden");
}

function toggleEmojiPicker(picker, input) {
  if (!picker) return;

  if (!picker.classList.contains("hidden")) {
    picker.classList.add("hidden");
    return;
  }

  picker.innerHTML = "";

  EMOJIS.forEach((emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "inline-flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-slate-100 dark:hover:bg-white/10";
    button.textContent = emoji;
    button.onclick = () => {
      insertAtCursor(input, emoji);
      picker.classList.add("hidden");
    };
    picker.appendChild(button);
  });

  picker.classList.remove("hidden");
}

async function loadOnlineUsers() {
  const container = document.getElementById("onlineUsers");
  if (!container) return;

  const { data, error } = await supabase
    .from("users")
    .select("username, status")
    .eq("status", "ONLINE");

  if (error) {
    console.error("Error loading online users:", error);
    return;
  }

  container.innerHTML = "";

  (data || []).forEach((user) => {
    const avatar = document.createElement("div");
    avatar.className =
      "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white border-2 border-background-light dark:border-background-dark";
    avatar.textContent = user.username
      ? user.username.charAt(0).toUpperCase()
      : "?";
    container.appendChild(avatar);
  });
}

function subscribeUserStatus() {
  supabase
    .channel("realtime:users-status")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "users",
      },
      () => {
        loadOnlineUsers();
      }
    )
    .subscribe();
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.supabase) {
    initChat();
  }
});

let typingTimeout = null;

async function userTyping(channelId) {
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user?.id;
  if (!userId) return;

  supabase.from("typing_presence").upsert({
    channel_id: channelId,
    user_id: userId,
    is_typing: true,
    updated_at: new Date().toISOString()
  });

  if (typingTimeout) clearTimeout(typingTimeout);

  typingTimeout = setTimeout(() => {
    supabase.from("typing_presence")
      .update({ is_typing: false })
      .eq("channel_id", channelId)
      .eq("user_id", userId);
  }, 2000);
}

async function listenTyping(channelId) {
  supabase.channel("typing:" + channelId)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "typing_presence",
      filter: `channel_id=eq.${channelId}`
    }, () => showTypingUsers(channelId))
    .subscribe();
}

async function showTypingUsers(channelId) {
  const session = await supabase.auth.getSession();
  const me = session.data.session.user.id;

  const { data } = await supabase
    .from("typing_presence")
    .select("user_id, users(username)")
    .eq("channel_id", channelId)
    .eq("is_typing", true)
    .neq("user_id", me);

  const indicator = document.getElementById("typingIndicator");
  if (!indicator) return;

  if (!data || data.length === 0) {
    indicator.textContent = "";
    return;
  }

  const names = data.map(x => x.users.username);
  indicator.textContent =
    names.length === 1
      ? `${names[0]} is typing…`
      : `${names.join(", ")} are typing…`;
}
