// /api/recurring-schedules.js
import { createClient } from '@supabase/supabase-js';
import { authenticate } from './_auth-middleware.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // Проверка авторизации - только для тьюторов и админов
    const user = await authenticate(req, res, ['admin', 'tutor']);
    if (!user) return;

    console.log('✅ Recurring Schedules API - авторизован:', user.name, '- роль:', user.role);

    if (req.method === 'GET') {
      return await handleGetRequest(req, res, user);
    }

    if (req.method === 'POST') {
      return await handlePostRequest(req, res, user);
    }

    if (req.method === 'PUT') {
      return await handlePutRequest(req, res, user);
    }

    if (req.method === 'DELETE') {
      return await handleDeleteRequest(req, res, user);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Unexpected error in recurring-schedules API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGetRequest(req, res, requestingUser) {
  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const includeInactive = searchParams.get('include_inactive') === 'true';

  let query = supabase
    .from('view_recurring_schedules_detailed')
    .select('*')
    .order('day_of_week', { ascending: true })
    .order('time_start', { ascending: true });

  // Фильтрация по тьютору для роли tutor
  if (requestingUser.role === 'tutor') {
    query = query.eq('tutor_id', requestingUser.id);
  }

  // Показывать неактивные только по запросу
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Database error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ 
    schedules: data || [],
    requester: {
      name: requestingUser.name,
      role: requestingUser.role,
      auth_method: requestingUser.auth_method
    }
  });
}

// Заглушки для других методов (реализуем позже)
async function handlePostRequest(req, res, user) {
  return res.status(501).json({ error: 'Create functionality not implemented yet' });
}

async function handlePutRequest(req, res, user) {
  return res.status(501).json({ error: 'Update functionality not implemented yet' });
}

async function handleDeleteRequest(req, res, user) {
  return res.status(501).json({ error: 'Delete functionality not implemented yet' });
}
