import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const requested = [
  ["Adrian", process.env.ADRIAN_EMAIL],
  ["Karen", process.env.KAREN_EMAIL],
];

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}

for (const [name, email] of requested) {
  if (!email?.trim()) {
    throw new Error(`${name}'s email environment variable is required.`);
  }
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: granted, error: grantError } = await admin.rpc(
  "grant_finance_access_by_email",
  {
    p_adrian_email: process.env.ADRIAN_EMAIL.trim(),
    p_karen_email: process.env.KAREN_EMAIL.trim(),
  },
);
if (grantError) {
  throw new Error(
    `Finance permissions were not changed: ${grantError.message}`,
  );
}
if (!granted || granted.length !== 2) {
  throw new Error("Finance permission grant returned an unexpected result.");
}

console.log(
  `Finance access granted only to: ${granted
    .map((profile) => `${profile.full_name} <${profile.email}>`)
    .join(", ")}`,
);
