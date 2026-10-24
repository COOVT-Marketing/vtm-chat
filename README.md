# VTM Chat
Free team chat: static frontend (GitHub Pages) + Supabase (Auth, Postgres, Realtime, Storage).

1. Supabase project banayein, `supabase/schema.sql` SQL Editor mein run karein.
2. `js/config.js` mein SUPABASE_URL aur anon key paste karein.
3. Repo GitHub par push karein, Settings → Pages → Branch `main` / root.

Full step-by-step guide chat mein di gayi hai.

## Database
Sirf ek file: `supabase/setup.sql`. Supabase -> SQL Editor -> New query (khali tab) -> paste -> Run.
Naye ya purane project par chalti hai, kitni bhi baar chalayen safe hai.

## Features
Chats, groups (members add karna), reactions, replies, file/image sharing, unread counts + notifications,
delete notices, admin console (shield icon: users, live activity of all chats, conversations).
