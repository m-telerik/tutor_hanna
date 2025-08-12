// 📁 /api/student-lessons.js
import { createClient } from '@supabase/supabase-js';
import { authenticate } from './_auth-middleware.js';
import { 
  SESSION_STATUS, 
  enrichSessionData, 
  validateUUID,
  getTimeUntil,
  getRelativeTime 
} from './_session-helpers.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Универсальная проверка авторизации (Telegram или браузер)
    const user = await authenticate(req, res, ['admin', 'tutor', 'student']);
    if (!user) return; // Ошибка уже отправлена в authenticate()

    console.log('✅ Student Lessons API - авторизован:', user.name, '- роль:', user.role, '- метод:', user.auth_method);

    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const user_id = searchParams.get('user_id');
    const status_filter = searchParams.get('status') || 'all'; // all, upcoming, completed, cancelled
    const limit = parseInt(searchParams.get('limit')) || 50;

    // Определяем, чьи занятия загружать
    let targetUserId = user_id;
    
    if (user.role === 'student') {
      // Студенты могут видеть только свои занятия
      if (user.auth_method === 'telegram') {
        targetUserId = user.id;
      } else {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'Студенты могут просматривать только свои занятия'
        });
      }
    } else if (user.role === 'tutor') {
      // Тьюторы могут видеть занятия своих студентов
      if (!targetUserId) {
        return res.status(400).json({ 
          error: 'Missing user_id',
          message: 'Укажите ID студента для просмотра занятий'
        });
      }
      // Валидируем UUID
      try {
        validateUUID(targetUserId, 'user_id');
      } catch (error) {
        return res.status(400).json({ 
          error: 'Invalid user_id',
          message: error.message
        });
      }
    } else if (user.role === 'admin') {
      // Админы могут видеть все занятия
      if (!targetUserId) {
        return res.status(400).json({ 
          error: 'Missing user_id',
          message: 'Укажите ID студента для просмотра занятий'
        });
      }
      // Валидируем UUID
      try {
        validateUUID(targetUserId, 'user_id');
      } catch (error) {
        return res.status(400).json({ 
          error: 'Invalid user_id',
          message: error.message
        });
      }
    }

    // Строим запрос к базе данных
    let query = supabase
      .from('hanna_sessions')
      .select(`
        id,
        session_datetime,
        duration_minutes,
        status,
        type,
        language,
        zoom_link,
        zoom_meeting_id,
        notes,
        participant_ids,
        google_event_id,
        session_type,
        created_at,
        updated_at,
        created_by,
        tutor_id
      `)
      .contains('participant_ids', [targetUserId])
      .order('session_datetime', { ascending: false })
      .limit(limit);

    // Применяем фильтры по статусу
    const now = new Date().toISOString();
    
    if (status_filter === 'upcoming') {
      query = query
        .gte('session_datetime', now)
        .in('status', [SESSION_STATUS.PLANNED, SESSION_STATUS.CONFIRMED]);
    } else if (status_filter === 'completed') {
      query = query
        .eq('status', SESSION_STATUS.COMPLETED);
    } else if (status_filter === 'cancelled') {
      query = query
        .eq('status', SESSION_STATUS.CANCELLED);
    } else if (status_filter === 'past') {
      query = query
        .lt('session_datetime', now);
    }

    const { data: sessions, error: sessionsError } = await query;

    if (sessionsError) {
      console.error('Database error:', sessionsError);
      return res.status(500).json({ error: sessionsError.message });
    }

    // Получаем информацию о студенте для контекста
    const { data: studentInfo } = await supabase
      .from('hanna_users')
      .select('id, name, username, email, languages')
      .eq('id', targetUserId)
      .single();

    // Обогащаем данные занятий
    const enrichedLessons = sessions.map(session => enrichSessionData(session, studentInfo));notes,
        created_by: session.created_by,
        tutor_id: session.tutor_id,
        is_upcoming: isUpcoming,
        is_past: isPast,
        can_join: isUpcoming && session.zoom_link && 
                  ['planned', 'confirmed'].includes(session.status),
        student_name: studentInfo?.name || 'Неизвестный студент',
        student_username: studentInfo?.username,
        time_until: isUpcoming ? getTimeUntil(sessionDate) : null,
        relative_time: getRelativeTime(sessionDate)
      };
    });

    // Группируем по статусу для удобства
    const upcomingLessons = enrichedLessons.filter(l => l.is_upcoming && l.status !== SESSION_STATUS.CANCELLED);
    const pastLessons = enrichedLessons.filter(l => l.is_past);
    const cancelledLessons = enrichedLessons.filter(l => l.status === SESSION_STATUS.CANCELLED);

    const response = {
      lessons: enrichedLessons,
      grouped: {
        upcoming: upcomingLessons,
        past: pastLessons,
        cancelled: cancelledLessons
      },
      stats: {
        total: enrichedLessons.length,
        upcoming: upcomingLessons.length,
        past: pastLessons.length,
        cancelled: cancelledLessons.length,
        completed: enrichedLessons.filter(l => l.status === SESSION_STATUS.COMPLETED).length
      },
      student_info: studentInfo,
      requester: {
        name: user.name,
        role: user.role,
        auth_method: user.auth_method
      },
      filters_applied: {
        user_id: targetUserId,
        status_filter,
        limit
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Unexpected error in student-lessons API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Произошла ошибка при загрузке занятий'
    });
  }
}

/**
 * Получить время до занятия в удобном формате
 */
function getTimeUntil(sessionDate) {
  const now = new Date();
  const diff = sessionDate - now;
  
  if (diff <= 0) return null;
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `через ${days} дн.`;
  } else if (hours > 0) {
    return `через ${hours} ч.`;
  } else if (minutes > 0) {
    return `через ${minutes} мин.`;
  } else {
    return 'сейчас';
  }
}

/**
 * Получить относительное время (сегодня, вчера, завтра и т.д.)
 */
function getRelativeTime(sessionDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
  
  const diffDays = Math.floor((sessionDay - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Завтра';
  if (diffDays === -1) return 'Вчера';
  if (diffDays > 1 && diffDays <= 7) return `Через ${diffDays} дня`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} дня назад`;
  
  return sessionDate.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short'
  });
}
