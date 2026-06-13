export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export interface DocumentData {
  id: string;
  userId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpreadsheetData {
  id: string;
  userId: string;
  title: string;
  data: string; // Serialized spreadsheet matrix
  createdAt: string;
  updatedAt: string;
}

export interface NoteData {
  id: string;
  userId: string;
  title: string;
  type: 'debit' | 'deposit';
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  price: number;
}

export interface InvoiceData {
  id: string;
  userId: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  items: string; // Serialized array of InvoiceItem
  totals: number;
  date: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  createdAt: string;
  updatedAt: string;
}

export interface AccountSummaryData {
  id: string;
  userId: string;
  sr: string;
  name: string;
  dept: string;
  credit: number;
  createdAt?: string;
  updatedAt?: string;
}

