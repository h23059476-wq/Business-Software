import React, { useState, useEffect, useRef } from 'react';
import { 
  Grid, Plus, Save, Trash2, Download, CheckCircle2, RefreshCw,
  PlusCircle, MinusCircle, FileSpreadsheet, Sparkles, FileDown,
  ChevronDown, FolderOpen
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { SpreadsheetData } from '../types.ts';
import PdfPreviewModal from './PdfPreviewModal.tsx';

interface SpreadsheetEditorProps {
  userId: string;
  onSelectContentForAi?: (text: string) => void;
  activeSheetId?: string | null;
  initialAdoptedText?: string | null;
  clearAdoptedText?: () => void;
}

type CellGrid = { [cellId: string]: string }; // e.g. "A1": "100", "B1": "=SUM(A1:A3)"

export default function SpreadsheetEditor({ 
  userId, 
  onSelectContentForAi,
  activeSheetId,
  initialAdoptedText,
  clearAdoptedText
}: SpreadsheetEditorProps) {
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState<SpreadsheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [sheetTitle, setSheetTitle] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [sheetListOpen, setSheetListOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

  // Grid dimensions
  const [cols, setCols] = useState<string[]>(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const [rowsCount, setRowsCount] = useState<number>(15);
  const [grid, setGrid] = useState<CellGrid>({});
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [cellInput, setCellInput] = useState<string>('');

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // AI Spreadsheet data parsed imports state
  const [aiImportTable, setAiImportTable] = useState<{ headers: string[], rows: string[][] } | null>(null);

  useEffect(() => {
    if (!initialAdoptedText) {
      setAiImportTable(null);
      return;
    }

    try {
      // Find CSV code brackets or parse markdown fallback
      let csvData = "";
      const csvMatch = initialAdoptedText.match(/\[CSV_IMPORT\]([\s\S]*?)\[\/CSV_IMPORT\]/);
      if (csvMatch && csvMatch[1]) {
        csvData = csvMatch[1].trim();
      } else {
        // Fallback: parse markdown tables
        const lines = initialAdoptedText.split('\n');
        const tableLines = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
        if (tableLines.length > 1) {
          // Parse markdown structure
          const parsedRows = tableLines
            .map(line => line.split('|').map(cell => cell.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1))
            .filter(r => r.length > 0 && !r.every(cell => cell.startsWith('-'))); // skip table lines
          
          if (parsedRows.length > 0) {
            const headers = parsedRows[0];
            const dataRows = parsedRows.slice(1);
            setAiImportTable({ headers, rows: dataRows });
            return;
          }
        }
      }

      if (csvData) {
        const lines = csvData.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
          const headers = lines[0].split(',').map(h => h.trim());
          const rows = lines.slice(1).map(row => row.split(',').map(c => c.trim()));
          setAiImportTable({ headers, rows });
        }
      }
    } catch (err) {
      console.error("Failed to parse adopted text into spreadsheet grid map", err);
    }
  }, [initialAdoptedText]);

  const handleApplyAiImport = () => {
    if (!activeSheet || !aiImportTable) return;
    
    let startRow = 1;
    let startColIdx = 0; // Col A
    
    if (activeCell) {
      const match = activeCell.match(/^([A-Z]+)(\d+)$/);
      if (match) {
        const colStr = match[1];
        startRow = parseInt(match[2], 10);
        
        let idx = 0;
        for (let i = 0; i < colStr.length; i++) {
          idx = idx * 26 + (colStr.charCodeAt(i) - 64);
        }
        startColIdx = idx - 1;
      }
    }
    
    const newGrid = { ...grid };
    
    // Fill headers row
    aiImportTable.headers.forEach((header, colOffset) => {
      const targetColIdx = startColIdx + colOffset;
      if (targetColIdx < cols.length) {
        const colChar = cols[targetColIdx];
        const cellId = `${colChar}${startRow}`;
        newGrid[cellId] = header;
      }
    });
    
    // Fill content rows
    aiImportTable.rows.forEach((row, rowOffset) => {
      row.forEach((cellVal, colOffset) => {
        const targetColIdx = startColIdx + colOffset;
        if (targetColIdx < cols.length) {
          const colChar = cols[targetColIdx];
          const cellId = `${colChar}${startRow + 1 + rowOffset}`;
          newGrid[cellId] = cellVal;
        }
      });
    });
    
    setGrid(newGrid);
    triggerDebouncedSave({ data: JSON.stringify({ grid: newGrid, cols, rowsCount }) });
    
    window.dispatchEvent(new CustomEvent('app-notification', {
      detail: {
        title: 'Device Data Injected',
        message: `Successfully structured and loaded ${aiImportTable.rows.length} spreadsheet records into sheet cells.`,
        type: 'success'
      }
    }));
    
    setAiImportTable(null);
    if (clearAdoptedText) clearAdoptedText();
  };

  // Read list from Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'spreadsheets'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sheetsData: SpreadsheetData[] = [];
      snapshot.forEach((docSnap) => {
        sheetsData.push({ id: docSnap.id, ...docSnap.data() } as SpreadsheetData);
      });
      setSpreadsheets(sheetsData);

      if (sheetsData.length > 0 && !activeSheet) {
        const sorted = [...sheetsData].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
        setActiveSheet(sorted[0]);
        setSheetTitle(sorted[0].title);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore loading error in Spreadsheets: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Sync selected sheet if activeSheetId changes from command palette
  useEffect(() => {
    if (activeSheetId && spreadsheets.length > 0) {
      const targetSheet = spreadsheets.find(s => s.id === activeSheetId);
      if (targetSheet) {
        setActiveSheet(targetSheet);
        setSheetTitle(targetSheet.title);
      }
    }
  }, [activeSheetId, spreadsheets]);

  // Load active sheet grid
  useEffect(() => {
    if (activeSheet) {
      setSheetTitle(activeSheet.title);
      try {
        const parsed = JSON.parse(activeSheet.data);
        setGrid(parsed.grid || {});
        if (parsed.cols) setCols(parsed.cols);
        if (parsed.rowsCount) setRowsCount(parsed.rowsCount);
      } catch (err) {
        setGrid({});
      }
    } else {
      setSheetTitle('');
      setGrid({});
      setCols(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
      setRowsCount(15);
    }
  }, [activeSheet?.id]);

  // Debounced Save
  const triggerDebouncedSave = (updatedData: Partial<SpreadsheetData>) => {
    if (!activeSheet) return;
    setSaveStatus('saving');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'spreadsheets', activeSheet.id);
        const nextUpdated = {
          ...updatedData,
          updatedAt: new Date().toISOString()
        };

        await updateDoc(docRef, nextUpdated);
        setSaveStatus('saved');
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            title: 'Spreadsheet Saved',
            message: `"${nextUpdated.title || activeSheet.title || 'Untitled Spreadsheet'}" automatic sync complete.`,
            type: 'save'
          }
        }));
      } catch (error) {
        setSaveStatus('error');
        handleFirestoreError(error, OperationType.UPDATE, `spreadsheets/${activeSheet.id}`);
      }
    }, 1500);
  };

  const createNewSheet = async () => {
    try {
      setLoading(true);
      const initialGrid: CellGrid = {
        "A1": "Item", "B1": "Qty", "C1": "Cost/Hrs", "D1": "Subtotal",
        "A2": "Engineering Design", "B2": "40", "C2": "65", "D2": "=B2*C2",
        "A3": "Consulting Advisory", "B3": "12", "C3": "150", "D3": "=B3*C3",
        "A4": "Security Review", "B4": "5", "C4": "200", "D4": "=B4*C4",
        "A5": "Total Projects", "B5": "=SUM(B2:B4)", "C5": "Avg Cost", "D5": "=SUM(D2:D4)"
      };

      const newSheetObj = {
        userId,
        title: 'New Financial Spreadsheet',
        data: JSON.stringify({
          grid: initialGrid,
          cols: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
          rowsCount: 15
        }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'spreadsheets'), newSheetObj);
      const created = { id: docRef.id, ...newSheetObj } as SpreadsheetData;
      setActiveSheet(created);
      setSheetTitle(created.title);
      setLoading(false);
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Spreadsheet Created',
          message: `Created new spreadsheet: "${created.title}"`,
          type: 'system'
        }
      }));
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'spreadsheets');
    }
  };

  const deleteSheet = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this spreadsheet?")) return;

    try {
      await deleteDoc(doc(db, 'spreadsheets', id));
      if (activeSheet?.id === id) {
        setActiveSheet(null);
        setSheetTitle('');
      }
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Spreadsheet Deleted',
          message: `Successfully deleted spreadsheet from cloud storage.`,
          type: 'system'
        }
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `spreadsheets/${id}`);
    }
  };

  // Safe Cell Evaluation Parser
  const evaluateCell = (cellId: string, visited: Set<string> = new Set()): string => {
    const rawVal = grid[cellId];
    if (!rawVal) return '';
    if (!rawVal.startsWith('=')) return rawVal;

    // Direct loop protection
    if (visited.has(cellId)) return 'CIRCULAR_REF';
    visited.add(cellId);

    const formula = rawVal.substring(1).toUpperCase().trim();

    try {
      // 1. SUM function, e.g., SUM(A1:A4) or SUM(A2:D2)
      if (formula.startsWith('SUM(') && formula.endsWith(')')) {
        const rangeStr = formula.substring(4, formula.length - 1);
        const cellRange = parseRange(rangeStr);
        let sumValue = 0;
        cellRange.forEach(cid => {
          const evalVal = parseFloat(evaluateCell(cid, new Set(visited)));
          if (!isNaN(evalVal)) sumValue += evalVal;
        });
        return sumValue.toString();
      }

      // 2. AVG function, e.g., AVG(A1:A4)
      if (formula.startsWith('AVG(') && formula.endsWith(')')) {
        const rangeStr = formula.substring(4, formula.length - 1);
        const cellRange = parseRange(rangeStr);
        let sumValue = 0;
        let count = 0;
        cellRange.forEach(cid => {
          const evalVal = parseFloat(evaluateCell(cid, new Set(visited)));
          if (!isNaN(evalVal)) {
            sumValue += evalVal;
            count++;
          }
        });
        return count > 0 ? (sumValue / count).toFixed(2) : '0';
      }

      // 3. Simple basic algebra: cell1 * cell2, cell1 + cell2, cell1 - cell2
      const operators = ['*', '/', '+', '-'];
      for (const op of operators) {
        if (formula.includes(op)) {
          const parts = formula.split(op);
          if (parts.length === 2) {
            const firstCell = parts[0].trim();
            const secondCell = parts[1].trim();
            
            // Check if parts are cell structures or literal numbers
            const val1 = isCellName(firstCell) ? parseFloat(evaluateCell(firstCell, new Set(visited))) : parseFloat(firstCell);
            const val2 = isCellName(secondCell) ? parseFloat(evaluateCell(secondCell, new Set(visited))) : parseFloat(secondCell);

            if (isNaN(val1) || isNaN(val2)) return 'ERROR_NUM';

            if (op === '*') return (val1 * val2).toString();
            if (op === '/') return val2 !== 0 ? (val1 / val2).toString() : 'DIV_BY_0';
            if (op === '+') return (val1 + val2).toString();
            if (op === '-') return (val1 - val2).toString();
          }
        }
      }

      return 'FORMULA_ERR';
    } catch (e) {
      return 'CALC_ERR';
    }
  };

  const isCellName = (str: string): boolean => {
    return /^[A-Z]+[0-9]+$/.test(str);
  };

  const parseRange = (rangeStr: string): string[] => {
    const separatorList = [':', '..'];
    let sep = ':';
    for (const s of separatorList) {
      if (rangeStr.includes(s)) sep = s;
    }

    const parts = rangeStr.split(sep);
    if (parts.length !== 2) return [];

    const start = parts[0].trim();
    const end = parts[1].trim();

    const startCol = start.match(/[A-Z]+/)?.[0] || 'A';
    const startRow = parseInt(start.match(/[0-9]+/)?.[0] || '1');
    const endCol = end.match(/[A-Z]+/)?.[0] || 'A';
    const endRow = parseInt(end.match(/[0-9]+/)?.[0] || '1');

    const startColVal = columnLabelToNumber(startCol);
    const endColVal = columnLabelToNumber(endCol);

    const minCol = Math.min(startColVal, endColVal);
    const maxCol = Math.max(startColVal, endColVal);
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);

    const finalCells: string[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      const colLabel = numberToColumnLabel(c);
      for (let r = minRow; r <= maxRow; r++) {
        finalCells.push(`${colLabel}${r}`);
      }
    }
    return finalCells;
  };

  const columnLabelToNumber = (label: string): number => {
    let num = 0;
    for (let i = 0; i < label.length; i++) {
      num = num * 26 + (label.charCodeAt(i) - 64);
    }
    return num;
  };

  const numberToColumnLabel = (num: number): string => {
    let label = '';
    while (num > 0) {
      const remainder = (num - 1) % 24;
      label = String.fromCharCode(65 + remainder) + label;
      num = Math.floor((num - 1) / 24);
    }
    return label || 'A';
  };

  const handleCellSelect = (cellId: string) => {
    setActiveCell(cellId);
    setCellInput(grid[cellId] || '');
  };

  const handleCellChange = (value: string) => {
    setCellInput(value);
    if (!activeCell || !activeSheet) return;

    const updatedGrid = { ...grid, [activeCell]: value };
    setGrid(updatedGrid);

    // Save grid change debounced
    triggerDebouncedSave({
      data: JSON.stringify({
        grid: updatedGrid,
        cols,
        rowsCount
      })
    });
  };

  // Add Column
  const addColumn = () => {
    if (!activeSheet) return;
    const nextColChar = String.fromCharCode(65 + cols.length);
    const newCols = [...cols, nextColChar];
    setCols(newCols);

    triggerDebouncedSave({
      data: JSON.stringify({
        grid,
        cols: newCols,
        rowsCount
      })
    });
  };

  // Remove Column
  const removeColumn = () => {
    if (!activeSheet || cols.length <= 1) return;
    const newCols = cols.slice(0, -1);
    setCols(newCols);

    triggerDebouncedSave({
      data: JSON.stringify({
        grid,
        cols: newCols,
        rowsCount
      })
    });
  };

  // Add Row
  const addRow = () => {
    if (!activeSheet) return;
    const nextRowsCount = rowsCount + 1;
    setRowsCount(nextRowsCount);

    triggerDebouncedSave({
      data: JSON.stringify({
        grid,
        cols,
        rowsCount: nextRowsCount
      })
    });
  };

  const removeRow = () => {
    if (!activeSheet || rowsCount <= 1) return;
    const nextRowsCount = rowsCount - 1;
    setRowsCount(nextRowsCount);

    triggerDebouncedSave({
      data: JSON.stringify({
        grid,
        cols,
        rowsCount: nextRowsCount
      })
    });
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSheetTitle(val);
    if (activeSheet) {
      activeSheet.title = val;
      triggerDebouncedSave({ title: val });
    }
  };

  const downloadCSV = () => {
    if (!activeSheet) return;
    let csvContent = "";
    
    // Rows loop
    for (let r = 1; r <= rowsCount; r++) {
      const rowCells = cols.map(c => {
        const val = evaluateCell(`${c}${r}`);
        // Escape quotes
        return `"${val.replace(/"/g, '""')}"`;
      });
      csvContent += rowCells.join(",") + "\n";
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sheetTitle || 'spreadsheet'}.csv`;
    link.click();
  };

  const generatePDFobj = (): jsPDF => {
    if (!activeSheet) {
      throw new Error("Active spreadsheet is not defined.");
    }
    const isLandscape = cols.length > 5;
    const doc = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = isLandscape ? 297 : 210;
    const pageHeight = isLandscape ? 210 : 297;
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);

    let y = 25;

    const checkAndAddPage = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    // Header info
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(17, 24, 39);
    doc.text(sheetTitle || activeSheet.title || 'Spreadsheet Report', margin, y);
    y += 6;

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generated via WorkSuite AI on ${new Date().toLocaleDateString()}`, margin, y);
    y += 8;

    const totalColumns = cols.length + 1;
    const colWidth = contentWidth / totalColumns;

    // Draw table header
    doc.setFillColor(243, 244, 246);
    doc.rect(margin, y, contentWidth, 8, 'F');

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);

    // Header borders
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.2);

    // Left corner label
    doc.rect(margin, y, colWidth, 8, 'S');

    cols.forEach((col, idx) => {
      const xPos = margin + ((idx + 1) * colWidth);
      doc.rect(xPos, y, colWidth, 8, 'S');
      doc.text(col, xPos + (colWidth / 2), y + 5.5, { align: 'center' });
    });
    y += 8;

    // Print Rows
    for (let r = 1; r <= rowsCount; r++) {
      // Stop if remaining rows are completely empty
      let isRowEmpty = true;
      for (const col of cols) {
        if ((grid[`${col}${r}`] || '').trim() !== '') {
          isRowEmpty = false;
          break;
        }
      }
      
      if (isRowEmpty) {
        let allSubsequentEmpty = true;
        for (let nextR = r + 1; nextR <= rowsCount; nextR++) {
          for (const col of cols) {
            if ((grid[`${col}${nextR}`] || '').trim() !== '') {
              allSubsequentEmpty = false;
              break;
            }
          }
          if (!allSubsequentEmpty) break;
        }
        if (allSubsequentEmpty) {
          break; 
        }
      }

      checkAndAddPage(8);

      // Row header label bg
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y, colWidth, 8, 'F');

      // Draw row outer line
      doc.rect(margin, y, colWidth, 8, 'S');

      // Label name
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(r.toString(), margin + (colWidth / 2), y + 5.5, { align: 'center' });

      // Cell items
      cols.forEach((col, idx) => {
        const xPos = margin + ((idx + 1) * colWidth);
        doc.rect(xPos, y, colWidth, 8, 'S');

        const cellId = `${col}${r}`;
        const rawVal = grid[cellId] || '';
        const showVal = evaluateCell(cellId);
        const isFormula = rawVal.startsWith('=');

        if (isFormula) {
          doc.setFont("Helvetica", "bold");
          doc.setTextColor(59, 130, 246); // Indigo-ish blue
        } else {
          doc.setFont("Helvetica", "normal");
          doc.setTextColor(55, 65, 81);
        }

        doc.setFontSize(8);
        // Simple string wrapping / truncation to avoid spill out of cell borders
        const cellText = showVal.length > 15 ? showVal.substring(0, 14) + '..' : showVal;
        doc.text(cellText, xPos + 2, y + 5.5);
      });

      y += 8;
    }

    return doc;
  };

  const exportPDF = () => {
    if (!activeSheet) return;
    try {
      const docObj = generatePDFobj();
      docObj.save(`${sheetTitle || activeSheet.title || 'spreadsheet'}.pdf`);
    } catch (err) {
      console.error("PDF creation failed:", err);
    }
  };

  return (
    <div className="flex h-full bg-slate-50/50 dark:bg-slate-950/40 text-slate-800 dark:text-slate-105 relative" id="spreadsheet-processor">
      {/* Scroll shield on mobile */}
      {sheetListOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-15"
          onClick={() => setSheetListOpen(false)}
        />
      )}

      {/* List Sidebar */}
      <div className={`border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 transition-all duration-300 ${
        sheetListOpen 
          ? 'w-64 opacity-100 visible' 
          : 'w-0 opacity-0 invisible overflow-hidden border-r-0'
      } fixed md:static inset-y-16 md:inset-y-auto left-0 z-20 h-[calc(100vh-64px)] md:h-auto shadow-lg md:shadow-none`}>
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Active Lists</h3>
          </div>
          <button 
            onClick={createNewSheet}
            className="p-1 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg transition cursor-pointer"
            title="Create List"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar bg-white dark:bg-slate-900">
          {loading ? (
            <div className="text-xs text-slate-400 dark:text-slate-500 p-4 font-mono">Loading...</div>
          ) : spreadsheets.length === 0 ? (
            <div className="text-xs text-slate-400 dark:text-slate-500 p-4 text-center">
              No list grids found. Click '+' above to start!
            </div>
          ) : (
            spreadsheets.map((sheet) => (
              <div
                key={sheet.id}
                onClick={() => {
                  setActiveSheet(sheet);
                  // Auto close drawer on mobile upon selection
                  if (window.innerWidth < 768) {
                    setSheetListOpen(false);
                  }
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition text-xs ${
                  activeSheet?.id === sheet.id 
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-805 dark:text-indigo-305 font-bold border-l-2 border-indigo-600' 
                    : 'hover:bg-slate-55 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <Grid className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="truncate">{sheet.title || 'Untitled'}</span>
                </div>
                <button
                  onClick={(e) => deleteSheet(sheet.id, e)}
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

      {/* Grid workspace */}
      {activeSheet ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between bg-slate-50/10 dark:bg-slate-950/15 gap-3">
            <div className="flex items-center gap-2 grow">
              {/* Sidebar toggle for mobile/tablets */}
              <button
                onClick={() => setSheetListOpen(!sheetListOpen)}
                className="md:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 rounded-lg transition border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
                title="Toggle Lists Sidebar"
              >
                <FolderOpen className="h-4 w-4" />
              </button>
              
              <input
                type="text"
                value={sheetTitle}
                onChange={handleTitleChange}
                className="text-base sm:text-lg font-bold text-slate-850 dark:text-slate-100 bg-transparent hover:bg-slate-100/50 dark:hover:bg-slate-800/40 focus:bg-white dark:focus:bg-slate-950 border-0 rounded px-2 py-1 focus:ring-0 focus:border-indigo-300 w-full sm:w-96 font-sans no-outline-focus transition"
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

              <div className="relative">
                <button
                  onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/80 font-medium rounded-lg shadow-xs border border-indigo-100 dark:border-indigo-900/40 transition cursor-pointer text-xs"
                  title="File Export Options"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>File</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {isFileMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsFileMenuOpen(false)} />
                    <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1.5 z-20 font-sans">
                      <button
                        onClick={() => {
                          setIsFileMenuOpen(false);
                          setIsPreviewOpen(true);
                        }}
                        className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium text-left transition cursor-pointer"
                      >
                        <FileDown className="h-4 w-4 text-rose-500" />
                        <span>Export PDF</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsFileMenuOpen(false);
                          downloadCSV();
                        }}
                        className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium text-left transition cursor-pointer"
                      >
                        <Download className="h-4 w-4 text-emerald-500" />
                        <span>Export CSV</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Formula bar */}
          <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-slate-800 dark:text-slate-105 flex flex-wrap sm:flex-nowrap items-center gap-2 text-xs">
            <div className="w-12 text-slate-400 dark:text-slate-500 font-bold font-mono text-center">
              {activeCell || '---'}
            </div>
            <div className="text-slate-400 dark:text-slate-500 font-medium italic select-none">fx</div>
            <input
              type="text"
              value={cellInput}
              onChange={(e) => handleCellChange(e.target.value)}
              placeholder="Type data or algebra formulas (e.g., =B2*C2 or =SUM(B2:B4))"
              className="flex-1 border border-slate-200 dark:border-slate-800 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-305 dark:focus:border-indigo-700 focus:ring-0 font-mono text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition whitespace-nowrap min-w-0"
            />
          </div>

          {/* AI Cell Import Suggestions */}
          {aiImportTable && (
            <div className="mx-4 sm:mx-6 my-3 bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in text-slate-800 dark:text-slate-200">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-450 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <p className="font-bold text-xs text-slate-900 dark:text-slate-100">AI Table Import suggestion</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Detected <span className="font-bold">{aiImportTable.rows.length} rows</span> to load into spreadsheet starting at column-head <span className="font-bold text-emerald-700 dark:text-emerald-400">{activeCell || "A1"}</span>.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyAiImport}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs active:scale-95 transition cursor-pointer"
                >
                  Apply Cell Import
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAiImportTable(null);
                    if (clearAdoptedText) clearAdoptedText();
                  }}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-400 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  Ignore
                </button>
              </div>
            </div>
          )}

          {/* Table Operations Grid */}
          <div className="px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-105/30 dark:bg-slate-950/20 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400 font-bold select-none">
            <div className="flex items-center gap-1.5">
              <PlusCircle className="h-4.5 w-4.5 text-indigo-650 dark:text-indigo-400 cursor-pointer hover:scale-105 transition" onClick={addColumn} />
              <span>Col</span>
              <MinusCircle className="h-4.5 w-4.5 text-slate-400 dark:text-slate-650 cursor-pointer hover:scale-105 transition" onClick={removeColumn} />
            </div>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <PlusCircle className="h-4.5 w-4.5 text-indigo-655 dark:text-indigo-400 cursor-pointer hover:scale-105 transition" onClick={addRow} />
              <span>Row</span>
              <MinusCircle className="h-4.5 w-4.5 text-slate-400 dark:text-slate-650 cursor-pointer hover:scale-105 transition" onClick={removeRow} />
            </div>

            {onSelectContentForAi && activeCell && (
              <button
                onClick={() => onSelectContentForAi(`Active spreadsheet cell [${activeCell}]: "${grid[activeCell] || ''}" evaluated as "${evaluateCell(activeCell)}"`)}
                type="button"
                className="ml-auto inline-flex items-center gap-1 hover:text-indigo-705 dark:hover:text-amber-302 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-305 font-bold px-2.5 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900/40 transition text-[11px] cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Explain cell with AI</span>
              </button>
            )}
          </div>

          {/* Interactive Matrix Grid */}
          <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 text-slate-800 dark:text-slate-100">
            <div className="inline-block border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm">
              <table className="border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-100/75 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase tracking-wider font-bold">
                    <th className="w-10 px-2 py-1.5 border-r border-slate-200 dark:border-slate-800 font-sans font-medium text-center"></th>
                    {cols.map((col) => (
                      <th key={col} className="w-32 px-3 py-1.5 border-r border-slate-200 dark:border-slate-800 font-medium text-center select-none text-slate-500 dark:text-slate-400">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rowsCount }).map((_, index) => {
                    const rowNum = index + 1;
                    return (
                      <tr key={rowNum} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/40 dark:hover:bg-slate-800/20">
                        <td className="bg-slate-100/40 dark:bg-slate-950/20 text-slate-415 dark:text-slate-500 text-center border-r border-slate-200 dark:border-slate-800 select-none font-sans font-medium">
                          {rowNum}
                        </td>
                        {cols.map((col) => {
                          const cellId = `${col}${rowNum}`;
                          const isFocused = activeCell === cellId;
                          const rawVal = grid[cellId] || '';
                          const showVal = evaluateCell(cellId);
                          const isFormula = rawVal.startsWith('=');

                          return (
                            <td
                              key={col}
                              onClick={() => handleCellSelect(cellId)}
                              className={`w-32 py-2 px-3 border-r border-slate-200 dark:border-slate-800 cursor-text relative transition-all min-h-8 truncate max-w-[8rem] ${
                                isFocused 
                                  ? 'ring-2 ring-indigo-600 bg-indigo-50/10 dark:bg-indigo-950/20 z-10' 
                                  : isFormula 
                                    ? 'bg-indigo-50/10 dark:bg-indigo-950/10 font-medium' 
                                    : ''
                              }`}
                            >
                              {isFocused ? (
                                <input
                                  type="text"
                                  value={cellInput}
                                  onChange={(e) => handleCellChange(e.target.value)}
                                  className="absolute inset-0 w-full h-full px-3 py-1 border-0 focus:ring-0 focus:outline-none bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 z-20 font-mono text-xs"
                                  autoFocus
                                />
                              ) : (
                                <div className="truncate flex items-center justify-between">
                                  <span className={`w-full ${isFormula ? 'font-bold text-indigo-700 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                    {showVal}
                                  </span>
                                  {isFormula && (
                                    <span className="text-[10px] text-indigo-400 dark:text-indigo-500 font-sans select-none shrink-0 pl-1">ƒ</span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
          <Grid className="h-12 w-12 text-slate-200 mb-2" />
          <p className="text-sm">Select an existing spreadsheet, or create a new grid!</p>
          <button
            onClick={createNewSheet}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition"
          >
            Create Spreadsheet
          </button>
        </div>
      )}

      {/* PDF Export Preview Modal */}
      {activeSheet && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          title={`List Grid: ${sheetTitle || 'Financial Spreadsheet'}`}
          pdfGenerator={generatePDFobj}
          fileName={`${sheetTitle || activeSheet.title || 'spreadsheet'}.pdf`}
        />
      )}
    </div>
  );
}
