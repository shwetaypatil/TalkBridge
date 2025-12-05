// login.js

document.getElementById("loginButton").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      alert("Invalid email or password.");
      return;
    }

    // Redirect to channels page
    window.location.href = "channels.html";

  } catch (err) {
    console.error("Login error:", err);
    alert("Something went wrong while logging in.");
  }
});

// Check existing session
supabase.auth.getSession().then(({ data }) => {
  if (data.session) {
    // Already logged in → go to channels
    window.location.href = "channels.html";
  }
});
