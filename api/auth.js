// 📁 api/auth.js - ИСПРАВЛЕННАЯ ВЕРСИЯ
// Серверный API для проверки статуса авторизации и базовой информации о пользователе

import { createClient } from '@supabase/supabase-js';
import { getCurrentUser } from './_auth-middleware.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // Поддерживаем только GET для проверки статуса
    if (req.method !== 'GET') {
      return res.status(405).json({ 
        error: 'Method not allowed',
        message: 'Только GET запросы поддерживаются'
      });
    }

    // Получаем текущего пользователя через middleware
    const user = await getCurrentUser(req);
    
    if (!user) {
      return res.status(401).json({
        authenticated: false,
        message: 'Пользователь не авторизован'
      });
    }

    // Возвращаем базовую информацию о пользователе
    const response = {
      authenticated: true,
      user: {
        id: user.id || user.admin_id,
        name: user.name,
        role: user.role,
        auth_method: user.auth_method,
        telegram_id: user.telegram_id || null,
        username: user.username || null,
        email: user.email || null
      },
      timestamp: new Date().toISOString()
    };

    // Для студентов добавляем дополнительную информацию
    if (user.role === 'student' && user.telegram_id) {
      try {
        // Получаем дополнительную информацию о студенте
        const { data: studentData, error: studentError } = await supabase
          .from('hanna_users')
          .select('languages, preferred_days, preferred_time, booking_mode')
          .eq('id', user.id)
          .single();

        if (!studentError && studentData) {
          response.user.languages = studentData.languages;
          response.user.preferred_days = studentData.preferred_days;
          response.user.preferred_time = studentData.preferred_time;
          response.user.booking_mode = studentData.booking_mode;
        }

        // Получаем следующее занятие
        const { data: nextSession, error: sessionError } = await supabase
          .from('hanna_sessions')
          .select('id, session_datetime, status, type, language, zoom_link, zoom_meeting_id')
          .contains('participant_ids', [user.id])
          .gte('session_datetime', new Date().toISOString())
          .in('status', ['planned', 'confirmed'])
          .order('session_datetime', { ascending: true })
          .limit(1)
          .single();

        if (!sessionError && nextSession) {
          const sessionDate = new Date(nextSession.session_datetime);
          const now = new Date();
          const canJoin = sessionDate > now && nextSession.zoom_link;
          
          response.user.next_session = {
            session_id: nextSession.id,
            date: sessionDate.toLocaleString('ru-RU', {
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
            language: nextSession.language || (studentData?.languages ? 
              (Array.isArray(studentData.languages) ? studentData.languages.join(', ') : studentData.languages) 
              : null),
            can_join: canJoin,
            zoom_link: nextSession.zoom_link,
            zoom_meeting_id: nextSession.zoom_meeting_id
          };
        }
      } catch (error) {
        console.warn('Не удалось загрузить дополнительную информацию о студенте:', error.message);
        // Не прерываем выполнение, просто логируем
      }
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Auth API error:', error);
    
    return res.status(500).json({
      authenticated: false,
      error: 'Internal server error',
      message: 'Ошибка сервера при проверке авторизации',
      details: error.message
    });
  }
}