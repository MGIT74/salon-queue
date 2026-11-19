// Exports des rendez-vous — COPIE de exportRdvCsv / exportRdvPdf du web
// (dashboard.html) : mêmes colonnes, même protection contre les formules
// dans le CSV. Sur téléphone : fichier écrit dans le cache puis feuille de
// partage iOS / Android (Enregistrer dans Fichiers, Mail, AirDrop…).
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { AdminAppointment } from '../types/api';

const STATUS_LABEL: Record<string, string> = { confirmed: 'Confirmé', completed: 'Terminé', no_show: 'Absent', cancelled: 'Annulé' };

function csvCell(v: unknown): string {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s) && !/^\+?[\d\s().\-]+$/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function esc(v: unknown): string {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function when(a: AdminAppointment): string {
  const d = String(a.scheduled_at);
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('fr-FR') + ' ' + d.slice(11, 16);
}

function row(a: AdminAppointment): unknown[] {
  const st = a.display_status ?? 'confirmed';
  return [a.client_name, a.email || '', a.phone || '', a.service_name || '', a.barber_name || 'Premier disponible', when(a), STATUS_LABEL[st] || st];
}

const HEADER = ['Nom', 'Email', 'Téléphone', 'Prestation', 'Coiffeur', 'Date', 'Statut'];

async function share(uri: string, mimeType: string, uti: string, title: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de fichiers n\'est pas disponible sur cet appareil.');
  await Sharing.shareAsync(uri, { mimeType, UTI: uti, dialogTitle: title });
}

export async function exportRdvCsv(rows: AdminAppointment[], todayYmd: string): Promise<void> {
  const lines = [HEADER.join(';'), ...rows.map((a) => row(a).map(csvCell).join(';'))];
  const file = new File(Paths.cache, `rendez-vous-${todayYmd}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write('﻿' + lines.join('\r\n'));
  await share(file.uri, 'text/csv', 'public.comma-separated-values-text', 'Rendez-vous (CSV)');
}

export async function exportRdvPdf(rows: AdminAppointment[], title: string): Promise<void> {
  const html =
    '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:-apple-system,Arial,sans-serif;padding:24px;color:#111}' +
    'h1{font-size:18px;margin-bottom:16px}' +
    'table{width:100%;border-collapse:collapse;font-size:12.5px}' +
    'th,td{border-bottom:1px solid #ddd;padding:8px 10px;text-align:left}' +
    'th{background:#f2f2f2}' +
    '</style></head><body>' +
    `<h1>${esc(title)}</h1>` +
    '<table><thead><tr>' + HEADER.map((h) => `<th>${h}</th>`).join('') + '</tr></thead><tbody>' +
    rows.map((a) => '<tr>' + row(a).map((v) => `<td>${esc(v)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table></body></html>';
  const { uri } = await Print.printToFileAsync({ html });
  await share(uri, 'application/pdf', 'com.adobe.pdf', 'Rendez-vous (PDF)');
}
