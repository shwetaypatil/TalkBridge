// supabase.js

const SUPABASE_URL = "https://pflgqexkhfftjtczwlai.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmbGdxZXhraGZmdGp0Y3p3bGFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwOTg1NjgsImV4cCI6MjA5MjY3NDU2OH0.OHDU94zdTltv53uZOq4S0mq_Fg4JjZYclpXeJvQyxxA";

// Create a single Supabase client instance
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose globally as `supabase`
window.supabase = supabaseClient;
