// 📁 /api/user-role.js
import { createClient } from '@supabase/supabase-js';
import { getCurrentUser } from './_auth-middleware.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const telegram_id = parseInt(req.headers["x-telegram-id"]);
  const admin_token = req.headers["x-admin-token"];
  const admin_id = req.headers["x-admin-id"];
  
  // Если это браузерная авторизация
  if (admin_token && admin_id) {
    return await handleBrowserAuth(req, res, admin_token, admin_id);
  }
  
  // Если это Telegram авторизация
  if (telegram_id) {
    return await handleTelegramAuth(req, res, telegram_id);
  }

  return res.status(400).json({ error: 'Missing authorization data' });
}

async function handleBrowserAuth(req, res, admin_token, admin_id) {
  try {
    // Используем универсальную систему авторизации
    const user = await getCurrentUser(req);
    
    if (!user) {
      return res.status(403).json({ 
        error: 'Invalid browser session',
        message: 'Недействительная браузерная сессия'
      });
    }

    // Возвращаем данные браузерного пользователя
    const response = {
      role: user.role,
      name: user.name,
      admin_id: user.admin_id,
      auth_method: user.auth_method,
      is_active: true
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Browser auth error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleTelegramAuth(req, res, telegram_id) {
  try {
    // Ищем пользователя в базе данных
    const { data: user, error: userError } = await supabase
      .from('hanna_users')
      .select('id, name, languages, role, is_active, preferred_days, preferred_time, telegram_id, username, email')
      .eq('telegram_id', telegram_id)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('Database error:', userError);
      return res.status(500).json({ error: userError.message });
    }

    // Если пользователь найден в базе
    if (user) {
      // Проверяем активность для студентов
      if (user.role === 'student' && !user.is_active) {
        return res.status(200).json({ 
          role: 'prospect',
          telegram_id,
          name: user.name,
          reason: 'inactive_student'
        });
      }

      // Для активных пользователей возвращаем полную информацию
      const response = {
        role: user.role,
        telegram_id,
        name: user.name,
        username: user.username,
        email: user.email,
        languages: user.languages,
        is_active: user.is_active,
        auth_method: 'telegram'
      };

      // Для студентов добавляем информацию о предпочтениях и следующем занятии
      if (user.role === 'student') {
        response.preferred_days = user.preferred_days;
        response.preferred_time = user.preferred_time;

        // Получаем следующее занятие
        const { data: nextSession } = await supabase
          .from('hanna_sessions')
          .select('id, session_datetime, status, type, participant_ids')
          .contains('participant_ids', [user.id])
          .gte('session_datetime', new Date().toISOString())
          .order('session_datetime', { ascending: true })
          .limit(1)
          .single();

        if (nextSession) {
          response.next_session = {
            session_id: nextSession.id,
            date: new Date(nextSession.session_datetime).toLocaleString('ru-RU', {
              timeZone: 'Asia/Bangkok',
              year: 'numeric',
              month: '2-digit', 
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            }),
            datetime: nextSession.session_datetime,
            status: nextSession.status,
            type: nextSession.type,
            language: Array.isArray(user.languages) ? user.languages.join(', ') : user.languages
          };
        }
      }

      return res.status(200).json(response);
    }

    // Если пользователь не найден - это потенциальный клиент
    return res.status(200).json({ 
      role: 'prospect',
      telegram_id,
      reason: 'not_found'
    });

  } catch (error) {
    console.error('Telegram auth error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
