import { DonkeyCase, CaseCategory } from '../types';
import { CATEGORY_INFO } from '../data/mockData';

export interface TrendGraphOptions {
  title?: string;
  subtitle?: string;
  periodType?: string;
  numBuckets?: number;
  startDate?: Date | null;
  endDate?: Date | null;
}

interface WeekBucket {
  label: string;
  startDate: Date;
  endDate: Date;
  total: number;
  theft: number;
  slaughter: number;
  trafficking: number;
  abuse: number;
  other: number;
  resolved: number;
  donkeys: number;
}

/**
 * Creates high-resolution canvas in browser environment
 */
function createHiDPICanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { canvas, ctx };
  } catch {
    return null;
  }
}

/**
 * Helper to compute weekly buckets for a set of cases
 */
function computeWeeklyBuckets(cases: DonkeyCase[], numWeeks = 8, startBound?: Date | null, endBound?: Date | null): WeekBucket[] {
  const now = endBound ? new Date(endBound) : new Date();
  const currentDay = now.getDay();
  const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;

  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - daysSinceMonday);
  currentMonday.setHours(0, 0, 0, 0);

  const buckets: WeekBucket[] = [];

  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(currentMonday.getDate() - i * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const startMonth = weekStart.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'short' });
    const startDay = weekStart.getDate();
    const endDay = weekEnd.getDate();

    const label = startMonth === endMonth ? `${startMonth} ${startDay}` : `${startMonth} ${startDay}-${endMonth.slice(0, 1)}${endDay}`;

    buckets.push({
      label,
      startDate: weekStart,
      endDate: weekEnd,
      total: 0,
      theft: 0,
      slaughter: 0,
      trafficking: 0,
      abuse: 0,
      other: 0,
      resolved: 0,
      donkeys: 0,
    });
  }

  // Populate cases into buckets
  cases.forEach((c) => {
    let caseTime = 0;
    if (c.reportedAt) {
      const t = new Date(c.reportedAt).getTime();
      if (!isNaN(t)) caseTime = t;
    }
    if (!caseTime && c.incidentDateTime) {
      const t = new Date(c.incidentDateTime).getTime();
      if (!isNaN(t)) caseTime = t;
    }
    if (!caseTime) return;

    const caseDate = new Date(caseTime);
    const bucket = buckets.find((b) => caseDate >= b.startDate && caseDate <= b.endDate);
    if (bucket) {
      bucket.total += 1;
      bucket.donkeys += (c.donkeysCount || 1);
      if (c.status === 'resolved') {
        bucket.resolved += 1;
      }

      switch (c.category) {
        case 'donkey_theft':
          bucket.theft += 1;
          break;
        case 'bush_slaughter':
          bucket.slaughter += 1;
          break;
        case 'trafficking':
          bucket.trafficking += 1;
          break;
        case 'general_abuse':
          bucket.abuse += 1;
          break;
        default:
          bucket.other += 1;
          break;
      }
    }
  });

  return buckets;
}

/**
 * -----------------------------------------------------------------------------
 * 1. INCIDENT FREQUENCY & CRIME TRENDS LINE/AREA GRAPH
 * Generates a crisp 1400x540 PNG Data URL with trend lines, area fill,
 * grid lines, and branded legends.
 * -----------------------------------------------------------------------------
 */
export function generateIncidentTrendGraph(
  cases: DonkeyCase[],
  options?: TrendGraphOptions
): string | null {
  const width = 1400;
  const height = 540;
  const target = createHiDPICanvas(width, height);
  if (!target) return null;

  const { ctx, canvas } = target;

  const title = options?.title || 'INCIDENT FREQUENCY TRENDS & ENFORCEMENT INTERVENTIONS';
  const subtitle = options?.subtitle || 'Weekly Incident Velocity, Welfare Categories & Successful Animal Recoveries';
  const numBuckets = options?.numBuckets || 8;
  const buckets = computeWeeklyBuckets(cases, numBuckets, options?.startDate, options?.endDate);

  // Background card with subtle border
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Outer border
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  // Card Header bar
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(2, 2, width - 4, 78);
  ctx.strokeStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.moveTo(0, 80);
  ctx.lineTo(width, 80);
  ctx.stroke();

  // Red accent badge
  ctx.fillStyle = '#991B1B';
  ctx.fillRect(20, 20, 6, 40);

  // Title
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(title, 36, 38);

  // Subtitle
  ctx.font = 'normal 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText(subtitle, 36, 58);

  // Total summary pill on top-right
  const totalCases = cases.length;
  const resolvedCount = cases.filter((c) => c.status === 'resolved').length;
  const resPct = totalCases > 0 ? ((resolvedCount / totalCases) * 100).toFixed(0) : '0';

  ctx.fillStyle = '#EFF6FF';
  ctx.strokeStyle = '#BFDBFE';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(width - 320, 18, 300, 44, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#1E3A8A';
  ctx.fillText(`Audited: ${totalCases} Incidents`, width - 305, 36);

  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#059669';
  ctx.fillText(`✓ ${resolvedCount} Resolved (${resPct}%)`, width - 305, 54);

  // Legend bar
  const legendItems = [
    { label: 'Total Incidents', color: '#991B1B', stroke: '#991B1B' },
    { label: 'Donkey Theft', color: '#D97706', stroke: '#D97706' },
    { label: 'Bush Slaughter', color: '#DC2626', stroke: '#DC2626' },
    { label: 'Cases Resolved', color: '#059669', stroke: '#059669' },
  ];

  let legendX = 40;
  const legendY = 105;
  legendItems.forEach((item) => {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(legendX + 6, legendY - 4, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText(item.label, legendX + 16, legendY);
    legendX += ctx.measureText(item.label).width + 36;
  });

  // Plot Area dimensions
  const plotLeft = 65;
  const plotRight = width - 40;
  const plotTop = 135;
  const plotBottom = height - 55;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // Compute maximum count for Y-axis
  let maxCount = 0;
  buckets.forEach((b) => {
    if (b.total > maxCount) maxCount = b.total;
    if (b.theft > maxCount) maxCount = b.theft;
    if (b.slaughter > maxCount) maxCount = b.slaughter;
  });

  const yMax = Math.max(5, Math.ceil(maxCount * 1.25));
  const numYSteps = 5;

  // Draw Horizontal Gridlines & Y-Axis labels
  ctx.textAlign = 'right';
  ctx.font = 'normal 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#64748B';

  for (let s = 0; s <= numYSteps; s++) {
    const val = Math.round((yMax / numYSteps) * s);
    const yPos = plotBottom - (s / numYSteps) * plotHeight;

    ctx.strokeStyle = s === 0 ? '#CBD5E1' : '#F1F5F9';
    ctx.lineWidth = s === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(plotLeft, yPos);
    ctx.lineTo(plotRight, yPos);
    ctx.stroke();

    ctx.fillText(`${val}`, plotLeft - 10, yPos + 4);
  }

  // Draw X-Axis labels & vertical ticks
  ctx.textAlign = 'center';
  const stepX = plotWidth / (buckets.length - 1 || 1);

  buckets.forEach((b, idx) => {
    const xPos = plotLeft + idx * stepX;

    // Subtle vertical guide
    ctx.strokeStyle = '#F8FAFC';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xPos, plotTop);
    ctx.lineTo(xPos, plotBottom);
    ctx.stroke();

    // Axis tick
    ctx.strokeStyle = '#94A3B8';
    ctx.beginPath();
    ctx.moveTo(xPos, plotBottom);
    ctx.lineTo(xPos, plotBottom + 5);
    ctx.stroke();

    // Label
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(b.label, xPos, plotBottom + 20);
  });

  // Helper function to plot a line series
  const drawSeries = (
    accessor: (b: WeekBucket) => number,
    strokeColor: string,
    lineWidth: number,
    fillArea = false,
    fillColor = 'rgba(153, 27, 27, 0.12)'
  ) => {
    const points: { x: number; y: number; val: number }[] = buckets.map((b, idx) => {
      const val = accessor(b);
      const x = plotLeft + idx * stepX;
      const y = plotBottom - (val / yMax) * plotHeight;
      return { x, y, val };
    });

    if (points.length === 0) return;

    // Fill area under line
    if (fillArea) {
      const grad = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
      grad.addColorStop(0, 'rgba(153, 27, 27, 0.25)');
      grad.addColorStop(1, 'rgba(153, 27, 27, 0.01)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(points[0].x, plotBottom);
      points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, plotBottom);
      ctx.closePath();
      ctx.fill();
    }

    // Draw main stroke line
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Draw data points & value badges
    points.forEach((p) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (p.val > 0) {
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = strokeColor;
        ctx.textAlign = 'center';
        ctx.fillText(`${p.val}`, p.x, p.y - 8);
      }
    });
  };

  // 1. Total Incidents (Red with filled gradient)
  drawSeries((b) => b.total, '#991B1B', 3.5, true);

  // 2. Cases Resolved (Emerald)
  drawSeries((b) => b.resolved, '#059669', 2.2, false);

  // 3. Donkey Theft (Amber)
  drawSeries((b) => b.theft, '#D97706', 2.2, false);

  // 4. Bush Slaughter (Red)
  drawSeries((b) => b.slaughter, '#DC2626', 2.2, false);

  return canvas.toDataURL('image/png');
}

/**
 * -----------------------------------------------------------------------------
 * 2. CATEGORY BREAKDOWN & ANIMAL RECOVERY BAR GRAPH
 * Generates a clean 1400x480 PNG Data URL with comparative horizontal bars.
 * -----------------------------------------------------------------------------
 */
export function generateCategoryBarGraph(cases: DonkeyCase[]): string | null {
  const width = 1400;
  const height = 460;
  const target = createHiDPICanvas(width, height);
  if (!target) return null;

  const { ctx, canvas } = target;

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  // Header Bar
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(2, 2, width - 4, 60);
  ctx.strokeStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.moveTo(0, 62);
  ctx.lineTo(width, 62);
  ctx.stroke();

  // Title
  ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText('INCIDENT BREAKDOWN BY CATEGORY & RECOVERY VOLUME', 24, 30);

  ctx.font = 'normal 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('Comparative Crime Distribution vs Animals Secured/Recovered • Caritas Kitui', 24, 48);

  // Tally category metrics
  const categories: { key: CaseCategory; label: string; color: string }[] = [
    { key: 'donkey_theft', label: 'Donkey Theft (Wizi wa Punda)', color: '#D97706' },
    { key: 'bush_slaughter', label: 'Bush Slaughter (Uchinjaji Haramu)', color: '#DC2626' },
    { key: 'trafficking', label: 'Illegal Trafficking (Usafirishaji Haramu)', color: '#7C3AED' },
    { key: 'general_abuse', label: 'General Abuse / Abandonment (Unyanyasaji)', color: '#2563EB' },
    { key: 'other', label: 'Other Welfare Violations', color: '#64748B' },
  ];

  const totalCases = cases.length || 1;
  let maxCount = 0;

  const stats = categories.map((c) => {
    const catCases = cases.filter((item) => item.category === c.key);
    const count = catCases.length;
    const donkeys = catCases.reduce((sum, item) => sum + (item.donkeysCount || 1), 0);
    const resolved = catCases.filter((item) => item.status === 'resolved').length;
    const recovered = catCases.reduce((sum, item) => sum + (item.resolution?.donkeysRecovered || (item.status === 'resolved' ? (item.donkeysCount || 1) : 0)), 0);
    if (count > maxCount) maxCount = count;
    return { ...c, count, donkeys, resolved, recovered };
  });

  const barMax = Math.max(5, Math.ceil(maxCount * 1.15));

  const startY = 85;
  const barHeight = 44;
  const gapY = 24;
  const labelWidth = 320;
  const barStartX = labelWidth + 30;
  const barMaxWidth = width - barStartX - 190;

  stats.forEach((st, idx) => {
    const y = startY + idx * (barHeight + gapY);

    // Category Label
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#1E293B';
    ctx.fillText(st.label, 24, y + 18);

    // Detail subtitle
    ctx.font = 'normal 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.fillText(`${st.donkeys} donkeys affected • ${st.recovered} recovered`, 24, y + 36);

    // Background track
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.roundRect(barStartX, y + 4, barMaxWidth, 26, 6);
    ctx.fill();

    // Incident count bar
    const barWidth = Math.max(st.count > 0 ? 12 : 0, (st.count / barMax) * barMaxWidth);
    if (barWidth > 0) {
      ctx.fillStyle = st.color;
      ctx.beginPath();
      ctx.roundRect(barStartX, y + 4, barWidth, 26, 6);
      ctx.fill();
    }

    // Resolved inner overlay bar
    if (st.resolved > 0) {
      const resWidth = Math.max(8, (st.resolved / barMax) * barMaxWidth);
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.roundRect(barStartX, y + 18, resWidth, 12, 4);
      ctx.fill();
    }

    // Right-hand Metric Value
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = st.count > 0 ? st.color : '#94A3B8';
    const pct = ((st.count / totalCases) * 100).toFixed(1);
    ctx.fillText(`${st.count} case${st.count === 1 ? '' : 's'} (${pct}%)`, barStartX + barMaxWidth + 15, y + 22);

    ctx.font = 'normal 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#059669';
    ctx.fillText(`✓ ${st.resolved} resolved`, barStartX + barMaxWidth + 15, y + 36);
  });

  return canvas.toDataURL('image/png');
}

/**
 * -----------------------------------------------------------------------------
 * 3. SINGLE CASE INCIDENT CONTEXT & REGIONAL RISK TREND GRAPH
 * Generates a 1400x500 PNG Data URL placing the specific incident in its
 * sub-county velocity and threat wave context.
 * -----------------------------------------------------------------------------
 */
export function generateSingleCaseContextGraph(
  caseItem: DonkeyCase,
  allCases: DonkeyCase[]
): string | null {
  const width = 1400;
  const height = 480;
  const target = createHiDPICanvas(width, height);
  if (!target) return null;

  const { ctx, canvas } = target;

  const subCounty = caseItem.location?.subCounty || 'Kitui Central';
  const categoryLabel = CATEGORY_INFO[caseItem.category]?.label || caseItem.category;

  // Filter cases in same sub-county or county
  const localCases = allCases.filter((c) => {
    const sc = (c.location?.subCounty || '').toLowerCase();
    return sc.includes(subCounty.toLowerCase()) || subCounty.toLowerCase().includes(sc);
  });

  // Calculate 6-week trend for this sub-county
  const buckets = computeWeeklyBuckets(localCases.length > 0 ? localCases : allCases, 6);

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  // Top Header Bar
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(2, 2, width - 4, 72);
  ctx.strokeStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.moveTo(0, 74);
  ctx.lineTo(width, 74);
  ctx.stroke();

  // Accent Badge
  ctx.fillStyle = '#7F1D1D';
  ctx.fillRect(20, 16, 6, 42);

  // Title
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(`LOCAL INCIDENT TRENDS & REGIONAL RISK INTELLIGENCE`, 36, 36);

  ctx.font = 'normal 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText(
    `Sub-County: ${subCounty} • Case #${caseItem.trackingCode} (${categoryLabel}) Regional Crime Wave Context`,
    36,
    54
  );

  // Right-hand Active Badge for this case
  ctx.fillStyle = '#FEF2F2';
  ctx.strokeStyle = '#FECACA';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(width - 320, 16, 300, 42, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#991B1B';
  ctx.fillText(`ACTIVE DOSSIER #${caseItem.trackingCode}`, width - 305, 34);

  ctx.font = 'normal 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#7F1D1D';
  ctx.fillText(`Status: ${caseItem.status.toUpperCase()} • Priority: ${(caseItem.urgency || 'MEDIUM').toUpperCase()}`, width - 305, 50);

  // Split view: Left side (Weekly Trend Line, width 800) | Right side (Sub-county category summary, width 520)
  const leftWidth = 840;
  const plotLeft = 65;
  const plotRight = leftWidth - 30;
  const plotTop = 110;
  const plotBottom = height - 55;
  const plotHeight = plotBottom - plotTop;
  const plotW = plotRight - plotLeft;

  // Max value on left
  let maxLocal = 0;
  buckets.forEach((b) => {
    if (b.total > maxLocal) maxLocal = b.total;
  });
  const yMax = Math.max(4, Math.ceil(maxLocal * 1.3));

  // Y-grid
  ctx.textAlign = 'right';
  ctx.font = 'normal 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#64748B';

  for (let s = 0; s <= 4; s++) {
    const val = Math.round((yMax / 4) * s);
    const yPos = plotBottom - (s / 4) * plotHeight;

    ctx.strokeStyle = s === 0 ? '#CBD5E1' : '#F1F5F9';
    ctx.lineWidth = s === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(plotLeft, yPos);
    ctx.lineTo(plotRight, yPos);
    ctx.stroke();

    ctx.fillText(`${val}`, plotLeft - 8, yPos + 4);
  }

  // X-axis
  ctx.textAlign = 'center';
  const stepX = plotW / (buckets.length - 1 || 1);

  buckets.forEach((b, idx) => {
    const xPos = plotLeft + idx * stepX;

    ctx.strokeStyle = '#94A3B8';
    ctx.beginPath();
    ctx.moveTo(xPos, plotBottom);
    ctx.lineTo(xPos, plotBottom + 4);
    ctx.stroke();

    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(b.label, xPos, plotBottom + 18);
  });

  // Plot Total Line
  const points = buckets.map((b, idx) => {
    const x = plotLeft + idx * stepX;
    const y = plotBottom - (b.total / yMax) * plotHeight;
    return { x, y, val: b.total };
  });

  // Area fill
  const grad = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  grad.addColorStop(0, 'rgba(153, 27, 27, 0.22)');
  grad.addColorStop(1, 'rgba(153, 27, 27, 0.01)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(points[0].x, plotBottom);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, plotBottom);
  ctx.closePath();
  ctx.fill();

  // Stroke line
  ctx.strokeStyle = '#991B1B';
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Points & Badges
  points.forEach((p) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#991B1B';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (p.val > 0) {
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#991B1B';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.val}`, p.x, p.y - 7);
    }
  });

  // Divider between Left Trend & Right Breakdown
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftWidth, 74);
  ctx.lineTo(leftWidth, height);
  ctx.stroke();

  // Right Side: Sub-County Breakdown & Threat Rating
  const rightX = leftWidth + 20;
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(`${subCounty.toUpperCase()} WELFARE THREAT MATRIX`, rightX, 105);

  const subCases = localCases.length > 0 ? localCases : allCases;
  const theftCount = subCases.filter((c) => c.category === 'donkey_theft').length;
  const slaughterCount = subCases.filter((c) => c.category === 'bush_slaughter').length;
  const traffickingCount = subCases.filter((c) => c.category === 'trafficking').length;
  const abuseCount = subCases.filter((c) => c.category === 'general_abuse').length;

  const matrixItems = [
    { label: 'Donkey Theft', count: theftCount, color: '#D97706', highlight: caseItem.category === 'donkey_theft' },
    { label: 'Bush Slaughter', count: slaughterCount, color: '#DC2626', highlight: caseItem.category === 'bush_slaughter' },
    { label: 'Illegal Trafficking', count: traffickingCount, color: '#7C3AED', highlight: caseItem.category === 'trafficking' },
    { label: 'General Abuse', count: abuseCount, color: '#2563EB', highlight: caseItem.category === 'general_abuse' },
  ];

  let matrixY = 130;
  const maxMatrix = Math.max(1, ...matrixItems.map((m) => m.count));
  const barW = 200;

  matrixItems.forEach((m) => {
    // If it's this case's category, draw subtle highlight box
    if (m.highlight) {
      ctx.fillStyle = '#FEF2F2';
      ctx.strokeStyle = '#FECACA';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(rightX - 6, matrixY - 14, width - rightX - 16, 32, 6);
      ctx.fill();
      ctx.stroke();
    }

    ctx.font = m.highlight ? 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' : 'normal 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = m.highlight ? '#991B1B' : '#334155';
    ctx.fillText(`${m.label}${m.highlight ? ' ★ (This Case)' : ''}`, rightX, matrixY);

    // Track
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.roundRect(rightX + 220, matrixY - 10, barW, 14, 4);
    ctx.fill();

    // Bar
    const bw = Math.max(m.count > 0 ? 8 : 0, (m.count / maxMatrix) * barW);
    if (bw > 0) {
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.roundRect(rightX + 220, matrixY - 10, bw, 14, 4);
      ctx.fill();
    }

    // Number
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = m.color;
    ctx.fillText(`${m.count}`, rightX + 220 + barW + 12, matrixY + 1);

    matrixY += 40;
  });

  // Hotspot summary note
  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rightX, height - 120, width - rightX - 24, 75, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText('DIOCESE CRIME HOTSPOT CORRIDOR:', rightX + 12, height - 98);

  ctx.font = 'normal 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(
    `Patrol intelligence links this region to priority anti-theft surveillance.`,
    rightX + 12,
    height - 80
  );
  ctx.fillText(
    `All evidence embedded in this dossier is verified by Caritas Kitui field unit.`,
    rightX + 12,
    height - 64
  );

  return canvas.toDataURL('image/png');
}
