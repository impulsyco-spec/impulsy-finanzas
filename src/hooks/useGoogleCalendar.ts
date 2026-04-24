const GOOGLE_CLIENT_ID = '628948916992-6rqj32tnl0640b6ulvvsm9rmmgrc2h50.apps.googleusercontent.com';
// Full calendar scope needed to create & manage calendars (not just events)
const SCOPE = 'https://www.googleapis.com/auth/calendar';
const TOKEN_KEY = 'impulsy_gcal_token';
const TOKEN_EXPIRY_KEY = 'impulsy_gcal_token_expiry';
const CALENDAR_ID_KEY = 'impulsy_gcal_calendar_id';
const IMPULSY_CALENDAR_NAME = 'Pagos Impulsy';

function getStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > Number(expiry)) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    return null;
  }
  return token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenClient: any = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: string) => void) | null = null;

function initTokenClient() {
  if (tokenClient) return tokenClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = (window as any).google;
  if (!g) throw new Error('Google Identity Services not loaded yet');
  tokenClient = g.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (response: any) => {
      if (response.error) {
        pendingReject?.(response.error);
        return;
      }
      const expiresAt = Date.now() + (Number(response.expires_in) - 60) * 1000;
      localStorage.setItem(TOKEN_KEY, response.access_token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
      pendingResolve?.(response.access_token);
    }
  });
  return tokenClient;
}

export async function getGCalToken(): Promise<string> {
  const stored = getStoredToken();
  if (stored) return stored;

  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = initTokenClient() as any;
      client.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      reject('Google Identity Services no está listo: ' + String(err));
    }
  });
}

export function isGCalConnected(): boolean {
  return !!getStoredToken();
}

export function disconnectGCal() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(CALENDAR_ID_KEY);
  tokenClient = null;
}

/**
 * Busca el calendario "Pagos Impulsy" en Google Calendar.
 * Si no existe, lo crea. Devuelve el calendar ID.
 */
async function getOrCreateImpulsyCalendar(token: string): Promise<string> {
  const cached = localStorage.getItem(CALENDAR_ID_KEY);
  if (cached) return cached;

  // Buscar en la lista de calendarios
  const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listData = await listRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = listData.items?.find((c: any) => c.summary === IMPULSY_CALENDAR_NAME);

  if (existing) {
    localStorage.setItem(CALENDAR_ID_KEY, existing.id);
    return existing.id;
  }

  // Crear el calendario "Pagos Impulsy"
  const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary: IMPULSY_CALENDAR_NAME,
      description: 'Calendario de cobros gestionado por Impulsy App',
      timeZone: 'America/Bogota'
    })
  });
  const created = await createRes.json();
  localStorage.setItem(CALENDAR_ID_KEY, created.id);
  return created.id;
}

export interface CalendarEventPayload {
  projectName: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  amount: number;
  date: string; // YYYY-MM-DD
}

export async function createCalendarEvent(payload: CalendarEventPayload): Promise<boolean> {
  try {
    const token = await getGCalToken();
    const calendarId = await getOrCreateImpulsyCalendar(token);
    const { projectName, clientName, clientEmail, clientPhone, amount, date } = payload;
    // For all-day events, the end date must be the next day (it's exclusive)
    const nextDayDate = new Date(date + 'T12:00:00');
    nextDayDate.setDate(nextDayDate.getDate() + 1);
    const endDate = nextDayDate.toISOString().split('T')[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event: any = {
      summary: `💰 Cobrar cuota — ${projectName}`,
      description: `👤 Cliente: ${clientName}\n📱 Teléfono: ${clientPhone || 'No registrado'}\n📂 Proyecto: ${projectName}\n💵 Monto: $${amount.toLocaleString()} COP\n\n(Vía Impulsy)`,
      start: { date },
      end: { date: endDate },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 1440 },
          { method: 'popup', minutes: 60 },
        ],
      },
    };

    if (clientEmail) {
      event.attendees = [{ email: clientEmail }];
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );
    return res.ok;
  } catch (_err) {
    return false;
  }
}

export async function createCalendarEvents(payloads: CalendarEventPayload[]): Promise<number> {
  let created = 0;
  for (const payload of payloads) {
    const ok = await createCalendarEvent(payload);
    if (ok) created++;
  }
  return created;
}
