// 📁 api/vocab.js - ИСПРАВЛЕННАЯ ВЕРСИЯ

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
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Произошла ошибка при работе со словарем',
      details: error.message
    });
  }
}

async function handleGetRequest(req, res, requestingUser) {
  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const session_id = searchParams.get('session_id');
  const user_id = searchParams.get('user_id');

  // Определяем целевой user_id
  let targetUserId = user_id;
  
  if (requestingUser.role === 'student') {
    // Студенты видят только свой словарь
    if (requestingUser.auth_method === 'telegram') {
      targetUserId = requestingUser.id;
    } else {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Доступ к словарю возможен только через Telegram'
      });
    }
  } else if (requestingUser.role === 'tutor') {
    // Тьюторы должны указать user_id
    if (!targetUserId) {
      return res.status(400).json({
        error: 'Missing user_id',
        message: 'Укажите ID студента для просмотра словаря'
      });
    }
  } else if (requestingUser.role === 'admin') {
    // Админы должны указать user_id или session_id
    if (!targetUserId && !session_id) {
      return res.status(400).json({
        error: 'Missing user_id or session_id',
        message: 'Укажите ID студента или ID сессии'
      });
    }
  }

  try {
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
        user_id
      `)
      .order('created_at', { ascending: false });

    // Применяем фильтры
    if (session_id) {
      query = query.eq('session_id', session_id);
    }
    
    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ 
        error: error.message,
        details: 'Ошибка загрузки словаря из базы данных'
      });
    }

    // Если нет данных и это конкретный студент
    if (!data || data.length === 0) {
      if (targetUserId && requestingUser.role === 'student') {
        // Проверяем, существует ли студент
        const { data: studentExists } = await supabase
          .from('hanna_users')
          .select('id, name')
          .eq('id', targetUserId)
          .eq('role', 'student')
          .single();

        if (!studentExists) {
          return res.status(404).json({
            error: 'Student not found',
            message: 'Студент не найден в системе'
          });
        }
      }
    }

    // Преобразуем данные для совместимости
    const words = (data || []).map(w => ({
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
      session_date: w.created_at // Добавляем для совместимости
    }));

    return res.status(200).json({ 
      words,
      requester: {
        name: requestingUser.name,
        role: requestingUser.role,
        auth_method: requestingUser.auth_method
      },
      total: words.length,
      filters: {
        session_id,
        user_id: targetUserId
      }
    });

  } catch (error) {
    console.error('Error in handleGetRequest:', error);
    return res.status(500).json({
      error: 'Database query failed',
      message: 'Ошибка при выполнении запроса к базе данных',
      details: error.message
    });
  }
}

async function handlePostRequest(req, res, requestingUser) {
  try {
    const rawBody = await getRawBody(req);
    const body = JSON.parse(rawBody.toString());
    
    const { word, translation, example, session_id, user_id, language } = body;
    
    if (!word || (!session_id && !user_id)) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Укажите слово и ID сессии или студента'
      });
    }

    // Проверяем права на добавление слов
    if (requestingUser.role === 'student') {
      // Студенты могут добавлять слова только себе
      if (requestingUser.auth_method === 'telegram') {
        if (user_id && user_id !== requestingUser.id) {
          return res.status(403).json({ 
            error: 'Access denied',
            message: 'Студенты могут добавлять слова только в свой словарь'
          });
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
      return res.status(400).json({ 
        error: 'Cannot determine user_id',
        message: 'Не удалось определить ID студента'
      });
    }

    // Проверяем, не существует ли уже такое слово у студента
    const { data: existingWord } = await supabase
      .from('hanna_vocab')
      .select('id')
      .eq('user_id', finalUserId)
      .eq('word', word.toLowerCase().trim())
      .single();

    if (existingWord) {
      return res.status(409).json({
        error: 'Word already exists',
        message: 'Это слово уже есть в словаре'
      });
    }

    const { error } = await supabase.from('hanna_vocab').insert({
      word: word.trim(),
      translation: translation?.trim() || null,
      example: example?.trim() || null,
      session_id: session_id || null,
      user_id: finalUserId,
      language: language || null,
      studied_count: 0,
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error('Insert error:', error);
      return res.status(500).json({ 
        error: error.message,
        details: 'Ошибка при добавлении слова в базу данных'
      });
    }

    return res.status(201).json({ 
      success: true,
      message: 'Слово успешно добавлено в словарь',
      added_by: {
        name: requestingUser.name,
        role: requestingUser.role
      }
    });

  } catch (error) {
    console.error('Error in handlePostRequest:', error);
    return res.status(500).json({
      error: 'Failed to add word',
      message: 'Ошибка при добавлении слова',
      details: error.message
    });
  }
}

async function handlePutRequest(req, res, requestingUser) {
  try {
    const rawBody = await getRawBody(req);
    const body = JSON.parse(rawBody.toString());
    
    const { id, studied } = body;
    
    if (!id) {
      return res.status(400).json({ 
        error: 'Missing word id',
        message: 'Укажите ID слова для обновления'
      });
    }

    // Получаем информацию о слове
    const { data: wordData, error: wordError } = await supabase
      .from('hanna_vocab')
      .select('user_id, studied_count')
      .eq('id', id)
      .single();

    if (wordError || !wordData) {
      return res.status(404).json({
        error: 'Word not found',
        message: 'Слово не найдено в словаре'
      });
    }

    // Проверяем права на обновление
    if (requestingUser.role === 'student') {
      // Студенты могут обновлять только свои слова
      if (requestingUser.auth_method === 'telegram') {
        if (wordData.user_id !== requestingUser.id) {
          return res.status(403).json({ 
            error: 'Access denied',
            message: 'Студенты могут обновлять только свои слова'
          });
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
      updateData.studied_count = (wordData.studied_count || 0) + 1;
      updateData.last_studied_at = new Date().toISOString();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
        message: 'Не указаны данные для обновления'
      });
    }

    const { error } = await supabase
      .from('hanna_vocab')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Update error:', error);
      return res.status(500).json({ 
        error: error.message,
        details: 'Ошибка при обновлении слова в базе данных'
      });
    }

    return res.status(200).json({ 
      success: true,
      message: studied ? 'Слово отмечено как изученное' : 'Слово обновлено',
      updated_by: {
        name: requestingUser.name,
        role: requestingUser.role
      }
    });

  } catch (error) {
    console.error('Error in handlePutRequest:', error);
    return res.status(500).json({
      error: 'Failed to update word',
      message: 'Ошибка при обновлении слова',
      details: error.message
    });
  }
}