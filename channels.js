// channels.js

async function getCurrentUserOrRedirect() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    window.location = "login_page.html";
    return null;
  }
  return data.user;
}

async function initSidebar() {
  const user = await getCurrentUserOrRedirect();
  if (!user) return;

  // Set status ONLINE when visiting app pages
  await supabase
    .from("users")
    .update({ status: "ONLINE" })
    .eq("id", user.id);

  // Show username in sidebar if element exists
  const usernameDisplay = document.getElementById("usernameDisplay");
  if (usernameDisplay) {
    const { data: profile } = await supabase
      .from("users")
      .select("username")
      .eq("id", user.id)
      .single();

    usernameDisplay.textContent = profile?.username || user.email;
  }

  // Load channels into sidebar
  await loadChannels();
}

async function loadChannels() {
  const channelList = document.getElementById("channelList");
  if (!channelList) return;

  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .order("inserted_at", { ascending: true });

  if (error) {
    console.error("Error loading channels:", error);
    return;
  }

  channelList.innerHTML = "";

  (data || []).forEach((ch) => {
    const div = document.createElement("div");
    div.className =
      "flex items-center gap-2 px-3 py-2 cursor-pointer text-gray-300 hover:bg-white/10 rounded-lg";
    div.textContent = "# " + ch.slug;
    div.onclick = () => {
      localStorage.setItem("currentChannelId", ch.id);
      localStorage.setItem("currentChannelSlug", ch.slug);
      window.location = "chat.html";
    };
    channelList.appendChild(div);
  });
}

async function createChannel() {
  const input = document.getElementById("channelName");
  if (!input) return;

  let name = input.value.trim();
  if (!name) {
    alert("Please enter channel name");
    return;
  }

  let slug = name.toLowerCase();
  if (slug.startsWith("#")) slug = slug.slice(1);
  slug = slug.replace(/\s+/g, "-");

  const { data: userData } = await supabase.auth.getUser();
  if (!userData || !userData.user) {
    window.location = "login_page.html";
    return;
  }

  const user = userData.user;

  const { data, error } = await supabase
    .from("channels")
    .insert({
      slug,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    alert(error.message);
    console.error(error);
    return;
  }

  input.value = "";

  // Store new channel and go straight to chat
  localStorage.setItem("currentChannelId", data.id);
  localStorage.setItem("currentChannelSlug", data.slug);
  window.location = "chat.html";
}

async function logout() {
  // Try to mark user OFFLINE
  const { data } = await supabase.auth.getUser();
  if (data && data.user) {
    await supabase
      .from("users")
      .update({ status: "OFFLINE" })
      .eq("id", data.user.id);
  }

  await supabase.auth.signOut();
  localStorage.removeItem("currentChannelId");
  localStorage.removeItem("currentChannelSlug");
  window.location = "login_page.html";
}

// Initialize sidebar when DOM is ready (used by both channels.html and chat.html)
document.addEventListener("DOMContentLoaded", () => {
  if (window.supabase) {
    initSidebar();
  }
});
