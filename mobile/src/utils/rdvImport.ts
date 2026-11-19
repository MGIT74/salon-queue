// Import de RDV (CSV) — COPIE de la lecture du web (dashboard.html :
// parseRdvCsv, _parseCsvText, RDV_HEADER_ALIASES, _plainKey, _barberKey,
// _parseRdvDate, _groupRdv). Correspondance coiffeurs / prestations :
// seulement quand le nom correspond EXACTEMENT, sinon c'est l'équipe qui choisit.

export type ParsedRow = {
  line: number; date: string; time: string; barber: string; name: string; email: string;
  phone: string; service: string; status: string; note: string; site: string;
};
export type ParsedCsv = { rows: ParsedRow[]; badDate: number; missing: string[]; totalRows: number };

const ALIASES: Record<string, string[]> = {
  date: ['daterendezvous', 'date', 'datederendezvous', 'daterdv', 'datedebut', 'debut', 'start', 'datetime'],
  barber: ['equipe', 'coiffeur', 'staff', 'employe', 'team', 'barber', 'intervenant'],
  name: ['nomclient', 'nom', 'name', 'client', 'customername', 'nomduclient'],
  phone: ['telephoneclient', 'telephone', 'tel', 'phone', 'mobile', 'portable'],
  email: ['emailclient', 'email', 'mail', 'courriel'],
  service: ['service', 'prestation'],
  status: ['statut', 'status', 'etat'],
  note: ['notes', 'note', 'commentaire', 'commentaires'],
  site: ['site', 'salon', 'lieu', 'location'],
};

export function plainKey(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function barberKey(s: string): string {
  return plainKey(String(s || '').replace(/\((tous|all)\)/gi, ''));
}

function parseCsvText(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) { row.push(cur.trim()); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim()); cur = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur.trim());
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}

function parseDate(str: string): { date: string; time: string } | null {
  str = String(str || '').trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `0${m[4]}`.slice(-2) + ':' + m[5] };
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T,]*(\d{1,2})[:h](\d{2})/);
  if (m) return { date: `${m[3]}-${`0${m[2]}`.slice(-2)}-${`0${m[1]}`.slice(-2)}`, time: `0${m[4]}`.slice(-2) + ':' + m[5] };
  return null;
}

export function parseRdvCsv(text: string): ParsedCsv {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r\n|\r|\n/)[0] || '';
  let delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  if ((first.match(/\t/g) || []).length > (first.match(/[;,]/g) || []).length) delim = '\t';
  const rows = parseCsvText(text, delim);
  const out: ParsedCsv = { rows: [], badDate: 0, missing: [], totalRows: 0 };
  if (rows.length < 2) { out.missing = ['date', 'name', 'service', 'barber']; return out; }
  const col: Record<string, number> = {};
  rows[0].forEach((h, i) => {
    const norm = plainKey(h).replace(/ /g, '');
    Object.keys(ALIASES).forEach((f) => { if (col[f] === undefined && ALIASES[f].includes(norm)) col[f] = i; });
  });
  ['date', 'name', 'service', 'barber'].forEach((f) => { if (col[f] === undefined) out.missing.push(f); });
  if (out.missing.length) return out;
  const cell = (row: string[], f: string) => (col[f] !== undefined ? (row[col[f]] || '').trim() : '');
  rows.slice(1).forEach((row, i) => {
    out.totalRows++;
    const d = parseDate(cell(row, 'date'));
    if (!d) { out.badDate++; return; }
    out.rows.push({
      line: i + 2, date: d.date, time: d.time, barber: cell(row, 'barber'), name: cell(row, 'name'), email: cell(row, 'email'),
      phone: cell(row, 'phone'), service: cell(row, 'service'), status: cell(row, 'status') || '—', note: cell(row, 'note'), site: cell(row, 'site'),
    });
  });
  return out;
}

export type ImportGroup = { key: string; labels: string[]; count: number; choice: string };

/** Regroupe les valeurs du fichier ; propose l'élément de l'app seulement si le nom correspond exactement. */
export function groupRows(rows: ParsedRow[], field: 'barber' | 'service', candidates: { id: string; name: string }[]): ImportGroup[] {
  const keyFn = field === 'barber' ? barberKey : plainKey;
  const groups: Record<string, ImportGroup> = {};
  const order: string[] = [];
  rows.forEach((r) => {
    const k = keyFn(r[field]);
    if (!groups[k]) { groups[k] = { key: k, labels: [], count: 0, choice: '' }; order.push(k); }
    const label = r[field] || '(vide)';
    if (!groups[k].labels.includes(label)) groups[k].labels.push(label);
    groups[k].count++;
  });
  return order.map((k) => {
    const g = groups[k];
    const exact = candidates.filter((c) => keyFn(c.name) === k);
    if (exact.length === 1) g.choice = String(exact[0].id);
    return g;
  });
}
