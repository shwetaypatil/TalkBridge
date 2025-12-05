// supabase.js

const SUPABASE_URL = "https://fcvrhnnqwitzrknrpvzp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjdnJobm5xd2l0enJrbnJwdnpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NDA5MDQsImV4cCI6MjA4MDUxNjkwNH0.vY5Sll7ZBiNnDGmALOKyUuMtpyt_c2CDx1TyqD4fAMY";

// Create a single Supabase client instance
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose globally as `supabase`
window.supabase = supabaseClient;

