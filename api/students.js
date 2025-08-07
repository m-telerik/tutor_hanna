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

  // Добавляем username и email в SELECT
  const { data: users, error: userError } = await supabase
    .from('hanna_users')
    .select('id, name, username, email, languages, preferred_days, preferred_time')
    .eq('is_active', true)
    .eq('role', 'student');

  if (userError) return res.status(500).json({ error: userError.message });

  // Получаем будущие сессии с новой схемой - используем participant_ids вместо user_id
  const { data: sessions, error: sessionsError } = await supabase
    .from('hanna_sessions')
    .select('id, participant_ids, session_datetime, status, type, language')
    .gte('session_datetime', new Date().toISOString());

  // Проверяем на ошибки запроса сессий
  if (sessionsError) {
    console.error('Sessions query error:', sessionsError);
    return res.status(500).json({ error: sessionsError.message });
  }

  // Убеждаемся что sessions это массив, даже если пустой
  const sessionsArray = sessions || [];
  
  const sessionsMap = {};
  for (const s of sessionsArray) {
    // Проверяем каждого участника в массиве participant_ids
    if (s.participant_ids && Array.isArray(s.participant_ids)) {
      for (const participantId of s.participant_ids) {
        if (
          !sessionsMap[participantId] ||
          sessionsMap[participantId].session_datetime > s.session_datetime
        ) {
          sessionsMap[participantId] = {
            session_datetime: s.session_datetime,
            session_id: s.id,
            status: s.status,
            type: s.type,
            language: s.language
          };
        }
      }
    }
  }

  const students = users.map((u) => {
    const session = sessionsMap[u.id] || {};
    return {
      name: u.name,
      username: u.username,
      email: u.email,
      language: session.language || Array.isArray(u.languages) ? u.languages.join(', ') : (u.languages || '—'),
      preferred_days: u.preferred_days || [],
      preferred_time: u.preferred_time || null,
      next_session: session.session_datetime ? 
        new Date(session.session_datetime).toLocaleString('ru-RU', {
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : null,
      next_session_id: session.session_id || null,
      status: session.status || null,
      type: session.type || null,
      frequency: u.preferred_days?.length || null,
    };
  });

  return res.status(200).json({ students });
}
