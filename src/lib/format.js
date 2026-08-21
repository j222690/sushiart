/**
 * Dinheiro no app inteiro é INTEGER em centavos.
 * Nunca faça contas com o número formatado — só formate na hora de exibir.
 */

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const formatBRL = (cents) => brl.format((Number(cents) || 0) / 100);

/** "12,90" -> 1290. Aceita "R$ 12,90", "12.90" e "1290" com vírgula ausente. */
export function parseBRLToCents(input) {
  if (input === null || input === undefined || input === '') return 0;
  if (typeof input === 'number') return Math.round(input * 100);

  const clean = String(input)
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '') // separador de milhar
    .replace(',', '.');

  const value = Number.parseFloat(clean);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** Centavos -> "12,90" para preencher inputs de formulário. */
export const centsToInput = (cents) =>
  cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ',');

export const formatPhone = (raw) => {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
};

export const formatZip = (raw) =>
  String(raw || '')
    .replace(/\D/g, '')
    .slice(0, 8)
    .replace(/(\d{5})(\d{0,3})/, '$1-$2')
    .replace(/-$/, '');

const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const formatDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '');
export const formatTime = (iso) => (iso ? timeFmt.format(new Date(iso)) : '');

export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

/** "18:30:00" -> "18:30" */
export const shortHour = (t) => String(t || '').slice(0, 5);

export const WEEKDAYS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

/** Parcelas viáveis: nenhuma parcela abaixo do mínimo do gateway. */
export function installmentOptions(totalCents, maxInstallments = 3, minInstallmentCents = 2000) {
  const options = [];
  for (let n = 1; n <= maxInstallments; n += 1) {
    const part = Math.floor(totalCents / n);
    if (n > 1 && part < minInstallmentCents) break;
    options.push({ n, partCents: part, label: `${n}x de ${formatBRL(part)} sem juros` });
  }
  return options;
}
