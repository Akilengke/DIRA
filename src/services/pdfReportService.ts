import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DonkeyCase, CaseCategory } from '../types';
import { CATEGORY_INFO, EMERGENCY_HOTLINE, HOTLINE_DISPLAY } from '../data/mockData';
import { formatReportedDateTime } from '../utils/dateUtils';
import { CARITAS_KITUI_LOGO_BASE64 } from '../assets/caritasLogoBase64';
import { DIRA_LOGO_BASE64 } from '../assets/diraLogoBase64';

export type ReportPeriodType = 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'all';

export interface GeneralReportConfig {
  periodType: ReportPeriodType;
  periodLabel: string;
  startDate?: Date | null;
  endDate?: Date | null;
  subCounty?: string;
  category?: string;
  generatedBy?: string;
  notes?: string;
}

/**
 * Triggers a download of a generated PDF Blob in the browser
 */
export function triggerPDFDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 2000);
}

/**
 * Helper to get autoTable function whether it's default export or direct
 */
function getAutoTable() {
  return (autoTable as any).default || autoTable;
}

export interface ProcessedCasePhoto {
  dataUrl: string;
  format: 'JPEG' | 'PNG';
  caption: string;
  timestamp?: string;
  caseRef?: string;
  category?: string;
  location?: string;
  aspectRatio: number;
}

/**
 * Robustly load an image URL (data URL, blob, or remote http/https) into a Data URL
 * suitable for embedding into jsPDF without tainting canvas or crashing.
 */
export async function fetchImageForPDF(
  url: string,
  caption = '',
  timestamp = '',
  caseRef = '',
  category = '',
  location = '',
  timeoutMs = 4000
): Promise<ProcessedCasePhoto | null> {
  if (!url || typeof url !== 'string') return null;

  try {
    // 1. Direct JPEG base64 Data URL
    if (url.startsWith('data:image/jpeg') || url.startsWith('data:image/jpg')) {
      const aspect = await getImageAspect(url);
      return {
        dataUrl: url,
        format: 'JPEG',
        caption,
        timestamp,
        caseRef,
        category,
        location,
        aspectRatio: aspect,
      };
    }

    // 2. In browser environment: Load into Image element and convert to normalized JPEG data URL
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const converted = await new Promise<ProcessedCasePhoto | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), timeoutMs);

        img.onload = () => {
          clearTimeout(timer);
          try {
            const canvas = document.createElement('canvas');
            const maxDim = 1000;
            let w = img.naturalWidth || 400;
            let h = img.naturalHeight || 300;
            const aspect = w / (h || 1);
            if (w > maxDim || h > maxDim) {
              const scale = Math.min(maxDim / w, maxDim / h);
              w = Math.round(w * scale);
              h = Math.round(h * scale);
            }
            canvas.width = Math.max(1, w);
            canvas.height = Math.max(1, h);
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            // Fill background white so transparency doesn't render black in JPEG
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve({
              dataUrl,
              format: 'JPEG',
              caption,
              timestamp,
              caseRef,
              category,
              location,
              aspectRatio: aspect || 1.33,
            });
          } catch {
            resolve(null);
          }
        };

        img.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };

        img.src = url;
      });

      if (converted) return converted;
    }

    // 3. Fallback: Fetch approach for web / blob URLs (if Image element direct load failed)
    if (typeof window !== 'undefined' && typeof fetch === 'function' && !url.startsWith('data:')) {
      try {
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), timeoutMs);
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timerId);
        if (resp.ok) {
          const blob = await resp.blob();
          const objectUrl = URL.createObjectURL(blob);
          const result = await fetchImageForPDF(
            objectUrl,
            caption,
            timestamp,
            caseRef,
            category,
            location,
            timeoutMs
          );
          URL.revokeObjectURL(objectUrl);
          return result;
        }
      } catch {
        // fetch fallback failed
      }
    }

    // 4. If already a data URL (e.g. in test/node environment)
    if (url.startsWith('data:image/')) {
      const isPng = url.startsWith('data:image/png');
      return {
        dataUrl: url,
        format: isPng ? 'PNG' : 'JPEG',
        caption,
        timestamp,
        caseRef,
        category,
        location,
        aspectRatio: 1.33,
      };
    }
  } catch (err) {
    console.warn('Could not process photo for PDF report:', err);
  }

  return null;
}

function getImageAspect(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve(1.33);
    }
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 4;
      const h = img.naturalHeight || 3;
      resolve(w / (h || 1));
    };
    img.onerror = () => resolve(1.33);
    img.src = dataUrl;
  });
}

/**
 * Filter cases for general report based on config
 */
export function filterCasesForReport(cases: DonkeyCase[], config: GeneralReportConfig): DonkeyCase[] {
  return cases.filter((c) => {
    // 1. Date range filter
    if (config.startDate || config.endDate) {
      const caseTime = c.reportedAt ? new Date(c.reportedAt).getTime() : 0;
      if (caseTime) {
        if (config.startDate && caseTime < config.startDate.getTime()) return false;
        if (config.endDate && caseTime > config.endDate.getTime()) return false;
      }
    }

    // 2. Sub-County filter
    if (config.subCounty && config.subCounty !== 'all') {
      const caseSubCounty = (c.location?.subCounty || '').toLowerCase();
      if (!caseSubCounty.includes(config.subCounty.toLowerCase())) return false;
    }

    // 3. Category filter
    if (config.category && config.category !== 'all') {
      if (c.category !== config.category) return false;
    }

    return true;
  });
}

/**
 * Calculate dates for preset periods
 */
export function getPresetPeriodDates(periodType: ReportPeriodType, targetOffset = 0): {
  startDate: Date;
  endDate: Date;
  label: string;
} {
  const now = new Date();

  if (periodType === 'weekly') {
    // Week starts Monday
    const currentDay = now.getDay();
    const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysSinceMonday - targetOffset * 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const startStr = weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const endStr = weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const label = targetOffset === 0 ? `Current Week (${startStr} – ${endStr})` : `Week (${startStr} – ${endStr})`;

    return { startDate: weekStart, endDate: weekEnd, label };
  }

  if (periodType === 'monthly') {
    const targetMonthDate = new Date(now.getFullYear(), now.getMonth() - targetOffset, 1);
    const monthStart = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth(), 1, 0, 0, 0);
    const monthEnd = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth() + 1, 0, 23, 59, 59);

    const label = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return { startDate: monthStart, endDate: monthEnd, label };
  }

  if (periodType === 'quarterly') {
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const targetQuarter = (currentQuarter - targetOffset + 4) % 4;
    const yearDiff = Math.floor((currentQuarter - targetOffset) / 4);
    const targetYear = now.getFullYear() + (yearDiff < 0 ? yearDiff : 0);

    const qStartMonth = targetQuarter * 3;
    const quarterStart = new Date(targetYear, qStartMonth, 1, 0, 0, 0);
    const quarterEnd = new Date(targetYear, qStartMonth + 3, 0, 23, 59, 59);

    const label = `Q${targetQuarter + 1} ${targetYear} (${quarterStart.toLocaleDateString('en-US', { month: 'short' })} – ${quarterEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
    return { startDate: quarterStart, endDate: quarterEnd, label };
  }

  if (periodType === 'annually') {
    const targetYear = now.getFullYear() - targetOffset;
    const yearStart = new Date(targetYear, 0, 1, 0, 0, 0);
    const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59);

    return { startDate: yearStart, endDate: yearEnd, label: `Calendar Year ${targetYear}` };
  }

  // Fallback / all
  const farPast = new Date(2020, 0, 1);
  const farFuture = new Date(now.getFullYear() + 1, 11, 31);
  return { startDate: farPast, endDate: farFuture, label: 'All Recorded Incidents' };
}

/**
 * -----------------------------------------------------------------------------
 * 1. SINGLE CASE REPORT PDF EXPORT
 * -----------------------------------------------------------------------------
 */
export async function exportSingleCasePDF(
  caseItem: DonkeyCase, 
  options?: { generatedBy?: string; autoDownload?: boolean }
): Promise<{ doc: jsPDF; filename: string; blob: Blob }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const runAutoTable = getAutoTable();

  // Helper for category details
  const catInfo = CATEGORY_INFO[caseItem.category] || {
    label: caseItem.category.replace('_', ' '),
    swahiliLabel: '',
  };

  // Brand Colors
  const maroon = [127, 29, 29]; // #7F1D1D
  const darkZinc = [24, 24, 27]; // #18181B
  const slateText = [71, 85, 105]; // #475569
  const lightBg = [248, 250, 252]; // #F8FAFC
  const borderGrey = [226, 232, 240]; // #E2E8F0

  let currentY = 12;

  // --- HEADER: OFFICIAL CARITAS KITUI LETTERHEAD ---
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.roundedRect(margin, currentY, contentWidth, 25, 2, 2, 'FD');

  // Embed official Caritas Kitui institutional emblem (Left)
  try {
    doc.addImage(CARITAS_KITUI_LOGO_BASE64, 'JPEG', margin + 2.5, currentY + 2.5, 20, 20);
  } catch (e) {
    console.warn('Error rendering Caritas Kitui logo:', e);
  }

  // Embed official DIRA app donkey welfare logo (Right)
  try {
    doc.addImage(DIRA_LOGO_BASE64, 'PNG', pageWidth - margin - 22.5, currentY + 2.5, 20, 20);
  } catch (e) {
    console.warn('Error rendering DIRA logo:', e);
  }

  // Letterhead Organization Title & Program Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
  doc.text('CARITAS KITUI', margin + 25, currentY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(slateText[0], slateText[1], slateText[2]);
  doc.text('Catholic Diocese of Kitui • Directorate of Social Ministry & Animal Welfare', margin + 25, currentY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text('DIRA — Donkey Incident Reporting & Emergency Response Desk', margin + 25, currentY + 17.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(slateText[0], slateText[1], slateText[2]);
  doc.text(`Emergency Hotline: ${HOTLINE_DISPLAY} (Toll-Free 24/7)`, margin + 25, currentY + 22);

  // Right Reference Box in Header
  doc.setFillColor(maroon[0], maroon[1], maroon[2]);
  doc.roundedRect(pageWidth - margin - 72, currentY + 3.5, 47, 7.5, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`CASE #${caseItem.trackingCode}`, pageWidth - margin - 48.5, currentY + 8.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text('OFFICIAL DOSSIER', pageWidth - margin - 25, currentY + 23, { align: 'right' });

  currentY += 28;

  // Banner Bar for Dossier Type
  doc.setFillColor(maroon[0], maroon[1], maroon[2]);
  doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('OFFICIAL ANIMAL WELFARE INCIDENT DOSSIER', margin + 4, currentY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(254, 226, 226);
  doc.text('Authorized Evidence & Rapid Response Record', pageWidth - margin - 4, currentY + 5.5, { align: 'right' });

  currentY += 12;

  // --- STATUS & URGENCY STRIP ---
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.roundedRect(margin, currentY, contentWidth, 14, 1.5, 1.5, 'FD');

  // Status Badge
  const statusStr = caseItem.status.toUpperCase().replace('_', ' ');
  let statusColor = [5, 150, 105]; // Green
  if (caseItem.status === 'reported' || caseItem.status === 'pending') statusColor = [220, 38, 38];
  if (caseItem.status === 'under_review') statusColor = [37, 99, 235];
  if (caseItem.status === 'investigating' || caseItem.status === 'dispatched') statusColor = [217, 119, 6];

  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(margin + 4, currentY + 3, 30, 8, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(statusStr, margin + 19, currentY + 8, { align: 'center' });

  // Urgency badge
  const urgencyStr = (caseItem.urgency || 'MEDIUM').toUpperCase() + ' PRIORITY';
  doc.setFillColor(darkZinc[0], darkZinc[1], darkZinc[2]);
  doc.roundedRect(margin + 36, currentY + 3, 32, 8, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(urgencyStr, margin + 52, currentY + 8, { align: 'center' });

  // Timestamp on right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(slateText[0], slateText[1], slateText[2]);
  const reportedFormatted = formatReportedDateTime(caseItem.reportedAt);
  doc.text(`Filed: ${reportedFormatted}`, pageWidth - margin - 4, currentY + 8.5, { align: 'right' });

  currentY += 18;

  // --- CASE TITLE & CATEGORY SECTION ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
  const splitTitle = doc.splitTextToSize(caseItem.title || 'Untitled Incident', contentWidth);
  doc.text(splitTitle, margin, currentY);
  currentY += splitTitle.length * 5.5 + 2;

  // Key Parameters Grid Table (AutoTable)
  const donkeysCount = caseItem.donkeysCount || 1;
  const reporterDisplay = caseItem.reporter?.isAnonymous
    ? 'Confidential Community Whistleblower (Anonymous)'
    : `${caseItem.reporter?.name || 'Local Citizen'} ${caseItem.reporter?.phone ? `(${caseItem.reporter.phone})` : ''}`;

  runAutoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [15, 23, 42],
      cellPadding: 3,
    },
    styles: {
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    body: [
      [
        { content: 'Case Category:', fontStyle: 'bold', styles: { fillColor: [248, 250, 252], cellWidth: 35 } },
        { content: `${catInfo.label} (${catInfo.swahiliLabel || 'N/A'})` },
        { content: 'Donkeys Affected:', fontStyle: 'bold', styles: { fillColor: [248, 250, 252], cellWidth: 35 } },
        { content: `${donkeysCount} donkey(s)`, fontStyle: 'bold', textColor: maroon },
      ],
      [
        { content: 'Sub-County / Ward:', fontStyle: 'bold', styles: { fillColor: [248, 250, 252] } },
        { content: `${caseItem.location?.subCounty || 'Kitui County'}, ${caseItem.location?.ward || 'General'}` },
        { content: 'Village / Scene:', fontStyle: 'bold', styles: { fillColor: [248, 250, 252] } },
        { content: caseItem.location?.village || 'Scene Not Specified' },
      ],
      [
        { content: 'Reporter Source:', fontStyle: 'bold', styles: { fillColor: [248, 250, 252] } },
        { content: reporterDisplay, colSpan: 3 },
      ],
      [
        { content: 'Landmark / Access:', fontStyle: 'bold', styles: { fillColor: [248, 250, 252] } },
        { content: caseItem.location?.landmark || 'No landmark specified' },
        { content: 'GPS Coordinates:', fontStyle: 'bold', styles: { fillColor: [248, 250, 252] } },
        {
          content: caseItem.location?.coordinates
            ? `${caseItem.location.coordinates.lat.toFixed(5)}, ${caseItem.location.coordinates.lng.toFixed(5)}`
            : 'Coordinates Not Provided',
        },
      ],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // --- NARRATIVE DESCRIPTION ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text('INCIDENT DESCRIPTION & OCCURRENCE DETAILS', margin, currentY);
  currentY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
  const descriptionText = caseItem.description || 'No detailed narrative provided at the time of report filing.';
  const splitDesc = doc.splitTextToSize(descriptionText, contentWidth - 4);

  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  const boxHeight = Math.max(16, splitDesc.length * 4.2 + 6);
  doc.roundedRect(margin, currentY, contentWidth, boxHeight, 1, 1, 'FD');
  doc.text(splitDesc, margin + 3, currentY + 5);

  currentY += boxHeight + 6;

  // --- OFFICER & DISPATCH ALLOCATION ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text('TASKFORCE DISPATCH & AI TRIAGE ASSESSMENT', margin, currentY);
  currentY += 4.5;

  const officerName = caseItem.assignedOfficer?.name || 'Pending Desk Assignment';
  const officerContact = caseItem.assignedOfficer
    ? `${caseItem.assignedOfficer.department} • ${caseItem.assignedOfficer.phone}`
    : 'Caritas Kitui Rapid Response Desk';

  const aiScore = caseItem.aiAllocation
    ? `Dispatched (~${caseItem.aiAllocation.distanceKm} km, Est. ETA: ~${caseItem.aiAllocation.estimatedArrivalMins} mins)`
    : 'Standard Operational Routing';

  const aiReason = caseItem.aiAllocation?.reason || 'Dispatched according to jurisdictional coverage.';

  runAutoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2 },
    body: [
      [
        { content: 'Lead Investigating Officer:', fontStyle: 'bold', styles: { cellWidth: 42, fillColor: [248, 250, 252] } },
        { content: officerName, fontStyle: 'bold' },
        { content: 'Contact Details:', fontStyle: 'bold', styles: { cellWidth: 32, fillColor: [248, 250, 252] } },
        { content: officerContact },
      ],
      [
        { content: 'Proximity Triage Index:', fontStyle: 'bold', styles: { fillColor: [248, 250, 252] } },
        { content: aiScore, colSpan: 3 },
      ],
      [
        { content: 'Dispatch Assessment:', fontStyle: 'bold', styles: { fillColor: [248, 250, 252] } },
        { content: aiReason, colSpan: 3 },
      ],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // --- RESOLUTION BLOCK IF RESOLVED ---
  if (caseItem.status === 'resolved') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(5, 150, 105);
    doc.text('INTERVENTION OUTCOME & RESOLUTION', margin, currentY);
    currentY += 4.5;

    const resSummary = caseItem.resolutionNotes || caseItem.resolution?.summary || 'Case closed successfully by response team.';
    const donkeysRecovered = caseItem.resolution?.donkeysRecovered !== undefined
      ? `${caseItem.resolution.donkeysRecovered} donkey(s) recovered/secured`
      : 'Animals secured';

    runAutoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5, lineColor: [167, 243, 208], lineWidth: 0.2 },
      body: [
        [
          { content: 'Outcome Summary:', fontStyle: 'bold', styles: { cellWidth: 35, fillColor: [236, 253, 245] } },
          { content: resSummary, colSpan: 3 },
        ],
        [
          { content: 'Recovery Count:', fontStyle: 'bold', styles: { fillColor: [236, 253, 245] } },
          { content: donkeysRecovered, fontStyle: 'bold', textColor: [4, 120, 87] },
          { content: 'Resolved At:', fontStyle: 'bold', styles: { fillColor: [236, 253, 245] } },
          { content: caseItem.resolution?.resolvedAt ? formatReportedDateTime(caseItem.resolution.resolvedAt) : 'Logged on system' },
        ],
      ],
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // --- ACTION AUDIT TRAIL LOGS ---
  const logs = caseItem.actionLogs || [];
  if (logs.length > 0) {
    // Check if we need page break
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(maroon[0], maroon[1], maroon[2]);
    doc.text('CASE TIMELINE & ACTION AUDIT TRAIL', margin, currentY);
    currentY += 4.5;

    const logRows = logs.map((l) => [
      formatReportedDateTime(l.timestamp),
      l.officer || l.officerName || 'DIRA Desk',
      l.action,
      l.notes || l.note || 'Recorded in chain of custody',
    ]);

    runAutoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Timestamp', 'Officer / Unit', 'Action Taken', 'Notes']],
      body: logRows,
      theme: 'striped',
      headStyles: { fillColor: maroon, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // --- CITIZEN PERFORMANCE RATING (if exists) ---
  if (caseItem.userRating) {
    if (currentY > pageHeight - 35) {
      doc.addPage();
      currentY = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
    doc.text('CITIZEN FEEDBACK & SERVICE EVALUATION', margin, currentY);
    currentY += 4.5;

    runAutoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5 },
      body: [
        [
          { content: 'Satisfaction Score:', fontStyle: 'bold', styles: { cellWidth: 35, fillColor: [248, 250, 252] } },
          { content: `${caseItem.userRating.rating} / 5 Stars`, fontStyle: 'bold', textColor: [217, 119, 6] },
          { content: 'Citizen Comments:', fontStyle: 'bold', styles: { cellWidth: 35, fillColor: [248, 250, 252] } },
          { content: caseItem.userRating.feedback || 'No written feedback submitted' },
        ],
      ],
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // --- PHOTOGRAPHIC EVIDENCE & FIELD DOCUMENTATION ---
  const rawSinglePhotos: { url: string; caption?: string; timestamp?: string }[] = [];
  if (caseItem.photos && Array.isArray(caseItem.photos)) {
    caseItem.photos.forEach((p: any, idx) => {
      const pUrl = typeof p === 'string' ? p : (p?.url || p?.dataUrl);
      if (pUrl && !rawSinglePhotos.some(rp => rp.url === pUrl)) {
        rawSinglePhotos.push({
          url: pUrl,
          caption: (typeof p === 'object' && p?.caption) ? p.caption : `Field Evidence Photo #${idx + 1}`,
          timestamp: (typeof p === 'object' && p?.timestamp) ? p.timestamp : caseItem.reportedAt,
        });
      }
    });
  }

  // Also include any direct photo attachment on the case item
  const extraSinglePhoto = (caseItem as any).photoUrl || (caseItem as any).photo || (caseItem as any).evidencePhoto;
  if (typeof extraSinglePhoto === 'string' && extraSinglePhoto.length > 5) {
    if (!rawSinglePhotos.some(rp => rp.url === extraSinglePhoto)) {
      rawSinglePhotos.push({
        url: extraSinglePhoto,
        caption: 'Incident Scene Photo',
        timestamp: caseItem.reportedAt,
      });
    }
  }

  if (caseItem.actionLogs && Array.isArray(caseItem.actionLogs)) {
    caseItem.actionLogs.forEach((l) => {
      if (l.evidencePhoto && !rawSinglePhotos.some(rp => rp.url === l.evidencePhoto)) {
        rawSinglePhotos.push({
          url: l.evidencePhoto,
          caption: `Enforcement Action: ${l.action}${l.notes ? ` (${l.notes})` : ''}`,
          timestamp: l.timestamp,
        });
      }
    });
  }

  if (rawSinglePhotos.length > 0) {
    const resolvedSinglePhotos = (
      await Promise.all(
        rawSinglePhotos.map((p) =>
          fetchImageForPDF(
            p.url,
            p.caption,
            p.timestamp ? formatReportedDateTime(p.timestamp) : '',
            caseItem.trackingCode,
            CATEGORY_INFO[caseItem.category]?.label || caseItem.category,
            caseItem.location?.subCounty || 'Kitui'
          )
        )
      )
    ).filter((p): p is ProcessedCasePhoto => p !== null);

    if (resolvedSinglePhotos.length > 0) {
      if (currentY > pageHeight - 65) {
        doc.addPage();
        currentY = 20;
      } else {
        currentY += 4;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(maroon[0], maroon[1], maroon[2]);
      doc.text(
        `INCIDENT PHOTOGRAPHIC EVIDENCE & FIELD DOCUMENTATION (${resolvedSinglePhotos.length} PHOTO${resolvedSinglePhotos.length > 1 ? 'S' : ''})`,
        margin,
        currentY
      );
      currentY += 4.5;

      if (resolvedSinglePhotos.length === 1) {
        // Single Hero Photo Layout
        const photo = resolvedSinglePhotos[0];
        const cardWidth = Math.min(130, contentWidth);
        const cardHeight = 72;
        const startX = margin + (contentWidth - cardWidth) / 2;

        if (currentY + cardHeight + 14 > pageHeight - 15) {
          doc.addPage();
          currentY = 20;
        }

        // Photo card container
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
        doc.roundedRect(startX, currentY, cardWidth, cardHeight + 12, 1.5, 1.5, 'FD');

        try {
          doc.addImage(photo.dataUrl, photo.format, startX + 2, currentY + 2, cardWidth - 4, cardHeight - 4);
        } catch (e) {
          console.warn('Error rendering image in single case PDF:', e);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
        doc.text(photo.caption || 'Verified Field Photography', startX + 4, currentY + cardHeight + 3);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(slateText[0], slateText[1], slateText[2]);
        doc.text(
          `DIRA Evidence Vault • Recorded: ${photo.timestamp || 'At scene'} • Verified by Field Desk`,
          startX + 4,
          currentY + cardHeight + 8
        );

        currentY += cardHeight + 16;
      } else {
        // Multi-Photo 2-Column Grid Layout
        const colWidth = (contentWidth - 6) / 2;
        const photoHeight = 52;
        const cardHeight = photoHeight + 14;

        for (let idx = 0; idx < resolvedSinglePhotos.length; idx += 2) {
          if (currentY + cardHeight + 8 > pageHeight - 15) {
            doc.addPage();
            currentY = 20;
          }

          const photoA = resolvedSinglePhotos[idx];
          const photoB = resolvedSinglePhotos[idx + 1];

          // Photo A (Left Column)
          const xA = margin;
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
          doc.roundedRect(xA, currentY, colWidth, cardHeight, 1.5, 1.5, 'FD');

          try {
            doc.addImage(photoA.dataUrl, photoA.format, xA + 1.5, currentY + 1.5, colWidth - 3, photoHeight - 3);
          } catch (e) {
            console.warn('Error adding photo A:', e);
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
          doc.text(photoA.caption || `Evidence Photo #${idx + 1}`, xA + 3, currentY + photoHeight + 4);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.8);
          doc.setTextColor(slateText[0], slateText[1], slateText[2]);
          doc.text(
            `Recorded: ${photoA.timestamp || 'At scene'} • Chain of Custody Verified`,
            xA + 3,
            currentY + photoHeight + 9.5
          );

          // Photo B (Right Column, if exists)
          if (photoB) {
            const xB = margin + colWidth + 6;
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
            doc.roundedRect(xB, currentY, colWidth, cardHeight, 1.5, 1.5, 'FD');

            try {
              doc.addImage(photoB.dataUrl, photoB.format, xB + 1.5, currentY + 1.5, colWidth - 3, photoHeight - 3);
            } catch (e) {
              console.warn('Error adding photo B:', e);
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
            doc.text(photoB.caption || `Evidence Photo #${idx + 2}`, xB + 3, currentY + photoHeight + 4);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.8);
            doc.setTextColor(slateText[0], slateText[1], slateText[2]);
            doc.text(
              `Recorded: ${photoB.timestamp || 'At scene'} • Chain of Custody Verified`,
              xB + 3,
              currentY + photoHeight + 9.5
            );
          }

          currentY += cardHeight + 5;
        }
      }
    }
  }

  // --- PAGE NUMBERS & CERTIFICATION FOOTER ACROSS ALL PAGES ---
  const totalPages = doc.getNumberOfPages();
  const generatedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    if (i > 1) {
      // Running header on page 2+ with Caritas Kitui & DIRA logos
      try {
        doc.addImage(CARITAS_KITUI_LOGO_BASE64, 'JPEG', margin, 5.5, 7.5, 7.5);
      } catch (e) {
        console.warn('Error adding Caritas logo to header:', e);
      }
      try {
        doc.addImage(DIRA_LOGO_BASE64, 'PNG', margin + 8.5, 5.5, 7.5, 7.5);
      } catch (e) {
        console.warn('Error adding DIRA logo to header:', e);
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
      doc.text('CARITAS KITUI • DIRA Incident Dossier', margin + 18, 10.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(slateText[0], slateText[1], slateText[2]);
      doc.text(`Case #${caseItem.trackingCode}`, pageWidth - margin, 10.5, { align: 'right' });
      doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
      doc.setLineWidth(0.2);
      doc.line(margin, 15, pageWidth - margin, 15);
    }

    // Bottom Divider
    doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(slateText[0], slateText[1], slateText[2]);
    doc.text(
      `Caritas Kitui • Kitui County Animal Welfare Taskforce • Official Case Record #${caseItem.trackingCode} • Generated: ${generatedAt}`,
      margin,
      pageHeight - 8
    );

    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  const filename = `DIRA_Case_Report_${caseItem.trackingCode}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');

  if (options?.autoDownload !== false) {
    triggerPDFDownload(blob, filename);
  }

  return { doc, filename, blob };
}

/**
 * -----------------------------------------------------------------------------
 * 2. GENERAL REPORT FOR ALL CASES (WEEKLY, MONTHLY, QUARTERLY, ANNUALLY)
 * -----------------------------------------------------------------------------
 */
export async function exportGeneralReportPDF(
  allCases: DonkeyCase[],
  config: GeneralReportConfig,
  options?: { autoDownload?: boolean }
): Promise<{ doc: jsPDF; filename: string; blob: Blob }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const runAutoTable = getAutoTable();

  // Filter cases matching config
  const filteredCases = filterCasesForReport(allCases, config);

  // Compute aggregate statistics
  const totalCases = filteredCases.length;
  let totalDonkeys = 0;
  let resolvedCases = 0;
  let criticalCases = 0;
  let activeCases = 0;
  let totalDonkeysRecovered = 0;

  const categoryCounts: Record<string, { count: number; donkeys: number }> = {
    donkey_theft: { count: 0, donkeys: 0 },
    bush_slaughter: { count: 0, donkeys: 0 },
    trafficking: { count: 0, donkeys: 0 },
    general_abuse: { count: 0, donkeys: 0 },
    other: { count: 0, donkeys: 0 },
  };

  const subCountyCounts: Record<string, { count: number; donkeys: number; resolved: number }> = {};

  filteredCases.forEach((c) => {
    const dk = c.donkeysCount || 1;
    totalDonkeys += dk;

    if (c.status === 'resolved') {
      resolvedCases += 1;
      totalDonkeysRecovered += (c.resolution?.donkeysRecovered || dk);
    } else if (c.status === 'investigating' || c.status === 'dispatched' || c.status === 'under_review') {
      activeCases += 1;
    }

    if (c.urgency === 'critical' || c.isEmergency) {
      criticalCases += 1;
    }

    // Category tally
    const cat = c.category || 'other';
    if (!categoryCounts[cat]) {
      categoryCounts[cat] = { count: 0, donkeys: 0 };
    }
    categoryCounts[cat].count += 1;
    categoryCounts[cat].donkeys += dk;

    // Sub-county tally
    const sc = c.location?.subCounty || 'Kitui Central';
    if (!subCountyCounts[sc]) {
      subCountyCounts[sc] = { count: 0, donkeys: 0, resolved: 0 };
    }
    subCountyCounts[sc].count += 1;
    subCountyCounts[sc].donkeys += dk;
    if (c.status === 'resolved') {
      subCountyCounts[sc].resolved += 1;
    }
  });

  const resolutionRate = totalCases > 0 ? ((resolvedCases / totalCases) * 100).toFixed(1) : '0.0';

  // Palette
  const maroon = [127, 29, 29];
  const darkZinc = [24, 24, 27];
  const slateText = [71, 85, 105];
  const borderGrey = [226, 232, 240];

  let currentY = 12;

  // --- HEADER: OFFICIAL CARITAS KITUI & DIRA DUAL LETTERHEAD ---
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.roundedRect(margin, currentY, contentWidth, 25, 2, 2, 'FD');

  // Embed official Caritas Kitui institutional emblem (Left)
  try {
    doc.addImage(CARITAS_KITUI_LOGO_BASE64, 'JPEG', margin + 2.5, currentY + 2.5, 20, 20);
  } catch (e) {
    console.warn('Error adding Caritas logo:', e);
  }

  // Embed official DIRA app donkey protection logo (Right)
  try {
    doc.addImage(DIRA_LOGO_BASE64, 'PNG', pageWidth - margin - 22.5, currentY + 2.5, 20, 20);
  } catch (e) {
    console.warn('Error adding DIRA logo:', e);
  }

  // Letterhead Organization Title & Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
  doc.text('CARITAS KITUI', margin + 25, currentY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(slateText[0], slateText[1], slateText[2]);
  doc.text('Catholic Diocese of Kitui • Directorate of Social Ministry & Animal Welfare', margin + 25, currentY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text('DIRA — Donkey Incident Reporting & Comprehensive Interventions Program', margin + 25, currentY + 17.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(slateText[0], slateText[1], slateText[2]);
  doc.text(`Emergency Hotline: ${HOTLINE_DISPLAY} (Toll-Free 24/7)`, margin + 25, currentY + 22);

  // Frequency Badge on right
  const periodTypeUpper = config.periodType.toUpperCase();
  doc.setFillColor(maroon[0], maroon[1], maroon[2]);
  doc.roundedRect(pageWidth - margin - 72, currentY + 3.5, 47, 7.5, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`${periodTypeUpper} AUDIT REPORT`, pageWidth - margin - 48.5, currentY + 8.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text('OFFICIAL REPORT', pageWidth - margin - 25, currentY + 23, { align: 'right' });

  currentY += 28;

  // Banner Bar for Report Subtitle
  doc.setFillColor(maroon[0], maroon[1], maroon[2]);
  doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('COUNTY DONKEY WELFARE AUDIT REPORT', margin + 4, currentY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(254, 226, 226);
  doc.text('Official Comprehensive Field Interventions & Recovery Record', pageWidth - margin - 4, currentY + 5.5, { align: 'right' });

  currentY += 12;

  // --- PERIOD & SCOPE METADATA BAR ---
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.roundedRect(margin, currentY, contentWidth, 13, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
  doc.text(`Reporting Horizon: `, margin + 4, currentY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text(config.periodLabel, margin + 35, currentY + 8);

  const scopeLabel = config.subCounty && config.subCounty !== 'all' ? `Sub-County: ${config.subCounty}` : 'Scope: Kitui County (All Sub-Counties)';
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slateText[0], slateText[1], slateText[2]);
  doc.text(scopeLabel, pageWidth - margin - 4, currentY + 8, { align: 'right' });

  currentY += 17;

  // --- EXECUTIVE KPI SUMMARY CARDS (AutoTable Grid) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text('EXECUTIVE INTERVENTION SUMMARY', margin, currentY);
  currentY += 4;

  runAutoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3, halign: 'center', lineColor: borderGrey, lineWidth: 0.2 },
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
    head: [['Total Incidents', 'Donkeys Affected', 'Donkeys Recovered', 'Resolution Rate', 'Active / In-Field', 'Critical Alerts']],
    body: [
      [
        { content: `${totalCases}`, fontStyle: 'bold', styles: { fontSize: 13, textColor: darkZinc } },
        { content: `${totalDonkeys}`, fontStyle: 'bold', styles: { fontSize: 13, textColor: maroon } },
        { content: `${totalDonkeysRecovered}`, fontStyle: 'bold', styles: { fontSize: 13, textColor: [5, 150, 105] } },
        { content: `${resolutionRate}%`, fontStyle: 'bold', styles: { fontSize: 13, textColor: [5, 150, 105] } },
        { content: `${activeCases}`, fontStyle: 'bold', styles: { fontSize: 13, textColor: [217, 119, 6] } },
        { content: `${criticalCases}`, fontStyle: 'bold', styles: { fontSize: 13, textColor: [220, 38, 38] } },
      ],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // --- INCIDENT BREAKDOWN BY CATEGORY ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text('1. INCIDENT BREAKDOWN BY CRIME / WELFARE CATEGORY', margin, currentY);
  currentY += 4;

  const categoryRows = Object.keys(categoryCounts).map((catKey) => {
    const cat = CATEGORY_INFO[catKey as CaseCategory] || { label: catKey, swahiliLabel: '' };
    const stat = categoryCounts[catKey];
    const percentage = totalCases > 0 ? ((stat.count / totalCases) * 100).toFixed(1) : '0.0';
    return [
      cat.label,
      cat.swahiliLabel || '—',
      stat.count.toString(),
      stat.donkeys.toString(),
      `${percentage}%`,
    ];
  });

  runAutoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['Category', 'Swahili Term', 'Reported Cases', 'Donkeys Affected', '% of Total Volume']],
    body: categoryRows,
    theme: 'striped',
    headStyles: { fillColor: darkZinc, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      2: { halign: 'center', fontStyle: 'bold' },
      3: { halign: 'center', fontStyle: 'bold' },
      4: { halign: 'center' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // --- SUB-COUNTY DISTRIBUTION ---
  const subCounties = Object.keys(subCountyCounts);
  if (subCounties.length > 0) {
    if (currentY > pageHeight - 55) {
      doc.addPage();
      currentY = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(maroon[0], maroon[1], maroon[2]);
    doc.text('2. GEOGRAPHIC DISTRIBUTION ACROSS KITUI SUB-COUNTIES', margin, currentY);
    currentY += 4;

    const subCountyRows = subCounties.map((sc) => {
      const data = subCountyCounts[sc];
      const resPct = data.count > 0 ? `${((data.resolved / data.count) * 100).toFixed(0)}%` : '0%';
      return [
        sc,
        data.count.toString(),
        data.donkeys.toString(),
        data.resolved.toString(),
        resPct,
      ];
    });

    runAutoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Sub-County Area', 'Incidents Filed', 'Donkeys Affected', 'Cases Resolved', 'Local Resolution %']],
      body: subCountyRows,
      theme: 'striped',
      headStyles: { fillColor: maroon, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        1: { halign: 'center', fontStyle: 'bold' },
        2: { halign: 'center', fontStyle: 'bold' },
        3: { halign: 'center' },
        4: { halign: 'center', fontStyle: 'bold' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // --- COMPLETE CASE AUDIT LEDGER (TABULAR CASE CATALOG) ---
  if (currentY > pageHeight - 45) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text(`3. CASE LEDGER CATALOG (${filteredCases.length} RECORDED INCIDENTS)`, margin, currentY);
  currentY += 4;

  const caseRows = filteredCases.map((c) => {
    const catLabel = CATEGORY_INFO[c.category]?.label || c.category;
    const loc = `${c.location?.subCounty || 'Kitui'}${c.location?.village ? `, ${c.location.village}` : ''}`;
    const dateFormatted = c.reportedAt ? new Date(c.reportedAt).toLocaleDateString('en-GB') : '—';
    const statusText = c.status.replace('_', ' ').toUpperCase();
    const officer = c.assignedOfficer?.name || 'Unassigned';

    return [
      `#${c.trackingCode}`,
      dateFormatted,
      catLabel,
      loc,
      (c.donkeysCount || 1).toString(),
      statusText,
      officer,
    ];
  });

  runAutoTable(doc, {
    startY: currentY,
    margin: { top: 18, left: margin, right: margin, bottom: 16 },
    head: [['Ref Code', 'Date', 'Category', 'Location / Village', 'Dk Count', 'Status', 'Officer']],
    body: caseRows,
    theme: 'grid',
    headStyles: { fillColor: darkZinc, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: maroon },
      4: { halign: 'center' },
      5: { fontStyle: 'bold' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // --- TASKFORCE OBSERVATIONS & DIRECTIVES ---
  if (currentY > pageHeight - 40) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(maroon[0], maroon[1], maroon[2]);
  doc.text('4. STRATEGIC TASKFORCE OBSERVATIONS & COMMUNITY DIRECTIVES', margin, currentY);
  currentY += 4.5;

  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.roundedRect(margin, currentY, contentWidth, 22, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(slateText[0], slateText[1], slateText[2]);
  const observations = [
    `• Community Reporting Index: ${totalCases} incidents reported, impacting ${totalDonkeys} working donkeys across Kitui County.`,
    `• Recovery & Enforcement: Current resolution standing at ${resolutionRate}%, with ${totalDonkeysRecovered} donkeys recovered and returned to owners.`,
    `• Hotspot Monitoring: Night riverbed patrols and transit checkpoint inspections remain active across priority border corridors.`,
    `• Emergency Hotline: Community members are urged to utilize toll-free hotline ${HOTLINE_DISPLAY} for rapid intervention.`,
  ];
  doc.text(observations, margin + 4, currentY + 5);

  // --- 5. FIELD PHOTOGRAPHIC EVIDENCE & CASE VISUAL DOCUMENTATION ---
  // If cases in this period (Weekly, Monthly, Quarterly, Annually, etc.) have photos, include them!
  const generalReportRawPhotos: {
    url: string;
    caption: string;
    timestamp: string;
    caseRef: string;
    category: string;
    location: string;
  }[] = [];

  for (const c of filteredCases) {
    const locStr = `${c.location?.subCounty || 'Kitui'}${c.location?.village ? `, ${c.location.village}` : ''}`;
    const catLabel = CATEGORY_INFO[c.category]?.label || c.category;
    const dateFormatted = c.reportedAt ? new Date(c.reportedAt).toLocaleDateString('en-GB') : '';

    if (c.photos && Array.isArray(c.photos)) {
      c.photos.forEach((p: any, idx) => {
        const pUrl = typeof p === 'string' ? p : (p?.url || p?.dataUrl);
        if (pUrl && !generalReportRawPhotos.some(rp => rp.url === pUrl)) {
          generalReportRawPhotos.push({
            url: pUrl,
            caption: (typeof p === 'object' && p?.caption) ? p.caption : `${catLabel} — Scene Photo #${idx + 1}`,
            timestamp: (typeof p === 'object' && p?.timestamp) ? formatReportedDateTime(p.timestamp) : dateFormatted,
            caseRef: c.trackingCode,
            category: catLabel,
            location: locStr,
          });
        }
      });
    }

    // Also support any standalone photo property or evidencePhoto on case
    const extraCasePhoto = (c as any).photoUrl || (c as any).photo || (c as any).evidencePhoto;
    if (typeof extraCasePhoto === 'string' && extraCasePhoto.length > 5) {
      if (!generalReportRawPhotos.some(rp => rp.url === extraCasePhoto)) {
        generalReportRawPhotos.push({
          url: extraCasePhoto,
          caption: `${catLabel} — Incident Scene Photo`,
          timestamp: dateFormatted,
          caseRef: c.trackingCode,
          category: catLabel,
          location: locStr,
        });
      }
    }

    if (c.actionLogs && Array.isArray(c.actionLogs)) {
      c.actionLogs.forEach((l) => {
        if (l.evidencePhoto && !generalReportRawPhotos.some(rp => rp.url === l.evidencePhoto)) {
          generalReportRawPhotos.push({
            url: l.evidencePhoto,
            caption: `Action Log Evidence: ${l.action}`,
            timestamp: l.timestamp ? formatReportedDateTime(l.timestamp) : dateFormatted,
            caseRef: c.trackingCode,
            category: catLabel,
            location: locStr,
          });
        }
      });
    }
  }

  if (generalReportRawPhotos.length > 0) {
    const resolvedGenPhotos = (
      await Promise.all(
        generalReportRawPhotos.map((p) =>
          fetchImageForPDF(p.url, p.caption, p.timestamp, p.caseRef, p.category, p.location)
        )
      )
    ).filter((p): p is ProcessedCasePhoto => p !== null);

    if (resolvedGenPhotos.length > 0) {
      // Start photo gallery on fresh page
      doc.addPage();
      currentY = 20;

      // Section Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(maroon[0], maroon[1], maroon[2]);
      doc.text(
        `5. FIELD PHOTOGRAPHIC EVIDENCE & CASE VISUAL DOCUMENTATION (${resolvedGenPhotos.length} PHOTO${resolvedGenPhotos.length > 1 ? 'S' : ''})`,
        margin,
        currentY
      );
      currentY += 4;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(slateText[0], slateText[1], slateText[2]);
      doc.text(
        `Documented field photography and visual evidence recorded during the ${config.periodLabel} reporting period.`,
        margin,
        currentY
      );
      currentY += 6;

      const colWidth = (contentWidth - 6) / 2;
      const photoHeight = 48;
      const cardHeight = photoHeight + 16;

      for (let idx = 0; idx < resolvedGenPhotos.length; idx += 2) {
        if (currentY + cardHeight + 6 > pageHeight - 15) {
          doc.addPage();
          currentY = 20;
        }

        const pA = resolvedGenPhotos[idx];
        const pB = resolvedGenPhotos[idx + 1];

        // Left Card
        const xA = margin;
        doc.setFillColor(250, 250, 250);
        doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
        doc.roundedRect(xA, currentY, colWidth, cardHeight, 1.5, 1.5, 'FD');

        try {
          doc.addImage(pA.dataUrl, pA.format, xA + 1.5, currentY + 1.5, colWidth - 3, photoHeight - 3);
        } catch (e) {
          console.warn('Error adding image pA to general report:', e);
        }

        // Card Top Badge inside photo: Case Tracking Code
        doc.setFillColor(maroon[0], maroon[1], maroon[2]);
        doc.roundedRect(xA + 3, currentY + 3, 26, 4.5, 0.8, 0.8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.8);
        doc.setTextColor(255, 255, 255);
        doc.text(`#${pA.caseRef}`, xA + 16, currentY + 6.2, { align: 'center' });

        // Details beneath photo
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
        doc.text(pA.caption || 'Field Incident Photo', xA + 3, currentY + photoHeight + 4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(slateText[0], slateText[1], slateText[2]);
        doc.text(`${pA.category || 'Incident'} • ${pA.location || 'Kitui County'}`, xA + 3, currentY + photoHeight + 8);
        doc.text(`Date: ${pA.timestamp || 'Recorded'} • Caritas Kitui Evidence Vault`, xA + 3, currentY + photoHeight + 12);

        // Right Card (if exists)
        if (pB) {
          const xB = margin + colWidth + 6;
          doc.setFillColor(250, 250, 250);
          doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
          doc.roundedRect(xB, currentY, colWidth, cardHeight, 1.5, 1.5, 'FD');

          try {
            doc.addImage(pB.dataUrl, pB.format, xB + 1.5, currentY + 1.5, colWidth - 3, photoHeight - 3);
          } catch (e) {
            console.warn('Error adding image pB to general report:', e);
          }

          // Card Top Badge
          doc.setFillColor(maroon[0], maroon[1], maroon[2]);
          doc.roundedRect(xB + 3, currentY + 3, 26, 4.5, 0.8, 0.8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.8);
          doc.setTextColor(255, 255, 255);
          doc.text(`#${pB.caseRef}`, xB + 16, currentY + 6.2, { align: 'center' });

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
          doc.text(pB.caption || 'Field Incident Photo', xB + 3, currentY + photoHeight + 4);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.2);
          doc.setTextColor(slateText[0], slateText[1], slateText[2]);
          doc.text(`${pB.category || 'Incident'} • ${pB.location || 'Kitui County'}`, xB + 3, currentY + photoHeight + 8);
          doc.text(`Date: ${pB.timestamp || 'Recorded'} • Caritas Kitui Evidence Vault`, xB + 3, currentY + photoHeight + 12);
        }

        currentY += cardHeight + 5;
      }
    }
  }

  // --- PAGE NUMBERS & CERTIFICATION FOOTER ---
  const totalPages = doc.getNumberOfPages();
  const generatedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    if (i > 1) {
      // Running header on page 2+ with Caritas Kitui & DIRA logos
      try {
        doc.addImage(CARITAS_KITUI_LOGO_BASE64, 'JPEG', margin, 5.5, 7.5, 7.5);
      } catch (e) {
        console.warn('Error adding Caritas logo to header:', e);
      }
      try {
        doc.addImage(DIRA_LOGO_BASE64, 'PNG', margin + 8.5, 5.5, 7.5, 7.5);
      } catch (e) {
        console.warn('Error adding DIRA logo to header:', e);
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(darkZinc[0], darkZinc[1], darkZinc[2]);
      doc.text('CARITAS KITUI • DIRA County Donkey Welfare Audit Report', margin + 18, 10.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(slateText[0], slateText[1], slateText[2]);
      doc.text(config.periodLabel, pageWidth - margin, 10.5, { align: 'right' });
      doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
      doc.setLineWidth(0.2);
      doc.line(margin, 15, pageWidth - margin, 15);
    }

    doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(slateText[0], slateText[1], slateText[2]);
    doc.text(
      `Caritas Kitui • Kitui County Animal Welfare Taskforce • General Audit Report (${config.periodLabel}) • Generated: ${generatedAt}`,
      margin,
      pageHeight - 8
    );

    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  const cleanPeriod = config.periodType.toLowerCase();
  const filename = `DIRA_${cleanPeriod}_report_${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');

  if (options?.autoDownload !== false) {
    triggerPDFDownload(blob, filename);
  }

  return { doc, filename, blob };
}
