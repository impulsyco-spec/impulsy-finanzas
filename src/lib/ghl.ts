export interface GHLPayload {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  projectName: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
}

export async function sendGHLWebhook(payloads: GHLPayload[]) {
  // Integromat / Make.com Webhook URL (Bridge to GoHighLevel)
  const webhookUrl = import.meta.env.VITE_GHL_WEBHOOK_URL || 'https://hook.us2.make.com/sk8bfok8fe8ywmja3ytjq2s2zucjo3lo';
  
  if (!webhookUrl) {
    console.warn('No VITE_GHL_WEBHOOK_URL configured.');
    return;
  }

  // Enviar un webhook individual por cada pago/cuota
  for (const payload of payloads) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error('Error enviando a GHL:', err);
    }
  }
}
