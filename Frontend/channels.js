// channels.js

async function getCurrentUserOrRedirect() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    window.location = "index.html";
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
  const currentUser = await getCurrentUserOrRedirect();
  if (!currentUser) return;

  const channelLists = [
    document.getElementById("channelList"),
    document.getElementById("mobileChannelList"),
  ].filter(Boolean);

  if (channelLists.length === 0) return;

  const { data, error } = await supabase
    .from("channel_members")
    .select("channels (*)")
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("Error loading channels:", error);
    return;
  }

  const channels = (data || [])
    .map((membership) => membership.channels)
    .filter(Boolean);

  channelLists.forEach((list) => {
    list.innerHTML = "";
  });

  const currentChannelId = localStorage.getItem("currentChannelId");

  if (channels.length === 0) {
    channelLists.forEach((list) => {
      const empty = document.createElement("div");
      empty.className =
        "rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-[#92a4c9]";
      empty.textContent = "No channels yet";
      list.appendChild(empty);
    });
    return;
  }

  const createChannelItem = (ch) => {
    const div = document.createElement("div");
    const isActive = ch.id === currentChannelId;
    div.className =
      "flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg text-sm transition " +
      (isActive
        ? "bg-primary text-white shadow-lg shadow-primary/20"
        : "text-gray-300 hover:bg-white/10 hover:text-white");
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined text-lg";
    icon.textContent = "tag";

    const label = document.createElement("span");
    label.className = "truncate";
    label.textContent = ch.slug;

    div.append(icon, label);
    div.onclick = () => {
      localStorage.setItem("currentChannelId", ch.id);
      localStorage.setItem("currentChannelSlug", ch.slug);
      window.location = "chat.html";
    };
    return div;
  };

  channelLists.forEach((list) => {
    channels.forEach((ch) => list.appendChild(createChannelItem(ch)));
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
    window.location = "index.html";
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

  const { error: membershipError } = await supabase
    .from("channel_members")
    .insert({
      channel_id: data.id,
      user_id: user.id,
    });

  if (membershipError) {
    alert("Channel created, but could not add you as a member: " + membershipError.message);
    console.error(membershipError);
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
  window.location = "index.html";
}

// Initialize sidebar when DOM is ready (used by both channels.html and chat.html)
document.addEventListener("DOMContentLoaded", () => {
  if (window.supabase) {
    initSidebar();
  }
});

// for adding new members to the channel
document.getElementById("addMemberBtn")?.addEventListener("click", async () => {
  const channelId = localStorage.getItem("currentChannelId");
  if (!channelId) {
    return alert("No channel selected!");
  }

  // Ask for username or email
  const input = prompt("Enter username or email of the member to add:");
  if (!input || input.trim() === "") return;

  const value = input.trim();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  // Find by username. Only query id when the input is actually a UUID;
  // comparing an email to a UUID column causes Supabase to return 400.
  let { data: users, error: findError } = await supabase
    .from("users")
    .select("id, username")
    .eq("username", value)
    .limit(1);

  if (findError) {
    console.error(findError);
    return alert("Could not search user: " + findError.message);
  }

  if ((!users || users.length === 0) && isUuid) {
    const { data: usersById, error: idFindError } = await supabase
      .from("users")
      .select("id, username")
      .eq("id", value)
      .limit(1);

    if (idFindError) {
      console.error(idFindError);
      return alert("Could not search user: " + idFindError.message);
    }

    users = usersById;
  }

  if (!users || users.length === 0) {
    return alert("User not found. Try their exact username.");
  }

  const userId = users[0].id;

  // Insert into channel_members table
  const { error: insertError } = await supabase
    .from("channel_members")
    .insert({
      channel_id: channelId,
      user_id: userId
    });

  if (insertError) {
    console.error(insertError);
    if (insertError.code === "23505") {
      return alert(`${users[0].username} is already in this channel.`);
    }
    return alert("Failed to add member: " + insertError.message);
  }

  alert(`Added ${users[0].username} to this channel!`);
});
