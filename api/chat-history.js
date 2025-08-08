// /api/chat-history.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_IDS = [618647337, 2341205];

export default async function handler(req, res) {
  const telegram_id = parseInt(req.headers["x-telegram-id"]);
  const { memory_key, date, agent_type, user_filter } = req.query;
  
  if (!ADMIN_IDS.includes(telegram_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!memory_key && !agent_type) {
    return res.status(400).json({ error: 'memory_key or agent_type required' });
  }

  try {
    let query = supabase
      .from('n8n_chat_histories_rows')
      .select('id, session_id, message, created_at')
      .order('id', { ascending: true });

    // Если передан конкретный memory_key, ищем по нему
    if (memory_key) {
      query = query.eq('session_id', memory_key);
    } else {
      // Иначе строим фильтр по типу агента
      if (agent_type === 'hanna_user') {
        // Для TutorBot ищем все session_id, начинающиеся с 'hanna_user_'
        if (date) {
          // Если указана дата, фильтруем по ней
          query = query.like('session_id', `hanna_user_%`);
          // Дополнительно можем фильтровать по created_at, если нужно
          const startOfDay = new Date(date);
          const endOfDay = new Date(date);
          endOfDay.setDate(endOfDay.getDate() + 1);
          
          query = query
            .gte('created_at', startOfDay.toISOString())
            .lt('created_at', endOfDay.toISOString());
        } else {
          query = query.like('session_id', `hanna_user_%`);
        }
      } else if (agent_type === 'student') {
        // Для Student Agent ищем session_id, начинающиеся с 'student_'
        if (user_filter) {
          query = query.eq('session_id', `student_${user_filter}`);
        } else {
          query = query.like('session_id', `student_%`);
        }
      } else if (agent_type === 'lead') {
        // Для Lead Agent ищем session_id, начинающиеся с 'lead_'
        if (user_filter) {
          query = query.eq('session_id', `lead_${user_filter}`);
        } else {
          query = query.like('session_id', `lead_%`);
        }
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Дополнительная фильтрация и обогащение данных
    let messages = data || [];

    // Если это TutorBot и указана дата, дополнительно фильтруем в памяти
    if (agent_type === 'hanna_user' && date) {
      messages = messages.filter(msg => {
        if (!msg.created_at) return false;
        const msgDate = new Date(msg.created_at).toISOString().split('T')[0];
        return msgDate === date;
      });
    }

    // Добавляем метаданные для каждого сообщения
    const enrichedMessages = messages.map(msg => {
      try {
        const parsed = JSON.parse(msg.message);
        
        // Извлекаем дополнительную информацию из session_id
        const sessionParts = msg.session_id.split('_');
        const agentType = sessionParts[0];
        const userId = sessionParts[1];
        
        return {
          ...msg,
          agent_type: agentType,
          user_id: userId,
          message_type: parsed.type,
          content_preview: parsed.content ? parsed.content.substring(0, 100) + '...' : 'Нет содержимого'
        };
      } catch (error) {
        return {
          ...msg,
          agent_type: 'unknown',
          user_id: 'unknown',
          message_type: 'error',
          content_preview: 'Ошибка парсинга сообщения'
        };
      }
    });

    return res.status(200).json({ 
      messages: enrichedMessages,
      total: enrichedMessages.length,
      filters: {
        memory_key,
        agent_type,
        date,
        user_filter
      }
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
