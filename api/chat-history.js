// /api/chat-history.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_IDS = [618647337, 2341205];

export default async function handler(req, res) {
  const telegram_id = parseInt(req.headers["x-telegram-id"]);
  const { telegram_id: target_telegram_id } = req.query;
  
  if (!ADMIN_IDS.includes(telegram_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!target_telegram_id) {
    return res.status(400).json({ error: 'telegram_id parameter required' });
  }

  try {
    // Ищем все session_id, которые содержат указанный telegram_id
    // Паттерны session_id: hanna_user_{telegram_id}, student_{username}, lead_{telegram_id}
    let query = supabase
      .from('n8n_chat_histories')
      .select('id, session_id, message, created_at')
      .order('created_at', { ascending: false }); // Сортируем по дате, новые сначала

    // Если target_telegram_id выглядит как username (содержит буквы), ищем по паттерну student_{username}
    if (isNaN(target_telegram_id)) {
      query = query.like('session_id', `student_${target_telegram_id}%`);
    } else {
      // Если это числовой ID, ищем по всем возможным паттернам
      query = query.or(`session_id.like.hanna_user_${target_telegram_id}%,session_id.like.lead_${target_telegram_id}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Дополнительная фильтрация и обогащение данных
    let messages = data || [];

    // Добавляем метаданные для каждого сообщения
    const enrichedMessages = messages.map(msg => {
      try {
        const parsed = JSON.parse(msg.message);
        
        // Извлекаем информацию из session_id
        const sessionParts = msg.session_id.split('_');
        const agentType = sessionParts[0]; // hanna, student, lead
        const userId = sessionParts.slice(1).join('_'); // все после первого underscore
        
        return {
          ...msg,
          agent_type: agentType,
          user_id: userId,
          message_type: parsed.type || 'unknown',
          content_preview: parsed.content ? parsed.content.substring(0, 100) + '...' : 'Нет содержимого',
          parsed_message: parsed
        };
      } catch (error) {
        return {
          ...msg,
          agent_type: 'unknown',
          user_id: 'unknown',
          message_type: 'error',
          content_preview: 'Ошибка парсинга сообщения',
          parsed_message: null
        };
      }
    });

    // Группируем статистику
    const stats = {
      total_messages: enrichedMessages.length,
      unique_sessions: [...new Set(enrichedMessages.map(m => m.session_id))].length,
      agent_types: {},
      message_types: {},
      date_range: {
        earliest: enrichedMessages.length > 0 ? enrichedMessages[enrichedMessages.length - 1].created_at : null,
        latest: enrichedMessages.length > 0 ? enrichedMessages[0].created_at : null
      }
    };

    // Подсчитываем статистику
    enrichedMessages.forEach(msg => {
      stats.agent_types[msg.agent_type] = (stats.agent_types[msg.agent_type] || 0) + 1;
      stats.message_types[msg.message_type] = (stats.message_types[msg.message_type] || 0) + 1;
    });

    return res.status(200).json({ 
      messages: enrichedMessages,
      total: enrichedMessages.length,
      stats: stats,
      target_telegram_id: target_telegram_id,
      search_patterns: isNaN(target_telegram_id) 
        ? [`student_${target_telegram_id}`]
        : [`hanna_user_${target_telegram_id}`, `lead_${target_telegram_id}`]
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
