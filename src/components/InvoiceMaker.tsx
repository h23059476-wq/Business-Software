import React, { useState, useEffect, useRef } from 'react';
import { 
  Receipt, Plus, Trash2, Calendar, FileText, User, Mail, DollarSign,
  Download, Printer, PlusCircle, Trash, CheckCircle2, RefreshCw, AlertCircle, Eye, FileDown,
  FolderOpen
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { 
  db, handleFirestoreError, OperationType,
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot
} from '../lib/firebase.ts';
import { InvoiceData, InvoiceItem } from '../types.ts';
import PdfPreviewModal from './PdfPreviewModal.tsx';

interface InvoiceMakerProps {
  userId: string;
  onSelectContentForAi?: (text: string) => void;
  activeInvoiceId?: string | null;
  initialAdoptedText?: string | null;
  clearAdoptedText?: () => void;
}

export default function InvoiceMaker({ 
  userId, 
  onSelectContentForAi,
  activeInvoiceId,
  initialAdoptedText,
  clearAdoptedText
}: InvoiceMakerProps) {
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [invoiceListOpen, setInvoiceListOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

  // Active Invoice Form Fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'draft' | 'sent' | 'paid' | 'overdue'>('draft');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [taxRate, setTaxRate] = useState<number>(10); // Standard 10% tax default
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // AI items suggestions queue state
  const [aiInvoiceItems, setAiInvoiceItems] = useState<InvoiceItem[]>([]);

  useEffect(() => {
    if (!initialAdoptedText) {
      setAiInvoiceItems([]);
      return;
    }

    try {
      const rx = /\[INVOICE_ITEM:\s*description="([^"]+)"\s*price="([^"]+)"\s*quantity="([^"]+)"\]/g;
      let match;
      const parsedItems: InvoiceItem[] = [];
      
      while ((match = rx.exec(initialAdoptedText)) !== null) {
        const desc = match[1];
        const priceNum = parseFloat(match[2]) || 0;
        const qtyNum = parseInt(match[3], 10) || 1;
        
        parsedItems.push({
          description: desc,
          price: priceNum,
          quantity: qtyNum
        });
      }

      setAiInvoiceItems(parsedItems);
    } catch (err) {
      console.error("Failed to parse invoice items from AI text draft", err);
    }
  }, [initialAdoptedText]);

  const handleApplyAiInvoiceItems = () => {
    if (!activeInvoice || aiInvoiceItems.length === 0) return;

    const nextItems = [...items, ...aiInvoiceItems];
    setItems(nextItems);
    
    // Save changes
    triggerDebouncedSave({
      items: JSON.stringify(nextItems)
    });

    window.dispatchEvent(new CustomEvent('app-notification', {
      detail: {
        title: 'Billing Items Synced',
        message: `Successfully appended ${aiInvoiceItems.length} billing items.`,
        type: 'success'
      }
    }));

    setAiInvoiceItems([]);
    if (clearAdoptedText) clearAdoptedText();
  };

  // Read list from Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'invoices'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const invoicesData: InvoiceData[] = [];
      snapshot.forEach((docSnap) => {
        invoicesData.push({ id: docSnap.id, ...docSnap.data() } as InvoiceData);
      });
      // Sort newest created first
      invoicesData.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      setInvoices(invoicesData);

      if (invoicesData.length > 0 && !activeInvoice) {
        setActiveInvoice(invoicesData[0]);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore loading error in Invoices: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Sync selected invoice if activeInvoiceId changes from command palette
  useEffect(() => {
    if (activeInvoiceId && invoices.length > 0) {
      const targetInvoice = invoices.find(inv => inv.id === activeInvoiceId);
      if (targetInvoice) {
        setActiveInvoice(targetInvoice);
      }
    }
  }, [activeInvoiceId, invoices]);

  // Load active invoice to forms
  useEffect(() => {
    if (activeInvoice) {
      setInvoiceNumber(activeInvoice.invoiceNumber);
      setClientName(activeInvoice.clientName);
      setClientEmail(activeInvoice.clientEmail);
      setDate(activeInvoice.date);
      setDueDate(activeInvoice.dueDate);
      setStatus(activeInvoice.status);
      try {
        setItems(JSON.parse(activeInvoice.items));
      } catch (e) {
        setItems([]);
      }
    } else {
      setInvoiceNumber('');
      setClientName('');
      setClientEmail('');
      setDate('');
      setDueDate('');
      setStatus('draft');
      setItems([]);
    }
  }, [activeInvoice?.id]);

  // Debounced save
  const triggerDebouncedSave = (updatedData: Partial<InvoiceData>) => {
    if (!activeInvoice) return;
    setSaveStatus('saving');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'invoices', activeInvoice.id);
        const nextUpdated = {
          ...updatedData,
          updatedAt: new Date().toISOString()
        };

        await updateDoc(docRef, nextUpdated);
        setSaveStatus('saved');
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            title: 'Invoice Saved',
            message: `Invoice ${activeInvoice.invoiceNumber || 'sheet'} updated and saved successfully.`,
            type: 'save'
          }
        }));
      } catch (error) {
        setSaveStatus('error');
        handleFirestoreError(error, OperationType.UPDATE, `invoices/${activeInvoice.id}`);
      }
    }, 1500);
  };

  const handleFieldChange = (field: keyof InvoiceData, value: any) => {
    if (!activeInvoice) return;

    // Local update
    const patch: any = { [field]: value };
    
    if (field === 'items') {
      patch.items = JSON.stringify(value);
      // recalculate totals
      const subtotal = value.reduce((sum: number, item: any) => sum + (item.quantity * item.price), 0);
      const taxAmount = subtotal * (taxRate / 100);
      patch.totals = subtotal + taxAmount;
    } else if (field === 'totals') {
      patch.totals = value;
    }

    // Sync state
    if (field === 'invoiceNumber') setInvoiceNumber(value);
    if (field === 'clientName') setClientName(value);
    if (field === 'clientEmail') setClientEmail(value);
    if (field === 'date') setDate(value);
    if (field === 'dueDate') setDueDate(value);
    if (field === 'status') setStatus(value);
    if (field === 'items') setItems(value);

    triggerDebouncedSave(patch);
  };

  const createNewInvoice = async () => {
    try {
      setLoading(true);
      const nextInvNum = `INV-${1000 + invoices.length + 1}`;
      const defaultItems: InvoiceItem[] = [
        { description: 'Consulting Advisory Services', quantity: 15, price: 120 },
        { description: 'Cloud Setup & Verification', quantity: 1, price: 450 }
      ];

      const subtotal = defaultItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
      const totals = subtotal + (subtotal * 0.1); // 10% VAT default

      const newInvoiceObj = {
        userId,
        invoiceNumber: nextInvNum,
        clientName: 'Acme Corporation Inc.',
        clientEmail: 'billing@acme.com',
        items: JSON.stringify(defaultItems),
        totals,
        date: new Date().toISOString().substring(0, 10),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), // 30 days
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'invoices'), newInvoiceObj);
      const created = { id: docRef.id, ...newInvoiceObj } as InvoiceData;
      setActiveInvoice(created);
      setLoading(false);
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Invoice Drafted',
          message: `Created invoice draft ${created.invoiceNumber} for ${created.clientName}.`,
          type: 'system'
        }
      }));
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'invoices');
    }
  };

  const deleteInvoice = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this invoice?")) return;

    try {
      await deleteDoc(doc(db, 'invoices', id));
      if (activeInvoice?.id === id) {
        setActiveInvoice(null);
      }
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Invoice Deleted',
          message: `Invoice draft has been successfully removed.`,
          type: 'system'
        }
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `invoices/${id}`);
    }
  };

  // Line items manipulators
  const handleItemCellChange = (index: number, key: keyof InvoiceItem, val: any) => {
    const copy = [...items];
    const prevItem = copy[index];
    
    let typedValue = val;
    if (key === 'quantity') typedValue = parseInt(val) || 0;
    if (key === 'price') typedValue = parseFloat(val) || 0;

    copy[index] = { ...prevItem, [key]: typedValue };
    handleFieldChange('items', copy);
  };

  const addItemRow = () => {
    const copy = [...items, { description: 'New Service Item', quantity: 1, price: 100 }];
    handleFieldChange('items', copy);
  };

  const removeItemRow = (index: number) => {
    const copy = items.filter((_, i) => i !== index);
    handleFieldChange('items', copy);
  };

  // Computations
  const subtotalSum = items.reduce((sum, i) => sum + (i.quantity * i.price), 0);
  const calculatedTax = subtotalSum * (taxRate / 100);
  const finalSummaryTotal = subtotalSum + calculatedTax;

  const generatePDFobj = (): jsPDF => {
    if (!activeInvoice) {
      throw new Error("No active invoice loaded");
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const margin = 20;
    const pageWidth = 210;
    const pageHeight = 297;
    const contentWidth = pageWidth - (margin * 2);

    let y = 30;

    // Premium Color Accents
    const darkIndigo = [79, 70, 229]; // RGB
    const slateDark = [30, 41, 59];
    const textGray = [100, 116, 139];

    // Page overflow utility
    const checkAndAddPage = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    // Header Title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(darkIndigo[0], darkIndigo[1], darkIndigo[2]);
    doc.text("INVOICE", margin, y);

    // Invoice Meta (right aligned)
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.text(`Invoice No: ${invoiceNumber}`, pageWidth - margin, y, { align: 'right' });
    y += 5;
    doc.text(`Issued Date: ${date}`, pageWidth - margin, y, { align: 'right' });
    y += 5;
    doc.text(`Due Date: ${dueDate}`, pageWidth - margin, y, { align: 'right' });

    y += 15;

    // Party sections (Billed To vs. Issued By)
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(darkIndigo[0], darkIndigo[1], darkIndigo[2]);
    doc.text("BILLED TO:", margin, y);

    doc.text("ISSUED BY:", pageWidth - margin - 65, y);

    y += 5;
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.text(clientName || "Acme Corporation Inc.", margin, y);

    doc.text("WorkSuite Workstation Inc.", pageWidth - margin - 65, y);

    y += 4;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text(clientEmail || "billing@acme.com", margin, y);

    doc.text("billing@worksuite.ai", pageWidth - margin - 65, y);

    y += 15;

    // Table Header
    doc.setFillColor(248, 250, 252); // light slate background
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, 8, 'S');

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    
    // Header labels
    doc.text("Description", margin + 3, y + 5.5);
    doc.text("Qty", margin + 110, y + 5.5, { align: 'center' });
    doc.text("Rate", margin + 135, y + 5.5, { align: 'right' });
    doc.text("Subtotal", margin + contentWidth - 3, y + 5.5, { align: 'right' });

    y += 8;

    // Draw Items
    items.forEach((item) => {
      checkAndAddPage(10);
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, y, contentWidth, 10, 'S');

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);

      // Description text truncation or multi-line wrap
      const descLines = doc.splitTextToSize(item.description, 100);
      doc.text(descLines[0] || "", margin + 3, y + 6);
      
      doc.text(String(item.quantity), margin + 110, y + 6, { align: 'center' });
      doc.text(`$${item.price.toFixed(2)}`, margin + 135, y + 6, { align: 'right' });
      doc.text(`$${(item.quantity * item.price).toFixed(2)}`, margin + contentWidth - 3, y + 6, { align: 'right' });

      y += 10;
    });

    y += 10;

    // Totals Box
    checkAndAddPage(30);
    const boxWidth = 70;
    const boxX = pageWidth - margin - boxWidth;

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text("Subtotal:", boxX, y);
    doc.text(`$${subtotalSum.toFixed(2)}`, pageWidth - margin - 3, y, { align: 'right' });

    y += 5;
    doc.text(`VAT (${taxRate}%):`, boxX, y);
    doc.text(`$${calculatedTax.toFixed(2)}`, pageWidth - margin - 3, y, { align: 'right' });

    y += 7;
    doc.setDrawColor(226, 232, 240);
    doc.line(boxX, y - 3, pageWidth - margin, y - 3);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(darkIndigo[0], darkIndigo[1], darkIndigo[2]);
    doc.text("Total Due:", boxX, y);
    doc.text(`$${finalSummaryTotal.toFixed(2)}`, pageWidth - margin - 3, y, { align: 'right' });

    y += 15;
    checkAndAddPage(15);
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text("Thank you for choosing WorkSuite. We appreciate your partnership!", margin + (contentWidth / 2), y, { align: 'center' });

    return doc;
  };

  const downloadInvoiceTxt = () => {
    if (!activeInvoice) return;
    const itemsRaw = items.map(i => `${i.description.padEnd(40)} | ${String(i.quantity).padStart(5)} | $${i.price.toFixed(2).padStart(10)} | $${(i.quantity * i.price).toFixed(2).padStart(10)}`).join('\n');
    const txt = `
=============================================
             INVOICE: ${invoiceNumber}
=============================================
Date: ${date}
Due Date: ${dueDate}
Status: ${status.toUpperCase()}

ISSUER DETAILS
WorkSuite Productivity Suite User

CLIENT DETAILS
Client Name: ${clientName}
Client Email: ${clientEmail}

ITEMS DESCRIPTION
--------------------------------------------------------------------------------
Item Name                                |   Qty | Unit Price |   Subtotal
--------------------------------------------------------------------------------
${itemsRaw}
--------------------------------------------------------------------------------
Subtotal: $${subtotalSum.toFixed(2)}
Tax/VAT (10%): $${calculatedTax.toFixed(2)}
Total Outstanding Balance: $${finalSummaryTotal.toFixed(2)}
=============================================
Thank you for your business!
`;
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoiceNumber}.txt`;
    link.click();
  };

  const printInvoice = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const recordsMarkup = items.map(i => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${i.description}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${i.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${i.price.toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${(i.quantity * i.price).toFixed(2)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice ${invoiceNumber}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; color: #334155; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
            .details { display: flex; justify-content: space-between; margin-top: 30px; }
            .table-container { margin-top: 40px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f8fafc; padding: 12px; text-align: left; }
            .totals { text-align: right; margin-top: 30px; font-weight: bold; font-size: 1.1em; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 style="margin: 0; color: #4f46e5;">INVOICE</h1>
              <p style="margin: 5px 0 0 0; font-family: monospace;">${invoiceNumber}</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0;"><b>Date:</b> ${date}</p>
              <p style="margin: 5px 0 0 0;"><b>Due Date:</b> ${dueDate}</p>
            </div>
          </div>
          <div class="details">
            <div>
              <p style="margin: 0 0 5px 0; color: #94a3b8; font-size: 11px; font-weight: bold; text-transform: uppercase;">Billed To</p>
              <p style="margin: 0; font-size: 15px;"><b>${clientName}</b></p>
              <p style="margin: 3px 0 0 0; color: #64748b;">${clientEmail}</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0 0 5px 0; color: #94a3b8; font-size: 11px; font-weight: bold; text-transform: uppercase;">Status</p>
              <span style="background: #f1f5f9; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold;">${status.toUpperCase()}</span>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th style="padding: 12px; text-align: left;">Description</th>
                  <th style="padding: 12px; text-align: center; width: 100px;">Qty</th>
                  <th style="padding: 12px; text-align: right; width: 140px;">Price</th>
                  <th style="padding: 12px; text-align: right; width: 140px;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${recordsMarkup}
              </tbody>
            </table>
          </div>
          <div class="totals">
            <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: normal;">Subtotal: $${subtotalSum.toFixed(2)}</p>
            <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b; font-weight: normal;">VAT/Tax: $${calculatedTax.toFixed(2)}</p>
            <p style="margin: 10px 0 0 0; font-size: 18px; color: #1e293b;">Total Outstanding: $${finalSummaryTotal.toFixed(2)}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="flex h-full bg-slate-50/50 dark:bg-slate-950/40 text-slate-800 dark:text-slate-105 relative" id="invoice-maker">
      {/* Scroll shield on mobile */}
      {invoiceListOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-15"
          onClick={() => setInvoiceListOpen(false)}
        />
      )}

      {/* Search Sidebar lists */}
      <div className={`border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 transition-all duration-300 ${
        invoiceListOpen 
          ? 'w-64 opacity-100 visible' 
          : 'w-0 opacity-0 invisible overflow-hidden border-r-0'
      } fixed md:static inset-y-16 md:inset-y-auto left-0 z-20 h-[calc(100vh-64px)] md:h-auto shadow-lg md:shadow-none`}>
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Invoices</h3>
          </div>
          <button 
            onClick={createNewInvoice}
            className="p-1 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg transition cursor-pointer"
            title="Create Invoice"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar bg-white dark:bg-slate-900">
          {loading ? (
            <div className="text-xs text-slate-400 dark:text-slate-500 p-4 font-mono">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="text-xs text-slate-400 dark:text-slate-500 p-4 text-center">
              No bills stored. Click '+' to make one!
            </div>
          ) : (
            invoices.map((inv) => (
              <div
                key={inv.id}
                onClick={() => {
                  setActiveInvoice(inv);
                  // Auto close drawer on mobile upon selection
                  if (window.innerWidth < 768) {
                    setInvoiceListOpen(false);
                  }
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition text-xs ${
                  activeInvoice?.id === inv.id 
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-805 dark:text-indigo-305 font-bold border-l-2 border-indigo-600' 
                    : 'hover:bg-slate-55 dark:hover:bg-slate-800/40 text-slate-605 dark:text-slate-400'
                }`}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold">{inv.invoiceNumber}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">({inv.status})</span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{inv.clientName}</span>
                </div>
                <button
                  onClick={(e) => deleteInvoice(inv.id, e)}
                  type="button"
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-600 dark:hover:text-rose-450 transition cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Invoice Details workspace */}
      {activeInvoice ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          {/* Action Header */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between bg-slate-50/10 dark:bg-slate-950/15 gap-3">
            <div className="flex items-center gap-2 grow">
              {/* Sidebar toggle for mobile/tablets */}
              <button
                type="button"
                onClick={() => setInvoiceListOpen(!invoiceListOpen)}
                className="md:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 rounded-lg transition border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
                title="Toggle Invoices Sidebar"
              >
                <FolderOpen className="h-4 w-4" />
              </button>

              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest hidden xs:inline">Active Invoice:</span>
              <input
                type="text"
                value={invoiceNumber}
                onChange={e => handleFieldChange('invoiceNumber', e.target.value)}
                className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 border-0 rounded px-2 py-0.5 focus:bg-white dark:focus:bg-slate-950 focus:ring-0 focus:border-indigo-305 focus:border-indigo-300 w-36 no-outline-focus transition"
              />
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 font-mono text-slate-400">
                {saveStatus === 'saving' ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin text-amber-500" />
                    <span>Auto-saving...</span>
                  </>
                ) : saveStatus === 'error' ? (
                  <span className="text-rose-500">Error saving</span>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-slate-500">Auto-saved</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsPreviewOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg shadow-sm transition"
                  title="PDF Preview & Export Invoice"
                >
                  <Eye className="h-4 w-4" />
                  <span className="text-[11px] hidden sm:inline">PDF Preview</span>
                </button>
                <button
                  onClick={downloadInvoiceTxt}
                  className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition"
                  title="Download Raw TXT Bill"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={printInvoice}
                  className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition"
                  title="Print Professional Invoice"
                >
                  <Printer className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* AI Invoice items suggestions */}
          {aiInvoiceItems.length > 0 && (
            <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in text-slate-800">
              <div className="flex items-start gap-3">
                <Receipt className="h-5.5 w-5.5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <p className="font-bold text-xs text-slate-900">AI Billing Items Import suggestions found</p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Detected <span className="font-bold text-amber-700">{aiInvoiceItems.length} billing items</span> from log analysis. Would you like to append them to invoice <span className="font-mono font-bold">{invoiceNumber}</span>?
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {aiInvoiceItems.map((item, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/80 border border-amber-200 rounded text-[10px] font-medium text-slate-700">
                        {item.description} <span className="text-slate-400 font-normal">({item.quantity} x ${item.price})</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleApplyAiInvoiceItems}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs active:scale-95 transition cursor-pointer"
                >
                  Apply Invoice Inject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAiInvoiceItems([]);
                    if (clearAdoptedText) clearAdoptedText();
                  }}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-100/85 text-slate-500 bg-white rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  Ignore
                </button>
              </div>
            </div>
          )}

          {/* Form and items list */}
          <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-5xl">
            {/* Metadata inputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-200">
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <User className="h-4 w-4 text-indigo-600" />
                  <span>Client details</span>
                </h4>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => handleFieldChange('clientName', e.target.value)}
                    placeholder="Client Company Name"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-300 transition focus:ring-0 focus:bg-white"
                  />
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={e => handleFieldChange('clientEmail', e.target.value)}
                    placeholder="client@corporate.com"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-300 transition focus:ring-0 focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  <span>Timeline dates</span>
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-12 font-medium">Issued:</span>
                    <input
                      type="date"
                      value={date}
                      onChange={e => handleFieldChange('date', e.target.value)}
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-300 transition focus:ring-0 focus:bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-12 font-medium">Due:</span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => handleFieldChange('dueDate', e.target.value)}
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-300 transition focus:ring-0 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-indigo-600" />
                  <span>Status and values</span>
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-12 font-medium">State:</span>
                    <select
                      value={status}
                      onChange={e => handleFieldChange('status', e.target.value)}
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-300 transition focus:ring-0 focus:bg-white bg-white"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-12 font-medium">VAT Rate:</span>
                    <input
                      type="number"
                      value={taxRate}
                      onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-300 transition focus:ring-0 focus:bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Line items list editor table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Billable Line Items</h4>
                <button
                  onClick={addItemRow}
                  type="button"
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-bold transition"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Add Line Item</span>
                </button>
              </div>

              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-450 border-b border-slate-200 select-none font-bold text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 text-left font-semibold">Description / Service Statement</th>
                    <th className="py-2.5 text-center font-semibold w-24">Quantity</th>
                    <th className="py-2.5 text-right font-semibold w-32">Unit Price</th>
                    <th className="py-2.5 text-right font-semibold w-32">Subtotal</th>
                    <th className="py-2.5 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                        No line items added yet. Click 'Add Line Item' above!
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/20">
                        <td className="py-2">
                           <input
                            type="text"
                            value={item.description}
                            onChange={e => handleItemCellChange(index, 'description', e.target.value)}
                            placeholder="Consulting hour service, hosting..."
                            className="w-full text-xs border-0 bg-transparent focus:bg-white focus:ring-0 focus:border-indigo-300 rounded px-2 py-1 no-outline-focus transition-all"
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={e => handleItemCellChange(index, 'quantity', e.target.value)}
                            className="w-20 text-xs border-0 bg-transparent text-center focus:bg-white focus:ring-0 focus:border-indigo-300 rounded py-1 no-outline-focus transition-all"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <div className="inline-flex items-center justify-end relative">
                            <span className="text-slate-400 pr-1">$</span>
                            <input
                              type="number"
                              value={item.price}
                              onChange={e => handleItemCellChange(index, 'price', e.target.value)}
                              className="w-28 text-xs border-0 bg-transparent text-right focus:bg-white focus:ring-0 focus:border-indigo-300 rounded py-1 pr-1 no-outline-focus transition-all"
                            />
                          </div>
                        </td>
                        <td className="py-2 text-right font-semibold text-slate-700">
                          ${(item.quantity * item.price).toFixed(2)}
                        </td>
                        <td className="py-2 text-center text-slate-400 hover:text-rose-600 transition">
                          <button onClick={() => removeItemRow(index)} type="button">
                            <Trash className="h-3.5 w-3.5 animate-pulse" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Calculations total invoice boxes */}
            <div className="flex justify-end pt-4">
              <div className="w-80 space-y-2 text-xs border-t border-slate-200 pt-4">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span className="font-semibold font-mono">${subtotalSum.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>VAT / Tax (${taxRate}%):</span>
                  <span className="font-semibold font-mono">${calculatedTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-800 border-t border-dashed border-slate-200 pt-2.5 font-bold">
                  <span>Total Amount Due:</span>
                  <span className="font-black font-mono text-indigo-700 text-base">${finalSummaryTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {onSelectContentForAi && (
              <div className="border border-indigo-150 bg-indigo-50/20 p-5 rounded-2xl flex items-center justify-between gap-4 mt-6">
                <div className="text-xs text-slate-500 leading-relaxed">
                  <b>AI Assistant Advice:</b> Generative AI tools help match invoice line descriptions with outline prompts perfectly. Select the helper button to fetch summaries.
                </div>
                <button
                  onClick={() => onSelectContentForAi(`Generate a professional bill line-item list for client "${clientName}" related to tech advisor hours.`)}
                  type="button"
                  className="shrink-0 inline-flex items-center gap-1.5 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Suggest Items with AI</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
          <Receipt className="h-12 w-12 text-slate-200 mb-2" />
          <p className="text-sm">Select an active client invoice, or compile a new receipt!</p>
          <button
            onClick={createNewInvoice}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition"
          >
            Create Invoice
          </button>
        </div>
      )}

      {/* PDF Export Preview Modal */}
      {activeInvoice && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          title={`Invoice Statement: ${invoiceNumber} (${clientName})`}
          pdfGenerator={generatePDFobj}
          fileName={`${invoiceNumber || 'invoice'}.pdf`}
        />
      )}
    </div>
  );
}
