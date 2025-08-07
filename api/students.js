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

  // Получаем всех активных студентов
  const { data: users, error: userError } = await supabase
    .from('hanna_users')
    .select('id, name, username, email, languages, preferred_days, preferred_time')
    .eq('is_active', true)
    .eq('role', 'student');

  if (userError) return res.status(500).json({ error: userError.message });

  // Получаем все будущие сессии
  const { data: sessions, error: sessionsError } = await supabase
    .from('hanna_sessions')
    .select('id, participant_ids, session_date, status, type, language')
    .gte('session_date', new Date().toISOString().slice(0, 10))
    .order('session_date', { ascending: true });

  // Проверяем на ошибки и null/undefined
  if (sessionsError) {
    console.error('Sessions query error:', sessionsError);
    return res.status(500).json({ error: sessionsError.message });
  }

  // Обеспечиваем, что sessions всегда массив
  const sessionsArray = sessions || [];
  
  // Создаем карту ближайших сессий для каждого пользователя
  const sessionsMap = {};
  
  for (const session of sessionsArray) {
    if (session.participant_ids && Array.isArray(session.participant_ids)) {
      for (const userId of session.participant_ids) {
        // Для каждого участника находим ближайшую сессию
        if (!sessionsMap[userId] || sessionsMap[userId].session_date > session.session_date) {
          sessionsMap[userId] = {
            session_date: session.session_date,
            session_id: session.id,
            status: session.status,
            type: session.type,
            language: session.language
          };
        }
      }
    }
  }

  // Обеспечиваем, что users всегда массив
  const usersArray = users || [];

  const students = usersArray.map((u) => {
    const session = sessionsMap[u.id] || {};
    return {
      name: u.name,
      username: u.username,
      email: u.email,
      language: Array.isArray(u.languages) ? u.languages.join(', ') : (u.languages || '—'),
      preferred_days: u.preferred_days || [],
      preferred_time: u.preferred_time || null,
      next_session: session.session_date || null,
      next_session_id: session.session_id || null,
      status: session.status || null,
      type: session.type || null,
      session_language: session.language || null,
      frequency: u.preferred_days?.length || null,
    };
  });

  return res.status(200).json({ students });
}
