// /api/chat-history.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_IDS = [618647337, 2341205];

export default async function handler(req, res) {
  const telegram_id = parseInt(req.headers["x-telegram-id"]);
  const { telegram_id: target_telegram_id, memory_key, date, agent_type, user_filter } = req.query;
  
  if (!ADMIN_IDS.includes(telegram_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    // Новая логика: фильтрация по telegram_id
    if (target_telegram_id) {
      return await handleTelegramIdFilter(req, res, target_telegram_id);
    }
    
    // Старая логика для обратной совместимости
    if (!memory_key && !agent_type) {
      return res.status(400).json({ error: 'telegram_id, memory_key или agent_type required' });
    }

    let query = supabase
      .from('n8n_chat_histories')
      .select('id, session_id, message')
      .order('id', { ascending: true });

    // Если передан конкретный memory_key, ищем по нему
    if (memory_key) {
      query = query.eq('session_id', memory_key);
    } else {
      // Иначе строим фильтр по типу агента
      if (agent_type === 'hanna_user') {
        query = query.like('session_id', `hanna_user_%`);
      } else if (agent_type === 'student') {
        if (user_filter) {
          query = query.eq('session_id', `student_${user_filter}`);
        } else {
          query = query.like('session_id', `student_%`);
        }
      } else if (agent_type === 'lead') {
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

    // Добавляем метаданные для каждого сообщения
    const enrichedMessages = (data || []).map(msg => {
      try {
        const parsed = JSON.parse(msg.message);
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
      filters: { memory_key, agent_type, date, user_filter }
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleTelegramIdFilter(req, res, target_telegram_id) {
  try {
    console.log('Загружаем чаты для telegram_id:', target_telegram_id);
    
    // Получаем информацию о пользователе
    let userInfo = null;
    
    // Сначала проверяем в студентах
    const { data: studentData } = await supabase
      .from('hanna_users')
      .select('name, username, email, telegram_id')
      .eq('telegram_id', target_telegram_id)
      .single();
    
    if (studentData) {
      userInfo = studentData;
    } else {
      // Если не студент, возможно админ
      const adminNames = {
        618647337: 'Анна (админ)',
        2341205: 'Марина (админ)'
      };
      
      userInfo = {
        name: adminNames[target_telegram_id] || 'Неизвестный пользователь',
        telegram_id: parseInt(target_telegram_id),
        username: target_telegram_id == 618647337 ? 'admin1' : target_telegram_id == 2341205 ? 'admin2' : null
      };
    }

    // Загружаем все сообщения, связанные с этим telegram_id
    // Используем только колонки, которые точно существуют в таблице
    const { data: messages, error } = await supabase
      .from('n8n_chat_histories')
      .select('id, session_id, message')
      .or(`session_id.like.hanna_user_${target_telegram_id}%,session_id.like.student_${target_telegram_id}%,session_id.like.lead_${target_telegram_id}%,session_id.like.calendar_${target_telegram_id}%`)
      .order('id', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Если нет прямых совпадений, попробуем найти по session_id с содержимым telegram_id
    let additionalMessages = [];
    if (!messages || messages.length === 0) {
      console.log('Ищем дополнительные сообщения в метаданных...');
      
      const { data: allMessages } = await supabase
        .from('n8n_chat_histories')
        .select('id, session_id, message')
        .order('id', { ascending: false })
        .limit(1000); // Ограничиваем поиск последними 1000 сообщениями
      
      if (allMessages) {
        additionalMessages = allMessages.filter(msg => {
          try {
            // JSONB поле может быть уже объектом, не нужно парсить
            const parsed = typeof msg.message === 'string' ? JSON.parse(msg.message) : msg.message;
            // Ищем telegram_id в метаданных сообщения
            const metadata = parsed.metadata || {};
            return metadata.telegram_id == target_telegram_id || 
                   metadata.chatId == target_telegram_id ||
                   metadata.userId == target_telegram_id;
          } catch (error) {
            return false;
          }
        });
      }
    }

    const allMessages = [...(messages || []), ...additionalMessages];
    
    // Убираем дубликаты по id
    const uniqueMessages = allMessages.filter((msg, index, self) => 
      index === self.findIndex(m => m.id === msg.id)
    );

    // Добавляем искусственное время создания на основе ID (чем больше ID, тем новее)
    const messagesWithTime = uniqueMessages.map(msg => ({
      ...msg,
      created_at: new Date(Date.now() - (Math.max(...uniqueMessages.map(m => m.id)) - msg.id) * 1000).toISOString()
    }));

    console.log(`Найдено ${messagesWithTime.length} сообщений для telegram_id ${target_telegram_id}`);

    return res.status(200).json({ 
      messages: messagesWithTime,
      user_info: userInfo,
      total: messagesWithTime.length,
      telegram_id: target_telegram_id
    });

  } catch (error) {
    console.error('Error in handleTelegramIdFilter:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
