import { ensureToken, SCOPES } from '../auth/google';

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return 'Unknown error'; }
}

async function authorizedFetch(url, options = {}, scopes = []) {
  const token = await ensureToken(scopes);
  const headers = options.headers ? { ...options.headers } : {};
  headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = typeof payload === 'string' ? payload : payload?.error?.message || JSON.stringify(payload);
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }

  return payload;
}

export async function listCalendarEvents({ timeMin = null, timeMax = null, maxResults = 10 } = {}) {
  const params = new URLSearchParams({
    calendarId: 'primary',
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(Math.max(1, Math.min(Number(maxResults) || 10, 2500))),
  });
  if (timeMin) params.set('timeMin', new Date(timeMin).toISOString());
  if (timeMax) params.set('timeMax', new Date(timeMax).toISOString());
  return authorizedFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {}, SCOPES.calendar);
}

export async function createCalendarEvent({ summary, description = '', startISO, endISO, timeZone }) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (!summary?.trim()) throw new Error('Event title is required.');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('Please provide valid start and end times.');
  if (end <= start) throw new Error('End time must be after start time.');

  const body = {
    summary: summary.trim(),
    description,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
  };
  return authorizedFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body: JSON.stringify(body) }, SCOPES.calendar);
}

function base64UrlEncode(str) {
  const utf8 = new TextEncoder().encode(str);
  let binary = '';
  utf8.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function listGmailMessages({ maxResults = 10, query = '' } = {}) {
  const params = new URLSearchParams({ maxResults: String(Math.max(1, Math.min(Number(maxResults) || 10, 100))) });
  if (query?.trim()) params.set('q', query.trim());
  const list = await authorizedFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {}, SCOPES.gmail);
  const items = Array.isArray(list?.messages) ? list.messages : [];

  return Promise.all(items.map(async message => {
    try {
      const data = await authorizedFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}`, {}, SCOPES.gmail);
      const headers = Array.isArray(data?.payload?.headers) ? data.payload.headers : [];
      const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '(no subject)';
      const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
      return { id: message.id, subject, from, snippet: data?.snippet || '', internalDate: data?.internalDate };
    } catch (error) {
      return { id: message.id, subject: '(error loading)', from: '', snippet: errorMessage(error) };
    }
  }));
}

export async function sendGmail({ to, subject, body }) {
  if (!to?.trim() || !subject?.trim() || !body?.trim()) throw new Error('Recipient, subject, and body are required.');
  const raw = `To: ${to.trim()}\r\nSubject: ${subject.trim()}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`;
  return authorizedFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw: base64UrlEncode(raw) }) }, SCOPES.gmail);
}

export async function listTasks({ tasklist = '@default', maxResults = 20 } = {}) {
  const params = new URLSearchParams({ maxResults: String(Math.max(1, Math.min(Number(maxResults) || 20, 100))) });
  return authorizedFetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklist)}/tasks?${params.toString()}`, {}, SCOPES.tasks);
}

export async function insertTask({ tasklist = '@default', title, notes = '' } = {}) {
  if (!title?.trim()) throw new Error('Task title is required.');
  return authorizedFetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklist)}/tasks`, { method: 'POST', body: JSON.stringify({ title: title.trim(), notes }) }, SCOPES.tasks);
}
