// 📁 /api/vocab.js
import { createClient } from '@supabase/supabase-js';
import { authenticate } from './_auth-middleware.js';
import getRawBody from 'raw-body';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // Универсальная проверка авторизации (Telegram или браузер)
    const user = await authenticate(req, res, ['admin', 'tutor', 'student']);
    if (!user) return; // Ошибка уже отправлена в authenticate()

    console.log('✅ Vocab API - авторизован:', user.name, '- роль:', user.role, '- метод:', user.auth_method);

    if (req.method === 'GET') {
      return await handleGetRequest(req, res, user);
    }

    if (req.method === 'POST') {
      return await handlePostRequest(req, res, user);
    }

    if (req.method === 'PUT') {
      return await handlePutRequest(req, res, user);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Unexpected error in vocab API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGetRequest(req, res, requestingUser) {
  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const session_id = searchParams.get('session_id');
  const user_name = searchParams.get('user_name');
  const user_id = searchParams.get('user_id');

  let query = supabase
    .from('hanna_vocab')
    .select(`
      id,
      word,
      translation,
      example,
      created_at,
      language,
      studied_count,
      last_studied_at,
      session_id,
      user_id,
      hanna_users!inner(name, telegram_id)
    `)
    .order('created_at', { ascending: false });

  // Ограничения доступа по ролям
  if (requestingUser.role === 'student') {
    // Студенты видят только свой словарь
    if (requestingUser.auth_method === 'telegram') {
      query = query.eq('user_id', requestingUser.id);
    } else {
      // Для браузерной авторизации студентов нужно найти по имени
      if (user_name) {
        query = query.eq('hanna_users.name', user_name);
      } else {
        return res.status(400).json({ 
          error: 'Missing user identification',
          message: 'Для браузерной авторизации требуется параметр user_name'
        });
      }
    }
  } else if (requestingUser.role === 'tutor') {
    // Тьюторы видят словари своих студентов
    // В будущем можно добавить связь tutor_id
    // query = query.eq('hanna_users.tutor_id', requestingUser.id);
  }
  // Админы видят все

  // Фильтрация по параметрам
  if (session_id) {
    query = query.eq('session_id', session_id);
  }
  
  if (user_name && requestingUser.role !== 'student') {
    query = query.eq('hanna_users.name', user_name);
  }
  
  if (user_id) {
    query = query.eq('user_id', user_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Database error:', error);
    return res.status(500).json({ error: error.message });
  }

  // Преобразуем данные для совместимости
  const words = data.map(w => ({
    id: w.id,
    word: w.word,
    translation: w.translation,
    example: w.example,
    created_at: w.created_at,
    language: w.language,
    studied_count: w.studied_count || 0,
    last_studied_at: w.last_studied_at,
    session_id: w.session_id,
    user_id: w.user_id,
    user_name: w.hanna_users?.name,
    session_date: w.created_at // Добавляем для совместимости
  }));

  return res.status(200).json({ 
    words,
    requester: {
      name: requestingUser.name,
      role: requestingUser.role,
      auth_method: requestingUser.auth_method
    }
  });
}

async function handlePostRequest(req, res, requestingUser) {
  const rawBody = await getRawBody(req);
  const body = JSON.parse(rawBody.toString());
  
  const { word, translation, example, session_id, user_id, language } = body;
  
  if (!word || (!session_id && !user_id)) {
    return res.status(400).json({ error: 'Missing required fields: word and (session_id or user_id)' });
  }

  // Проверяем права на добавление слов
  if (requestingUser.role === 'student') {
    // Студенты могут добавлять слова только себе
    if (requestingUser.auth_method === 'telegram') {
      if (user_id && user_id !== requestingUser.id) {
        return res.status(403).json({ error: 'Students can only add words to their own vocabulary' });
      }
    } else {
      // Для браузерной авторизации ограничиваем доступ
      return res.status(403).json({ 
        error: 'Browser students cannot add words',
        message: 'Добавление слов доступно только через Telegram бот'
      });
    }
  }

  // Если передан session_id, но нет user_id, получаем user_id из сессии
  let finalUserId = user_id;
  if (!finalUserId && session_id) {
    const { data: sessionData } = await supabase
      .from('hanna_sessions')
      .select('participant_ids')
      .eq('id', session_id)
      .single();
    
    if (sessionData?.participant_ids?.length > 0) {
      finalUserId = sessionData.participant_ids[0];
    }
  }

  // Если студент и не указан user_id, используем его собственный ID
  if (!finalUserId && requestingUser.role === 'student' && requestingUser.auth_method === 'telegram') {
    finalUserId = requestingUser.id;
  }

  if (!finalUserId) {
    return res.status(400).json({ error: 'Cannot determine user_id' });
  }

  const { error } = await supabase.from('hanna_vocab').insert({
    word,
    translation,
    example,
    session_id,
    user_id: finalUserId,
    language
  });

  if (error) {
    console.error('Insert error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ 
    success: true,
    added_by: {
      name: requestingUser.name,
      role: requestingUser.role
    }
  });
}

async function handlePutRequest(req, res, requestingUser) {
  const rawBody = await getRawBody(req);
  const body = JSON.parse(rawBody.toString());
  
  const { id, studied } = body;
  
  if (!id) {
    return res.status(400).json({ error: 'Missing word id' });
  }

  // Проверяем права на обновление
  if (requestingUser.role === 'student') {
    // Студенты могут обновлять только свои слова
    if (requestingUser.auth_method === 'telegram') {
      const { data: wordData } = await supabase
        .from('hanna_vocab')
        .select('user_id')
        .eq('id', id)
        .single();
      
      if (!wordData || wordData.user_id !== requestingUser.id) {
        return res.status(403).json({ error: 'Students can only update their own words' });
      }
    } else {
      // Для браузерной авторизации ограничиваем доступ
      return res.status(403).json({ 
        error: 'Browser students cannot update words',
        message: 'Обновление слов доступно только через Telegram бот'
      });
    }
  }

  const updateData = {};
  if (studied) {
    // Увеличиваем счетчик изучения
    const { data: currentWord } = await supabase
      .from('hanna_vocab')
      .select('studied_count')
      .eq('id', id)
      .single();
    
    updateData.studied_count = (currentWord?.studied_count || 0) + 1;
    updateData.last_studied_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('hanna_vocab')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('Update error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ 
    success: true,
    updated_by: {
      name: requestingUser.name,
      role: requestingUser.role
    }
  });
}
