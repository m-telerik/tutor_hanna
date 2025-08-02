// 📁 /api/students.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_IDS = [618647337, 2341205];

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const tgid = url.searchParams.get("tgid");
  const telegram_id = parseInt(req.headers["x-telegram-id"] || tgid);

if (!ADMIN_IDS.includes(telegram_id)) {
  return res.status(403).json({ error: 'Access denied' });
}

  const { data: users, error: userError } = await supabase
    .from('hanna_users')
    .select('id, name, language, preferred_days, preferred_time')
    .eq('is_active', true)
    .eq('role', 'student');

  if (userError) return res.status(500).json({ error: userError.message });

  const { data: sessions } = await supabase
    .from('hanna_sessions')
    .select('id, user_id, session_date, status, type') // добавили status и type
    .gte('session_date', new Date().toISOString().slice(0, 10));

const sessionsMap = {};
for (const s of sessions) {
  if (
    !sessionsMap[s.user_id] ||
    sessionsMap[s.user_id].session_date > s.session_date
  ) {
    sessionsMap[s.user_id] = {
      session_date: s.session_date,
      session_id: s.id,
      status: s.status,
      type: s.type
    };
  }
}

const students = users.map((u) => {
  const session = sessionsMap[u.id] || {};

  return {
    name: u.name,
    language: Array.isArray(u.language) ? u.language.join(', ') : u.language,
    preferred_days: u.preferred_days || [],
    preferred_time: u.preferred_time || null,
    next_session: session.session_date || null,
    next_session_id: session.session_id || null,
    status: session.status || null,
    type: session.type || null,
    frequency: u.preferred_days?.length || null,
  };
});

  return res.status(200).json({ students });
}
