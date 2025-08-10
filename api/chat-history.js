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
      .select('id, session_id, message, created_at')
      .order('id', { ascending: true });

    // Если передан конкретный memory_key, ищем по нему
    if (memory_key) {
      query = query.eq('session_id', memory_key);
    } else {
      // Иначе строим фильтр по типу агента
      if (agent_type === 'hanna_user') {
        if (date) {
          query = query.like('session_id', `hanna_user_%`);
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

    // Дополнительная фильтрация и обогащение данных
    let messages = data || [];

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
        2341205: 'Админ 2'
      };
      
      userInfo = {
        name: adminNames[target_telegram_id] || 'Неизвестный пользователь',
        telegram_id: target_telegram_id,
        username: target_telegram_id == 618647337 ? 'admin1' : 'unknown'
      };
    }

    // Загружаем все сообщения, связанные с этим telegram_id
    const { data: messages, error } = await supabase
      .from('n8n_chat_histories')
      .select('id, session_id, message, created_at')
      .or(`session_id.like.hanna_user_${target_telegram_id}%,session_id.like.student_${target_telegram_id}%,session_id.like.lead_${target_telegram_id}%,session_id.like.calendar_${target_telegram_id}%`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Если нет прямых совпадений, попробуем найти по session_id с содержимым telegram_id
    let additionalMessages = [];
    if (!messages || messages.length === 0) {
      console.log('Ищем дополнительные сообщения...');
      
      const { data: allMessages } = await supabase
        .from('n8n_chat_histories')
        .select('id, session_id, message, created_at')
        .order('created_at', { ascending: false })
        .limit(1000); // Ограничиваем поиск последними 1000 сообщениями
      
      if (allMessages) {
        additionalMessages = allMessages.filter(msg => {
          try {
            const parsed = JSON.parse(msg.message);
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

    console.log(`Найдено ${uniqueMessages.length} сообщений для telegram_id ${target_telegram_id}`);

    return res.status(200).json({ 
      messages: uniqueMessages,
      user_info: userInfo,
      total: uniqueMessages.length,
      telegram_id: target_telegram_id
    });

  } catch (error) {
    console.error('Error in handleTelegramIdFilter:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
