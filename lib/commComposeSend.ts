/**
 * Parent notification compose/send — aligned with bissfest_tool CommunicationStepper.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAudienceChildIds } from '@/lib/commResolveAudience';

export type MsgType = 'email' | 'messenger' | 'notice_board' | 'print';
export type Channel = 'push' | 'email' | 'in_app';

export type ComposeDraft = {
  type: MsgType | null;
  notifyByEmail: boolean;
  notifyByPush: boolean;
  title: string;
  subtitle: string;
  body: string;
  pollEnabled: boolean;
  pollQuestion: string;
  pollMultipleChoice: boolean;
  pollOptions: string[];
  audienceIds: string[];
  sendToChild: boolean;
  sendToParent: boolean;
  sendToGuardian: boolean;
  sendAtISO: string | undefined;
  reminders: number[];
  stickyTill: string;
  hideAfter: string;
};

export function getWebAppOrigin(): string {
  const o = process.env.EXPO_PUBLIC_WEB_APP_ORIGIN || 'https://tool.tilda.schule';
  return o.replace(/\/$/, '');
}

export async function triggerCommSend(messageId: string, isLockedAudience: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${getWebAppOrigin()}/api/trigger/send-comm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, isLockedAudience }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function linkAudiences(supabase: SupabaseClient, messageId: string, audienceIds: string[]) {
  if (!audienceIds.length) return;
  const rows = audienceIds.map((aid) => ({
    message_id: messageId,
    audience_id: aid,
  }));
  await supabase.from('comm_message_audiences').insert(rows);
}

async function audit(
  supabase: SupabaseClient,
  facilityId: string,
  actorUserId: string | null,
  action: string,
  messageId?: string,
  meta?: Record<string, unknown>
) {
  await supabase.from('comm_audit').insert({
    facility_id: facilityId,
    message_id: messageId || null,
    actor_user_id: actorUserId || null,
    action,
    meta: meta || {},
  });
}

async function maybeCreatePoll(supabase: SupabaseClient, messageId: string, data: ComposeDraft) {
  const pollPayloads: Array<{ question: string; multipleChoice: boolean; options: string[] }> =
    data.pollEnabled && data.pollQuestion?.trim()
      ? [
          {
            question: data.pollQuestion.trim(),
            multipleChoice: Boolean(data.pollMultipleChoice),
            options: (data.pollOptions || []).map((s) => String(s).trim()).filter(Boolean),
          },
        ]
      : [];
  if (!pollPayloads.length) return;
  for (const poll of pollPayloads) {
    const { data: pollRow, error: pollErr } = await supabase
      .from('comm_polls')
      .insert({
        message_id: messageId,
        question: poll.question,
        multiple_choice: poll.multipleChoice,
      })
      .select('id')
      .single();
    if (pollErr || !pollRow?.id) continue;
    if (poll.options.length) {
      const options = poll.options.map((label, idx) => ({
        poll_id: pollRow.id,
        label,
        position: idx,
      }));
      await supabase.from('comm_poll_options').insert(options);
    }
  }
}

async function expandToRoleRecipients(
  supabase: SupabaseClient,
  childIds: string[],
  data: ComposeDraft
): Promise<string[]> {
  const union = new Set<string>();
  if (data.sendToChild) childIds.forEach((id) => union.add(id));
  if (data.sendToParent) {
    const { data: parents } = await supabase.from('users').select('id, manager_id').in('id', childIds);
    (parents || []).forEach((u: any) => {
      if (u.manager_id) union.add(u.manager_id);
    });
  }
  if (data.sendToGuardian) {
    const { data: guardians } = await supabase
      .from('users')
      .select('id, related_children')
      .contains('related_children', childIds as any);
    (guardians || []).forEach((g: any) => union.add(g.id));
  }
  return Array.from(union);
}

async function createRecipients(
  supabase: SupabaseClient,
  messageId: string,
  childIds: string[],
  ctx: {
    facilityId: string;
    effectiveAcademicYear: number;
    data: ComposeDraft;
    lockedAudienceId?: string | null;
  }
) {
  const { facilityId, effectiveAcademicYear, data, lockedAudienceId } = ctx;
  if (!childIds.length || !facilityId || !effectiveAcademicYear) return;

  const { data: existingRecs } = await supabase
    .from('comm_recipients')
    .select('child_user_id, channel')
    .eq('message_id', messageId);

  const existingKeys = new Set<string>();
  (existingRecs || []).forEach((r: any) => {
    existingKeys.add(`${r.child_user_id}:${r.channel}`);
  });

  const channels: Channel[] = [];
  if (data.type === 'email') {
    channels.push('email');
  } else {
    if (data.notifyByPush) channels.push('push');
    if (data.notifyByEmail) channels.push('email');
  }

  const rows: any[] = [];

  if (lockedAudienceId) {
    childIds.forEach((userId) => {
      channels.forEach((ch) => {
        const key = `${userId}:${ch}`;
        if (!existingKeys.has(key)) {
          rows.push({
            message_id: messageId,
            child_user_id: userId,
            facility_id: facilityId,
            academic_year: effectiveAcademicYear,
            guardian_email: null,
            guardian_phone: null,
            channel: ch,
            status: 'queued',
          });
        }
      });
    });
  } else {
    const childSet = new Set<string>();
    const parentSet = new Set<string>();
    const guardianSet = new Set<string>();

    if (data.sendToChild) childIds.forEach((id) => childSet.add(id));

    if (data.sendToParent) {
      const { data: parents } = await supabase.from('users').select('id, manager_id').in('id', childIds);
      (parents || []).forEach((u: any) => {
        if (u.manager_id) parentSet.add(u.manager_id);
      });
    }

    if (data.sendToGuardian) {
      const { data: guardians } = await supabase
        .from('users')
        .select('id, related_children')
        .contains('related_children', childIds as any);
      (guardians || []).forEach((g: any) => guardianSet.add(g.id));
    }

    const addChannelRows = (userId: string) => {
      channels.forEach((ch) => {
        const key = `${userId}:${ch}`;
        if (!existingKeys.has(key)) {
          rows.push({
            message_id: messageId,
            child_user_id: userId,
            facility_id: facilityId,
            academic_year: effectiveAcademicYear,
            guardian_email: null,
            guardian_phone: null,
            channel: ch,
            status: 'queued',
          });
        }
      });
    };

    childSet.forEach(addChannelRows);
    parentSet.forEach(addChannelRows);
    guardianSet.forEach(addChannelRows);
  }

  if (rows.length === 0) return;
  const chunkSize = 800;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await supabase.from('comm_recipients').insert(chunk);
  }
}

function bodyAsHtml(body: string): string {
  const t = body.trim();
  if (!t) return '';
  if (t.includes('<') && t.includes('>')) return t;
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${esc.replace(/\n/g, '<br/>')}</p>`;
}

export async function saveDraftMessage(
  supabase: SupabaseClient,
  ctx: {
    facilityId: string;
    academicYear: number | null;
    createdByUserId: string;
    data: ComposeDraft;
    lockedAudienceId?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { facilityId, academicYear, createdByUserId, data, lockedAudienceId } = ctx;
  if (!data.type) return { ok: false, error: 'Typ fehlt' };
  const effectiveAcademicYear = academicYear;
  try {
    const htmlBody = bodyAsHtml(data.body);
    const { data: msg, error } = await supabase
      .from('comm_messages')
      .insert({
        facility_id: facilityId,
        academic_year: effectiveAcademicYear || null,
        type: data.type,
        status: 'draft',
        title:
          (data.title && data.title.trim()) ||
          (data.subtitle && data.subtitle.trim()) ||
          htmlBody.replace(/<[^>]*>/g, ' ').trim().slice(0, 80) ||
          null,
        subtitle: data.subtitle || null,
        body: htmlBody || null,
        allow_push: !!data.notifyByPush,
        allow_email: !!data.notifyByEmail || data.type === 'email',
        allow_inapp: false,
        created_by: createdByUserId,
        sticky_till: data.stickyTill?.trim() ? data.stickyTill : null,
        hide_after: data.hideAfter?.trim() ? data.hideAfter : null,
      })
      .select('id')
      .single();
    if (error) throw error;
    const messageId = msg.id as string;
    const aids = lockedAudienceId ? [lockedAudienceId] : data.audienceIds;
    await linkAudiences(supabase, messageId, aids);
    await audit(supabase, facilityId, createdByUserId, 'draft_created', messageId);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Entwurf fehlgeschlagen' };
  }
}

export async function scheduleMessage(
  supabase: SupabaseClient,
  ctx: {
    facilityId: string;
    academicYear: number | null;
    createdByUserId: string;
    data: ComposeDraft;
    lockedAudienceId?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { facilityId, academicYear, createdByUserId, data, lockedAudienceId } = ctx;
  if (!data.sendAtISO) return { ok: false, error: 'Zeitpunkt fehlt' };
  if (!data.type) return { ok: false, error: 'Typ fehlt' };
  const effectiveAcademicYear = academicYear;
  if (!effectiveAcademicYear) return { ok: false, error: 'Schuljahr fehlt' };
  if (data.type === 'print') {
    return { ok: false, error: 'Druck-Nachrichten können nicht geplant werden.' };
  }

  try {
    const htmlBody = bodyAsHtml(data.body);
    const { data: msg, error } = await supabase
      .from('comm_messages')
      .insert({
        facility_id: facilityId,
        academic_year: effectiveAcademicYear || null,
        type: data.type,
        status: 'scheduled',
        title:
          (data.title && data.title.trim()) ||
          (data.subtitle && data.subtitle.trim()) ||
          htmlBody.replace(/<[^>]*>/g, ' ').trim().slice(0, 80) ||
          null,
        subtitle: data.subtitle || null,
        body: htmlBody || null,
        allow_push: !!data.notifyByPush,
        allow_email: !!data.notifyByEmail || data.type === 'email',
        allow_inapp: false,
        created_by: createdByUserId,
        sticky_till: data.stickyTill?.trim() ? data.stickyTill : null,
        hide_after: data.hideAfter?.trim() ? data.hideAfter : null,
      })
      .select('id')
      .single();
    if (error) throw error;
    const messageId = msg.id as string;
    const aids = lockedAudienceId ? [lockedAudienceId] : data.audienceIds;
    await linkAudiences(supabase, messageId, aids);
    await maybeCreatePoll(supabase, messageId, data);
    const childIds = await resolveAudienceChildIds(supabase, {
      facilityId,
      effectiveAcademicYear,
      audienceIds: aids,
      lockedAudienceId: lockedAudienceId || null,
    });
    await createRecipients(supabase, messageId, childIds, {
      facilityId,
      effectiveAcademicYear,
      data,
      lockedAudienceId: lockedAudienceId || null,
    });
    const sendAtUtc = new Date(data.sendAtISO).toISOString();
    await supabase.from('comm_schedules').insert({
      message_id: messageId,
      send_at: sendAtUtc,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (data.type !== 'email' && data.reminders?.length) {
      const rems = data.reminders.map((d, i) => ({
        message_id: messageId,
        delay_days: d,
        position: i + 1,
      }));
      await supabase.from('comm_reminders').insert(rems);
    }
    await audit(supabase, facilityId, createdByUserId, 'scheduled', messageId);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Planen fehlgeschlagen' };
  }
}

export async function sendMessageNow(
  supabase: SupabaseClient,
  ctx: {
    facilityId: string;
    academicYear: number | null;
    createdByUserId: string;
    data: ComposeDraft;
    lockedAudienceId?: string | null;
  }
): Promise<{
  ok: boolean;
  error?: string;
  needsMessengerOnly?: boolean;
  printDownloadUrl?: string | null;
}> {
  const { facilityId, academicYear, createdByUserId, data, lockedAudienceId } = ctx;
  if (!data.type) return { ok: false, error: 'Typ fehlt' };
  const effectiveAcademicYear = academicYear;
  if (!effectiveAcademicYear) return { ok: false, error: 'Schuljahr fehlt' };

  try {
    const htmlBody = bodyAsHtml(data.body);
    const { data: msg, error } = await supabase
      .from('comm_messages')
      .insert({
        facility_id: facilityId,
        academic_year: effectiveAcademicYear || null,
        type: data.type,
        status: 'sending',
        title:
          (data.title && data.title.trim()) ||
          (data.subtitle && data.subtitle.trim()) ||
          htmlBody.replace(/<[^>]*>/g, ' ').trim().slice(0, 80) ||
          null,
        subtitle: data.subtitle || null,
        body: htmlBody || null,
        allow_push: !!data.notifyByPush,
        allow_email: !!data.notifyByEmail || data.type === 'email',
        allow_inapp: false,
        created_by: createdByUserId,
        sticky_till: data.stickyTill?.trim() ? data.stickyTill : null,
        hide_after: data.hideAfter?.trim() ? data.hideAfter : null,
      })
      .select('id')
      .single();
    if (error) throw error;
    const messageId = msg.id as string;
    const aids = lockedAudienceId ? [lockedAudienceId] : data.audienceIds;
    await linkAudiences(supabase, messageId, aids);
    await maybeCreatePoll(supabase, messageId, data);

    if (data.type === 'print') {
      await audit(supabase, facilityId, createdByUserId, 'print_generate_started', messageId);
      const origin = getWebAppOrigin();
      const startRes = await fetch(`${origin}/api/trigger/generate-print-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      if (!startRes.ok) {
        const t = await startRes.text().catch(() => '');
        throw new Error(`Druck-Job konnte nicht gestartet werden (${startRes.status}) ${t}`);
      }
      const startJson = (await startRes.json()) as { runId?: string; error?: string };
      const runId = startJson?.runId;
      if (!runId) throw new Error('Keine runId für Druck-Generierung erhalten');

      let downloadUrl: string | null = null;
      for (let i = 0; i < 300; i++) {
        const pollRes = await fetch(
          `${origin}/api/trigger/generate-print-zip?runId=${encodeURIComponent(runId)}`
        );
        if (!pollRes.ok) throw new Error('Statusabfrage für Druck fehlgeschlagen');
        const pollJson = (await pollRes.json()) as {
          status?: string;
          downloadUrl?: string | null;
          error?: string;
        };
        if (pollJson?.status === 'COMPLETED') {
          downloadUrl = pollJson?.downloadUrl ?? null;
          break;
        }
        if (
          pollJson?.status === 'FAILED' ||
          pollJson?.status === 'CRASHED' ||
          pollJson?.status === 'CANCELED'
        ) {
          throw new Error(pollJson?.error || 'Druck-Generierung fehlgeschlagen');
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!downloadUrl) {
        throw new Error('Druck-Archiv wurde ohne Download-Link erzeugt oder ist leer.');
      }
      await supabase.from('comm_messages').update({ status: 'sent' }).eq('id', messageId);
      await audit(supabase, facilityId, createdByUserId, 'print_generated', messageId);
      return { ok: true, printDownloadUrl: downloadUrl };
    }

    const channelsForThisMessage: Channel[] = [];
    if (data.type === 'email') {
      channelsForThisMessage.push('email');
    } else {
      if (data.notifyByPush) channelsForThisMessage.push('push');
      if (data.notifyByEmail) channelsForThisMessage.push('email');
    }

    const childIds = await resolveAudienceChildIds(supabase, {
      facilityId,
      effectiveAcademicYear,
      audienceIds: aids,
      lockedAudienceId: lockedAudienceId || null,
    });

    if (data.type === 'messenger' && channelsForThisMessage.length === 0) {
      const recipientIds = await expandToRoleRecipients(supabase, childIds, data);
      for (const userId of recipientIds) {
        let existingThreadId: string | null = null;
        const { data: existing } = await supabase
          .from('msg_thread_participants')
          .select('thread_id, user_id, msg_threads!inner(id, facility_id)')
          .in('user_id', [createdByUserId, userId])
          .eq('msg_threads.facility_id', facilityId);
        if (existing && existing.length) {
          const byThread = new Map<string, Set<string>>();
          (existing as any[]).forEach((row: any) => {
            const t = String(row.thread_id);
            if (!byThread.has(t)) byThread.set(t, new Set<string>());
            byThread.get(t)!.add(String(row.user_id));
          });
          for (const [tid, users] of byThread) {
            if (users.has(String(createdByUserId)) && users.has(String(userId))) {
              existingThreadId = tid;
              break;
            }
          }
        }
        if (!existingThreadId) {
          const { data: thread, error: threadErr } = await supabase
            .from('msg_threads')
            .insert([{ facility_id: facilityId, scope: 'direct', created_by: createdByUserId }])
            .select('id')
            .single();
          if (!threadErr && thread?.id) {
            existingThreadId = thread.id;
            await supabase.from('msg_thread_participants').insert([
              { thread_id: existingThreadId, user_id: createdByUserId },
              { thread_id: existingThreadId, user_id: userId },
            ]);
          }
        }
        if (existingThreadId) {
          await supabase.from('msg_thread_messages').insert([
            {
              thread_id: existingThreadId,
              sender_id: createdByUserId,
              body: htmlBody || '',
            },
          ]);
        }
      }
      await supabase.from('comm_messages').update({ status: 'sent' }).eq('id', messageId);
      await audit(supabase, facilityId, createdByUserId, 'send_now', messageId);
      return { ok: true, needsMessengerOnly: true };
    }

    await createRecipients(supabase, messageId, childIds, {
      facilityId,
      effectiveAcademicYear,
      data,
      lockedAudienceId: lockedAudienceId || null,
    });

    if (
      !data.sendAtISO &&
      (data.type === 'notice_board' || data.type === 'messenger') &&
      Array.isArray(data.reminders) &&
      data.reminders.length > 0
    ) {
      try {
        const sendAtUtc = new Date().toISOString();
        await supabase.from('comm_schedules').insert({
          message_id: messageId,
          send_at: sendAtUtc,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        const rems = data.reminders.map((d, i) => ({
          message_id: messageId,
          delay_days: d,
          position: i + 1,
        }));
        await supabase.from('comm_reminders').insert(rems);
      } catch (e) {
        console.error('reminders', e);
      }
    }

    await audit(supabase, facilityId, createdByUserId, 'send_now', messageId);
    await new Promise((r) => setTimeout(r, 100));

    const triggered = await triggerCommSend(messageId, Boolean(lockedAudienceId));
    if (!triggered) {
      console.warn('trigger send-comm failed; message may stay in sending');
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Senden fehlgeschlagen' };
  }
}
