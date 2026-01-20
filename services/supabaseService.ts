/**
 * SUPABASE CONFIGURATION
 * Table: 'usage' (email text PK, count int4, last_reset timestamptz)
 */

const SUPABASE_URL = "https://npxbkxzsgjbjjsvneedk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weGJreHpzZ2piampzdm5lZWRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4ODY1NDIsImV4cCI6MjA4NDQ2MjU0Mn0.FaXkxmpAv2veo_hCIqmGSQFZtjx2dodNu2h6Z9q20is";

const getHeaders = () => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
});

export const syncUsageFromCloud = async (email: string) => {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/usage?email=eq.${email}`,
      {
        method: "GET",
        headers: getHeaders(),
      },
    );

    if (!response.ok) throw new Error("Network response was not ok");

    const data = await response.json();
    return data && data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error("Supabase Sync Error:", e);
    return null;
  }
};

export const updateUsageInCloud = async (
  email: string,
  count: number,
  lastReset?: string,
) => {
  try {
    const payload = {
      email,
      count,
      last_reset: lastReset || new Date().toISOString(),
    };

    // UPSERT pattern via PostgREST
    const response = await fetch(`${SUPABASE_URL}/rest/v1/usage`, {
      method: "POST",
      headers: {
        ...getHeaders(),
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Supabase Save Failed:", err);
    } else {
      console.log(`[Cloud] Synced ${count} credits for ${email}`);
    }
  } catch (e) {
    console.error("Supabase Update Error:", e);
  }
};
