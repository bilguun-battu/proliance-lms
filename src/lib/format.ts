// Огноо, цагийг Улаанбаатарын цагаар харуулна (APP_TZ-ээр өөрчилж болно)
export const TZ = process.env.APP_TZ || 'Asia/Ulaanbaatar';
function parts(d: string | Date) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  return Object.fromEntries(f.formatToParts(new Date(d)).map(p => [p.type, p.value]));
}
const WD: Record<string, string> = { Mon: 'Да', Tue: 'Мя', Wed: 'Лх', Thu: 'Пү', Fri: 'Ба', Sat: 'Бя', Sun: 'Ня' };

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  const p = parts(d);
  return `${p.year}.${p.month}.${p.day}`;
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  const p = parts(d);
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

// Хичээлийн цаг: "2026.11.05 (Пү) 10:00"
export function fmtSession(d: string | Date) {
  const p = parts(d);
  return `${p.year}.${p.month}.${p.day} (${WD[p.weekday] ?? p.weekday}) ${p.hour}:${p.minute}`;
}

export function fmtTime(d: string | Date) {
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
}

export const CATEGORIES = [
  'Эмнэлгийн тоног төхөөрөмж',
  'Гоо сайханы бүтээгдэхүүн',
  'Ариутгал, цэвэрлэгээний бодис',
  'Аж үйлдвэрлэлийн бүтээгдэхүүн',
];

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Proliance админ',
  COORDINATOR: 'Байгууллагын хариуцагч',
  LEARNER: 'Суралцагч',
};

export const ACTION_LABEL: Record<string, string> = {
  CERTIFICATE: 'Гэрчилгээ олгогдсон', POSITION: 'Албан тушаал өөрчлөгдсөн',
  LOGIN: 'Нэвтэрсэн',
  OPEN: 'Модуль нээсэн',
  WATCH: 'Видео үзсэн',
  QUIZ: 'Тест өгсөн',
  COMPLETE: 'Модуль дуусгасан',
  PDF: 'Гарын авлага нээсэн',
  REGISTER: 'Хичээлд бүртгүүлсэн',
  UNREGISTER: 'Бүртгэл цуцалсан',
  ATTEND: 'Хичээлд ирсэн',
  ABSENT: 'Хичээлд ирээгүй',
  EXAM_START: 'Шалгалт эхэлсэн',
  EXAM: 'Шалгалт өгсөн',
  EVAL: 'Хичээлийг үнэлсэн',
  OJT_SUBMIT: 'OJT баталгаажуулалтад илгээсэн',
  VOC_REQUEST: 'VoC үнэлгээ хүссэн',
  SIGNOFF: 'Үнэлэгч баталгаажуулсан',
  NYC: 'Чадамж хангаагүй (NYC)',
  TRAINER: 'Сургагч багшийн эрх авсан',
};
