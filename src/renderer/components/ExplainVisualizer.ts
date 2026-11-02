import { COST_HEAT, MODE_COLORS, BRAND_ACCENT, RENDERER_FONT_MONO } from '../../ui/renderer/rendererConstants';
import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

/**
 * Heat color for a node from its share of total plan cost (0-100): cool blue when cheap,
 * then amber -> orange -> magenta toward the hot end of the ribbon.
 */
export function costHeatColor(percent: number): string {
  if (!Number.isFinite(percent) || percent < 15) {
    return COST_HEAT.cool;
  }
  const t = Math.min(1, (percent - 15) / 60) * 100;
  return t <= 50
    ? `color-mix(in srgb, ${COST_HEAT.orange} ${Math.round(t * 2)}%, ${COST_HEAT.amber})`
    : `color-mix(in srgb, ${COST_HEAT.magenta} ${Math.round((t - 50) * 2)}%, ${COST_HEAT.orange})`;
}

export interface ExplainNode {
  'Node Type': string;
  'Total Cost'?: number;
  'Startup Cost'?: number;
  'Plan Rows'?: number;
  'Plan Width'?: number;
  'Actual Startup Time'?: number;
  'Actual Total Time'?: number;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  Plans?: ExplainNode[];
  [key: string]: any;
}

interface ExplainMeta {
  planningTime: number | null;
  executionTime: number | null;
  rootCost: number | null;
  nodeCount: number;
}

/**
 * Represents performance metrics for a single plan node.
 * Used to identify and categorize hotspots.
 */
export interface HotspotMetrics {
  node: ExplainNode;
  costPercent: number;        // percentage of total plan cost (0-100)
  timePercent: number;        // percentage of total execution time (0-100)
  severity: 'critical' | 'high' | 'medium' | 'low';  // based on threshold
  cost: number;
  time: number;
  reason: string;             // explanation of why this node is a hotspot
}

/**
 * Configuration for hotspot detection.
 */
export interface HotspotConfig {
  costThresholdPercent: number;   // nodes above this % of total cost are hotspots (default 10)
  timeThresholdPercent: number;   // nodes above this % of total time are hotspots (default 10)
}

export class ExplainVisualizer {
  private container: HTMLElement;
  private root: ExplainNode | null = null;
  private maxCost: number = 0;
  private totalExecutionTime: number = 0;
  private hotspots: HotspotMetrics[] = [];
  private hotspotConfig: HotspotConfig = {
    costThresholdPercent: 10,
    timeThresholdPercent: 10,
  };
  private meta: ExplainMeta = {
    planningTime: null,
    executionTime: null,
    rootCost: null,
    nodeCount: 0,
  };

  constructor(container: HTMLElement, planPayload: unknown, hotspotConfig?: Partial<HotspotConfig>) {
    this.container = container;
    if (hotspotConfig) {
      this.hotspotConfig = { ...this.hotspotConfig, ...hotspotConfig };
    }
    const normalized = this.normalizePlanPayload(planPayload);
    this.root = normalized.root;
    this.meta = normalized.meta;
    this.maxCost = this.root ? this.findMaxCost(this.root) : 0;
    this.totalExecutionTime = this.meta.executionTime ?? 0;
    if (this.root) {
      this.hotspots = this.detectHotspots(this.root);
    }
  }

  private asFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private formatNumber(value: unknown, decimals = 2, fallback = '?'): string {
    const num = this.asFiniteNumber(value);
    return num === null ? fallback : num.toFixed(decimals);
  }

  private normalizePlanPayload(payload: unknown): { root: ExplainNode | null; meta: ExplainMeta } {
    const parsedPayload = this.parseIfString(payload);

    let wrapper: any = null;
    let root: ExplainNode | null = null;

    if (Array.isArray(parsedPayload)) {
      const first = parsedPayload[0];
      if (first && typeof first === 'object' && first.Plan) {
        wrapper = first;
        root = this.ensurePlanNode(first.Plan);
      } else if (first && typeof first === 'object') {
        root = this.ensurePlanNode(first);
      }
    } else if (parsedPayload && typeof parsedPayload === 'object') {
      const obj = parsedPayload as any;
      if (obj.Plan) {
        wrapper = obj;
        root = this.ensurePlanNode(obj.Plan);
      } else {
        root = this.ensurePlanNode(obj);
      }
    }

    const nodeCount = root ? this.countNodes(root) : 0;
    const rootCost = root ? this.asFiniteNumber(root['Total Cost']) : null;

    return {
      root,
      meta: {
        planningTime: this.asFiniteNumber(wrapper?.['Planning Time']),
        executionTime: this.asFiniteNumber(wrapper?.['Execution Time']),
        rootCost,
        nodeCount,
      },
    };
  }

  private parseIfString(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  private ensurePlanNode(value: unknown): ExplainNode | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const candidate = value as ExplainNode;
    if (typeof candidate['Node Type'] === 'string') {
      return candidate;
    }

    // Some malformed payloads may place the node directly under Plan again.
    if (candidate.Plan && typeof candidate.Plan === 'object') {
      return this.ensurePlanNode(candidate.Plan);
    }

    return null;
  }

  private countNodes(node: ExplainNode): number {
    const children = Array.isArray(node.Plans) ? node.Plans : [];
    return 1 + children.reduce((sum, child) => sum + this.countNodes(child), 0);
  }

  private findMaxCost(node: ExplainNode): number {
    const current = this.asFiniteNumber(node['Total Cost']) ?? 0;
    const children = Array.isArray(node.Plans) ? node.Plans : [];

    if (children.length === 0) {
      return current;
    }

    return children.reduce((max, child) => Math.max(max, this.findMaxCost(child)), current);
  }

  private getNodeTime(node: ExplainNode): number {
    return this.asFiniteNumber(node['Actual Total Time']) ?? -1;
  }

  private findHottestNode(node: ExplainNode): ExplainNode {
    let hottest = node;
    let hottestTime = this.getNodeTime(node);

    const visit = (current: ExplainNode) => {
      const currentTime = this.getNodeTime(current);
      if (currentTime > hottestTime) {
        hottestTime = currentTime;
        hottest = current;
      }

      const children = Array.isArray(current.Plans) ? current.Plans : [];
      children.forEach(visit);
    };

    visit(node);

    if (hottestTime >= 0) {
      return hottest;
    }

    // Fallback to max total cost when ANALYZE timing is not available.
    const findByCost = (current: ExplainNode): ExplainNode => {
      const children = Array.isArray(current.Plans) ? current.Plans : [];
      let best = current;
      let bestCost = this.asFiniteNumber(current['Total Cost']) ?? -1;

      children.forEach((child) => {
        const childBest = findByCost(child);
        const childCost = this.asFiniteNumber(childBest['Total Cost']) ?? -1;
        if (childCost > bestCost) {
          best = childBest;
          bestCost = childCost;
        }
      });

      return best;
    };

    return findByCost(node);
  }

  private getNodeTypeLabel(nodeType: string): string {
    return nodeType || 'Unknown Node';
  }

  private getTimeBadgeColor(ms: number | null): 'green' | 'amber' | 'red' {
    if (ms === null || ms < 10) return 'green';
    if (ms <= 100) return 'amber';
    return 'red';
  }

  private formatDetailValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '?';
    }
    if (Array.isArray(value)) {
      return value.map(v => this.formatDetailValue(v)).join(', ');
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[object]';
      }
    }
    return String(value);
  }

  private shouldUseMonospace(label: string): boolean {
    return /cond|filter|output|key|name/i.test(label);
  }

  /**
   * Detects all hotspot nodes in the plan tree.
   * A node is a hotspot if it exceeds the configured threshold for cost or time percentage.
   */
  private detectHotspots(root: ExplainNode): HotspotMetrics[] {
    const hotspots: HotspotMetrics[] = [];
    const visited = new Set<ExplainNode>();

    const traverse = (node: ExplainNode) => {
      if (visited.has(node)) return;
      visited.add(node);

      const cost = this.asFiniteNumber(node['Total Cost']) ?? 0;
      const time = this.asFiniteNumber(node['Actual Total Time']) ?? 0;

      const costPercent = this.maxCost > 0 ? (cost / this.maxCost) * 100 : 0;
      const timePercent = this.totalExecutionTime > 0 ? (time / this.totalExecutionTime) * 100 : 0;

      // Determine severity based on thresholds
      const isHighCost = costPercent >= this.hotspotConfig.costThresholdPercent;
      const isHighTime = timePercent >= this.hotspotConfig.timeThresholdPercent;

      if (isHighCost || isHighTime) {
        let severity: 'critical' | 'high' | 'medium' | 'low' = 'low';
        if (costPercent >= 40 || timePercent >= 40) {
          severity = 'critical';
        } else if (costPercent >= 25 || timePercent >= 25) {
          severity = 'high';
        } else if (costPercent >= 15 || timePercent >= 15) {
          severity = 'medium';
        } else {
          severity = 'low';
        }

        const reason = [];
        if (isHighCost) reason.push(`${costPercent.toFixed(1)}% of plan cost`);
        if (isHighTime) reason.push(`${timePercent.toFixed(1)}% of execution time`);

        hotspots.push({
          node,
          costPercent,
          timePercent,
          severity,
          cost,
          time,
          reason: reason.join('; '),
        });
      }

      const children = Array.isArray(node.Plans) ? node.Plans : [];
      children.forEach(traverse);
    };

    traverse(root);
    return hotspots.sort((a, b) => b.costPercent - a.costPercent);
  }

  /**
   * Checks if a given node is a hotspot.
   */
  private isHotspot(node: ExplainNode): boolean {
    return this.hotspots.some(h => h.node === node);
  }

  /**
   * Gets the hotspot metrics for a given node, or null if not a hotspot.
   */
  private getHotspotMetrics(node: ExplainNode): HotspotMetrics | null {
    return this.hotspots.find(h => h.node === node) ?? null;
  }

  /**
   * Returns the CSS class for a given hotspot severity.
   */
  private getSeverityClass(severity: 'critical' | 'high' | 'medium' | 'low'): string {
    switch (severity) {
      case 'critical': return 'hotspot-critical';
      case 'high': return 'hotspot-high';
      case 'medium': return 'hotspot-medium';
      case 'low': return 'hotspot-low';
      default: return '';
    }
  }

  /**
   * Public accessor: returns all detected hotspots.
   * Useful for Phase 4 (recommendations engine) to analyze these nodes.
   */
  public getHotspots(): HotspotMetrics[] {
    return [...this.hotspots];
  }

  /**
   * Public accessor: returns the total execution time used in hotspot calculations.
   */
  public getTotalExecutionTime(): number {
    return this.totalExecutionTime;
  }

  public render(): void {
    ensureRendererBrandStyles();
    this.container.innerHTML = '';
    this.container.appendChild(this.buildStyles());

    if (!this.root) {
      this.container.appendChild(this.renderEmptyState());
      return;
    }

    const hottestNode = this.findHottestNode(this.root);

    this.container.appendChild(this.renderSummaryCard(hottestNode));

    const treeContainer = document.createElement('div');
    treeContainer.className = 'explain-tree';

    treeContainer.appendChild(this.renderToolbar(treeContainer));
    treeContainer.appendChild(this.createNodeElement(this.root, hottestNode, 0));

    this.container.appendChild(treeContainer);
  }

  private buildStyles(): HTMLStyleElement {
    const style = document.createElement('style');
    style.textContent = `
      .explain-tree {
        --nx-mono: ${RENDERER_FONT_MONO};
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        padding: 12px 16px 16px;
        overflow: auto;
        height: 100%;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
      }
      .explain-toolbar {
        display: flex;
        gap: 8px;
        padding: 0 0 10px;
      }
      .explain-toolbar button {
        padding: 3px 10px;
        font-size: 10.5px;
        font-family: var(--nx-mono);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
        border: 1px solid var(--vscode-widget-border);
        border-radius: 3px;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }
      .explain-toolbar button:hover {
        border-color: ${BRAND_ACCENT};
      }
      .explain-summary-card {
        margin: 10px 16px 10px;
        padding: 12px;
        border: 1px solid var(--vscode-widget-border);
        border-left: 3px solid ${BRAND_ACCENT};
        border-radius: 2px 6px 6px 2px;
        background: color-mix(in srgb, ${BRAND_ACCENT} 5%, var(--vscode-editor-background));
        font-family: var(--vscode-editor-font-family);
      }
      .explain-summary-title {
        font-family: var(--nx-mono);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.75;
        margin-bottom: 8px;
      }
      .explain-summary-main {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 10px;
      }
      .explain-metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 8px;
      }
      .explain-metric {
        border: 1px solid var(--vscode-widget-border);
        border-radius: 4px;
        padding: 6px 8px;
        background: color-mix(in srgb, var(--vscode-editor-background) 94%, var(--vscode-editor-foreground));
      }
      .explain-metric-label {
        display: block;
        font-family: var(--nx-mono);
        font-size: 9.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.7;
      }
      .explain-metric-value {
        font-size: 16px;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .explain-node {
        border: 1px solid var(--vscode-widget-border);
        border-radius: 6px;
        margin: 8px 0;
        background: var(--vscode-editor-background);
      }
      .explain-node {
        --nx-heat: ${COST_HEAT.cool};
        border-left: 3px solid var(--nx-heat);
      }
      .explain-node.hottest {
        border-color: ${BRAND_ACCENT};
        border-left-color: var(--nx-heat);
      }
      .explain-node-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 8px 10px;
        cursor: pointer;
      }
      .explain-node-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .toggle-icon {
        width: 14px;
        text-align: center;
        opacity: 0.8;
      }
      .explain-node-type {
        font-weight: 600;
      }
      .explain-node-stats {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        padding: 2px 7px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid var(--vscode-widget-border);
        font-variant-numeric: tabular-nums;
      }
      .pill {
        font-family: var(--nx-mono);
        font-size: 10.5px;
        letter-spacing: 0.04em;
      }
      .time-green { background: color-mix(in srgb, ${MODE_COLORS.read} 16%, transparent); }
      .time-amber { background: color-mix(in srgb, ${COST_HEAT.amber} 22%, transparent); }
      .time-red { background: color-mix(in srgb, ${COST_HEAT.magenta} 22%, transparent); }
      .cost-bar {
        height: 3px;
        background: var(--nx-heat);
        opacity: 0.9;
      }
      .explain-details {
        padding: 8px 10px 10px;
        border-top: 1px dashed var(--vscode-widget-border);
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 8px;
      }
      .explain-detail-item {
        min-width: 0;
      }
      .explain-label {
        display: block;
        font-size: 10px;
        text-transform: uppercase;
        opacity: 0.7;
        margin-bottom: 2px;
      }
      .explain-value {
        display: block;
        font-size: 12px;
        line-height: 1.35;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .explain-value.mono {
        font-family: var(--vscode-editor-font-family);
      }
      .explain-children {
        margin-left: 16px;
        padding-left: 10px;
        border-left: 1px solid color-mix(in srgb, var(--vscode-widget-border) 70%, transparent 30%);
      }
      .explain-node.collapsed .explain-details,
      .explain-node.collapsed .explain-children {
        display: none;
      }
      .explain-node.collapsed .toggle-icon {
        transform: rotate(-90deg);
      }
      .hotspot-badge {
        --nx-hot: ${COST_HEAT.magenta};
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 1px 8px;
        border-radius: 999px;
        font-family: var(--nx-mono);
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--vscode-editor-foreground);
        border: 1px solid color-mix(in srgb, var(--nx-hot) 55%, transparent);
        background: color-mix(in srgb, var(--nx-hot) 14%, transparent);
      }
      .hotspot-badge::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--nx-hot);
      }
      .hotspot-critical { --nx-hot: ${COST_HEAT.magenta}; }
      .hotspot-high { --nx-hot: ${COST_HEAT.orange}; }
      .hotspot-medium { --nx-hot: ${COST_HEAT.amber}; }
      .hotspot-low { --nx-hot: ${COST_HEAT.cool}; }
      .explain-node.is-hotspot {
        border-color: color-mix(in srgb, var(--nx-hot, var(--nx-heat)) 55%, var(--vscode-widget-border));
        border-left-color: var(--nx-heat);
        background: color-mix(in srgb, var(--nx-hot, var(--nx-heat)) 5%, var(--vscode-editor-background));
      }
      .hotspot-tooltip {
        display: none;
        position: absolute;
        background: var(--vscode-tooltip-background);
        color: var(--vscode-tooltip-foreground);
        border: 1px solid var(--vscode-tooltip-border);
        padding: 6px 10px;
        border-radius: 3px;
        font-size: 11px;
        z-index: 1000;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }
      .hotspot-badge:hover .hotspot-tooltip {
        display: block;
      }
      .explain-empty {
        margin: 12px 16px;
        border: 1px solid var(--vscode-widget-border);
        border-radius: 6px;
        padding: 12px;
        font-family: var(--vscode-editor-font-family);
      }
      .explain-empty h4 {
        margin: 0 0 8px;
        font-size: 13px;
      }
      .explain-empty p {
        margin: 6px 0;
        line-height: 1.4;
      }
    `;
    return style;
  }

  private renderEmptyState(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'explain-empty';

    const title = document.createElement('h4');
    title.textContent = 'Explain plan is not in JSON format';

    const p1 = document.createElement('p');
    p1.textContent = 'Run EXPLAIN with FORMAT JSON to open the visual plan.';

    const p2 = document.createElement('p');
    p2.textContent = 'Example: EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT ...';

    box.appendChild(title);
    box.appendChild(p1);
    box.appendChild(p2);
    return box;
  }

  private renderSummaryCard(hottestNode: ExplainNode): HTMLElement {
    const card = document.createElement('div');
    card.className = 'explain-summary-card';

    const title = document.createElement('div');
    title.className = 'explain-summary-title';
    title.textContent = 'Performance Summary';

    const bottleneck = document.createElement('div');
    bottleneck.className = 'explain-summary-main';
    const hotTime = this.asFiniteNumber(hottestNode['Actual Total Time']);
    const hotTimeText = hotTime === null ? '' : ` (${hotTime.toFixed(2)} ms)`;
    bottleneck.textContent = `Primary bottleneck: ${this.getNodeTypeLabel(hottestNode['Node Type'])}${hotTimeText}`;

    const metrics = document.createElement('div');
    metrics.className = 'explain-metric-grid';

    const addMetric = (label: string, value: string) => {
      const item = document.createElement('div');
      item.className = 'explain-metric';
      item.innerHTML = `<span class="explain-metric-label">${label}</span><span class="explain-metric-value">${value}</span>`;
      metrics.appendChild(item);
    };

    addMetric('Planning', this.meta.planningTime === null ? '?' : `${this.meta.planningTime.toFixed(2)} ms`);
    addMetric('Execution', this.meta.executionTime === null ? '?' : `${this.meta.executionTime.toFixed(2)} ms`);
    addMetric('Root Cost', this.meta.rootCost === null ? '?' : this.meta.rootCost.toFixed(2));
    addMetric('Plan Nodes', String(this.meta.nodeCount));

    card.appendChild(title);
    card.appendChild(bottleneck);
    card.appendChild(metrics);

    if (hottestNode['Node Type'] === 'Seq Scan') {
      const hint = document.createElement('div');
      hint.className = 'nx-insight nx-insight--medium';
      hint.style.marginTop = '10px';
      const relationName = String(hottestNode['Relation Name'] ?? 'table_name');
      hint.textContent = `Hint: consider an index for relation \"${relationName}\" if this path is frequently used.`;
      card.appendChild(hint);
    }

    return card;
  }

  private renderToolbar(treeContainer: HTMLElement): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'explain-toolbar';

    const expandAll = document.createElement('button');
    expandAll.textContent = 'Expand All';
    expandAll.onclick = () => {
      treeContainer.querySelectorAll('.explain-node.collapsed').forEach((n) => n.classList.remove('collapsed'));
    };

    const collapseAll = document.createElement('button');
    collapseAll.textContent = 'Collapse All';
    collapseAll.onclick = () => {
      treeContainer.querySelectorAll('.explain-node').forEach((n) => {
        if (n.querySelector('.explain-children')) {
          n.classList.add('collapsed');
        }
      });
    };

    toolbar.appendChild(expandAll);
    toolbar.appendChild(collapseAll);
    return toolbar;
  }

  private createNodeElement(node: ExplainNode, hottestNode: ExplainNode, depth: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'explain-node';

    if (node === hottestNode) {
      el.classList.add('hottest');
    }

    // Add hotspot styling if this node is a hotspot
    const hotspotMetrics = this.getHotspotMetrics(node);
    if (hotspotMetrics) {
      el.classList.add('is-hotspot');
      el.classList.add(this.getSeverityClass(hotspotMetrics.severity));
    }

    const children = Array.isArray(node.Plans) ? node.Plans : [];
    const hasChildren = children.length > 0;

    if (depth > 1 && hasChildren) {
      el.classList.add('collapsed');
    }

    const header = document.createElement('div');
    header.className = 'explain-node-header';

    const left = document.createElement('div');
    left.className = 'explain-node-left';

    const toggle = document.createElement('span');
    toggle.className = 'toggle-icon';
    toggle.textContent = hasChildren ? 'v' : '';
    left.appendChild(toggle);

    const typeName = document.createElement('span');
    typeName.className = 'explain-node-type';
    typeName.textContent = this.getNodeTypeLabel(node['Node Type']);
    left.appendChild(typeName);

    // Add hotspot badge if applicable
    if (hotspotMetrics) {
      const badge = document.createElement('span');
      badge.className = `hotspot-badge ${this.getSeverityClass(hotspotMetrics.severity)}`;
      badge.title = hotspotMetrics.reason;
      badge.textContent = hotspotMetrics.severity;
      left.appendChild(badge);
    }

    header.appendChild(left);

    const stats = document.createElement('div');
    stats.className = 'explain-node-stats';

    const time = this.asFiniteNumber(node['Actual Total Time']);
    const cost = this.asFiniteNumber(node['Total Cost']);
    const rows = this.asFiniteNumber(node['Actual Rows']) ?? this.asFiniteNumber(node['Plan Rows']);

    const addPill = (text: string, className = '') => {
      const pill = document.createElement('span');
      pill.className = `pill ${className}`.trim();
      pill.textContent = text;
      stats.appendChild(pill);
    };

    const timeColor = this.getTimeBadgeColor(time);
    addPill(`time ${time === null ? '?' : `${time.toFixed(2)}ms`}`, `time-${timeColor}`);
    addPill(`cost ${cost === null ? '?' : cost.toFixed(2)}`);
    addPill(`rows ${rows === null ? '?' : rows.toLocaleString()}`);

    const planRows = this.asFiniteNumber(node['Plan Rows']);
    const actualRows = this.asFiniteNumber(node['Actual Rows']);
    if (planRows && actualRows && planRows > 0) {
      const ratio = actualRows / planRows;
      if (ratio > 10 || ratio < 0.1) {
        const magnitude = ratio >= 1 ? Math.round(ratio) : Math.round(1 / ratio);
        const direction = ratio >= 1 ? 'over' : 'under';
        addPill(`est ${magnitude}x ${direction}`);
      }
    }

    header.appendChild(stats);
    el.appendChild(header);

    if (hasChildren) {
      header.onclick = (e) => {
        el.classList.toggle('collapsed');
        e.stopPropagation();
      };
    }

    const costBar = document.createElement('div');
    costBar.className = 'cost-bar';
    const barRatio = this.maxCost > 0 && cost !== null ? (cost / this.maxCost) * 100 : 0;
    el.style.setProperty('--nx-heat', costHeatColor(barRatio));
    costBar.style.width = `${Math.max(2, Math.min(100, barRatio))}%`;
    el.appendChild(costBar);

    const details = document.createElement('div');
    details.className = 'explain-details';

    const addDetail = (label: string, value: unknown) => {
      if (value === null || value === undefined || value === '') {
        return;
      }

      const item = document.createElement('div');
      item.className = 'explain-detail-item';

      const labelEl = document.createElement('span');
      labelEl.className = 'explain-label';
      labelEl.textContent = label;

      const valueEl = document.createElement('span');
      valueEl.className = `explain-value${this.shouldUseMonospace(label) ? ' mono' : ''}`;
      valueEl.textContent = this.formatDetailValue(value);

      item.appendChild(labelEl);
      item.appendChild(valueEl);
      details.appendChild(item);
    };

    addDetail('Cost', `${this.formatNumber(node['Startup Cost'])} .. ${this.formatNumber(node['Total Cost'])}`);
    addDetail('Rows', `${this.formatNumber(node['Plan Rows'], 0)} (plan) / ${this.formatNumber(node['Actual Rows'], 0)} (actual)`);
    addDetail('Loops', this.asFiniteNumber(node['Actual Loops']));
    addDetail('Relation', node['Relation Name']);
    addDetail('Alias', node.Alias);
    addDetail('Index Name', node['Index Name']);
    addDetail('Join Type', node['Join Type']);
    addDetail('Strategy', node.Strategy);
    addDetail('Parallel Aware', node['Parallel Aware']);
    addDetail('Index Cond', node['Index Cond']);
    addDetail('Recheck Cond', node['Recheck Cond']);
    addDetail('Hash Cond', node['Hash Cond']);
    addDetail('Merge Cond', node['Merge Cond']);
    addDetail('Join Filter', node['Join Filter']);
    addDetail('Filter', node.Filter);
    addDetail('Sort Key', node['Sort Key']);
    addDetail('Group Key', node['Group Key']);
    addDetail('Output', node.Output);
    addDetail('Rows Removed by Filter', node['Rows Removed by Filter']);
    addDetail('Rows Removed by Join Filter', node['Rows Removed by Join Filter']);

    el.appendChild(details);

    if (hasChildren) {
      const childrenEl = document.createElement('div');
      childrenEl.className = 'explain-children';
      children.forEach((child) => {
        childrenEl.appendChild(this.createNodeElement(child, hottestNode, depth + 1));
      });
      el.appendChild(childrenEl);
    }

    return el;
  }
}
