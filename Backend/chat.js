// chat.js  (loaded as type="module" in chat.html)

async function initChat() {
  //Check auth session
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData || !sessionData.session) {
    window.location = "login_page.html";
    return;
  }

  const user = sessionData.session.user;

  //Get current channel from localStorage
  const channelId = localStorage.getItem("currentChannelId");
  const channelSlug = localStorage.getItem("currentChannelSlug");

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

  //Setup send button & Enter key
  setupSendHandler(channelId, user.id);

  //Load and listen for online users
  await loadOnlineUsers();
  subscribeUserStatus();
}

async function loadMessages(channelId) {
  const container = document.getElementById("messagesContainer");
  if (!container) return;

  const { data, error } = await supabase
    .from("messages")
    .select("id, message, inserted_at, users ( username )")
    .eq("channel_id", channelId)
    .order("inserted_at", { ascending: true });

  if (error) {
    console.error("Error loading messages:", error);
    return;
  }

  container.innerHTML = "";

  (data || []).forEach((msg) => {
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
  wrapper.className = "mb-3 flex flex-col";

  wrapper.innerHTML = `
    <div class="flex items-baseline gap-2">
      <span class="text-sm font-semibold text-slate-900 dark:text-white">${author}</span>
      <span class="text-xs text-slate-400">${time}</span>
    </div>
    <p class="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">${msg.message}</p>
  `;

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

function setupRealtime(channelId) {
  supabase
    .channel("realtime:messages:" + channelId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `channel_id=eq.${channelId}`,
      },
      () => {
        // Simply reload all messages on new insert
        loadMessages(channelId);
      }
    )
    .subscribe();
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
  };

  sendBtn.addEventListener("click", send);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
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
