import { formatINR } from "../money";

export type Language = "en" | "te";
export type Tone = "friendly" | "professional" | "firm";

export interface ReminderInput {
  language: Language;
  tone: Tone;
  clientName: string;
  invoiceNumber: string;
  remainingPaise: number;
  dueDate: string;
  promisedDate: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 'YYYY-MM-DD' -> '24 Nov 2026', using UTC arithmetic only. */
export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

/** Indian digit grouping for a rupee amount, e.g. 45000 -> "45,000". */
export function formatIndianNumber(rupees: number): string {
  const negative = rupees < 0;
  const cents = Math.round(Math.abs(rupees) * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  let s = String(whole);
  if (s.length > 3) {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    s = `${rest},${last3}`;
  }
  if (frac > 0) s += `.${String(frac).padStart(2, "0")}`;
  return negative ? `-${s}` : s;
}

function englishReminder(input: ReminderInput): string {
  const { tone, clientName, invoiceNumber, remainingPaise, dueDate, promisedDate } = input;
  const amount = formatINR(remainingPaise);
  const due = formatDisplayDate(dueDate);
  const promised = promisedDate ? formatDisplayDate(promisedDate) : null;

  switch (tone) {
    case "friendly":
      if (promised === null) {
        return `Hi ${clientName}, just following up on invoice ${invoiceNumber} for ${amount}. The due date is ${due}. Could you please confirm the payment timeline? Thank you.`;
      }
      return `Hi ${clientName}, just following up on invoice ${invoiceNumber} for ${amount}. The due date is ${due} and the expected payment date is ${promised}. Could you please confirm the payment timeline? Thank you.`;
    case "professional":
      return `Hello ${clientName}, this is a reminder regarding invoice ${invoiceNumber} for ${amount}, due on ${due}${promised ? `, with a promised payment date of ${promised}` : ""}. Please share the expected payment date at your earliest convenience. Thank you.`;
    case "firm":
      return `Dear ${clientName}, invoice ${invoiceNumber} for ${amount} (due ${due}) remains unpaid${promised ? `, and the promised date of ${promised} is pending` : ""}. Please confirm when payment will be made. Thank you.`;
  }
}

function teluguReminder(input: ReminderInput): string {
  const { tone, clientName, invoiceNumber, remainingPaise } = input;
  const amount = formatIndianNumber(remainingPaise / 100);

  if (tone === "firm") {
    return `నమస్కారం ${clientName} గారు, ${invoiceNumber} ఇన్వాయిస్‌కు సంబంధించి ₹${amount} చెల్లింపు ఇంకా పెండింగ్‌లో ఉంది. దయచేసి చెల్లింపు ఎప్పుడు చేయగలరో తెలియజేయండి. ధన్యవాదాలు.`;
  }
  return `నమస్కారం ${clientName} గారు, ${invoiceNumber} ఇన్వాయిస్‌కు సంబంధించి ₹${amount} బాకీగా ఉంది. చెల్లింపు గురించి ఒకసారి అప్డేట్ ఇవ్వగలరా? ధన్యవాదాలు.`;
}

/** Pure reminder text generator. Does not send anything. */
export function generateReminder(input: ReminderInput): string {
  return input.language === "te" ? teluguReminder(input) : englishReminder(input);
}
