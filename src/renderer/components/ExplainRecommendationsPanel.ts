import { PerformanceRecommendation } from '../../services/queryPerformance/QueryPerformanceAnalyzer';
import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

/**
 * UI panel for displaying performance recommendations
 * Renders in VS Code notebook webview context
 */
export class ExplainRecommendationsPanel {
  private recommendations: PerformanceRecommendation[] = [];

  constructor(private container: HTMLElement) {}

  /**
   * Render recommendations panel
   */
  public render(
    recommendations: PerformanceRecommendation[],
    query?: string,
    options?: { onSendToAssistant?: () => void },
  ): void {
    ensureRendererBrandStyles();
    this.recommendations = recommendations;
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'recommendations-panel';
    wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      gap: 10px;
    `;

    // Header
    wrapper.appendChild(this.renderHeader(recommendations.length, options));

    // Query info (optional)
    if (query) {
      wrapper.appendChild(this.renderQueryInfo(query));
    }

    // Recommendations list
    if (recommendations.length > 0) {
      wrapper.appendChild(this.renderRecommendationsList());
    } else {
      wrapper.appendChild(this.renderEmptyState());
    }

    this.container.appendChild(wrapper);
  }

  /**
   * Render header
   */
  private renderHeader(count: number, options?: { onSendToAssistant?: () => void }): HTMLElement {
    const header = document.createElement('div');
    header.className = 'nx-insight';
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    `;

    const left = document.createElement('div');

    const title = document.createElement('h2');
    title.textContent = `Performance Recommendations (${count})`;
    title.style.cssText = `
      margin: 0;
      font-size: 11px;
      font-weight: 500;
      font-family: var(--vscode-editor-font-family, monospace);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    `;
    left.appendChild(title);
    header.appendChild(left);

    if (options?.onSendToAssistant) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Send to NexQL Bot';
      button.className = 'nx-btn';
      button.onclick = options.onSendToAssistant;
      header.appendChild(button);
    }

    return header;
  }

  /**
   * Render query info box
   */
  private renderQueryInfo(query: string): HTMLElement {
    const infoBox = document.createElement('div');
    infoBox.className = 'nx-insight';

    const label = document.createElement('div');
    label.textContent = 'Query:';
    label.style.cssText = 'font-weight: 600; margin-bottom: 4px;';
    infoBox.appendChild(label);

    const code = document.createElement('code');
    code.textContent = query.substring(0, 200) + (query.length > 200 ? '...' : '');
    code.className = 'nx-insight__code';
    infoBox.appendChild(code);

    return infoBox;
  }

  /**
   * Render recommendations list
   */
  private renderRecommendationsList(): HTMLElement {
    const list = document.createElement('div');
    list.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 0 4px 8px 4px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    // Group by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const grouped = this.recommendations.reduce((acc, rec) => {
      const severity = rec.severity;
      if (!acc[severity]) acc[severity] = [];
      acc[severity].push(rec);
      return acc;
    }, {} as Record<string, PerformanceRecommendation[]>);

    for (const severity of Object.keys(severityOrder)) {
      if (grouped[severity]) {
        for (const rec of grouped[severity]) {
          list.appendChild(this.renderRecommendationCard(rec));
        }
      }
    }

    return list;
  }

  /**
   * Render single recommendation card
   */
  private renderRecommendationCard(rec: PerformanceRecommendation): HTMLElement {
    const card = document.createElement('div');
    
    const severity = ['critical', 'high', 'medium', 'low'].includes(rec.severity) ? rec.severity : 'low';
    card.className = `nx-insight nx-insight--${severity}`;

    // Title
    const title = document.createElement('div');
    title.className = 'nx-insight__title';
    title.innerHTML = `<span class="nx-insight__dot" aria-hidden="true"></span>${this.escapeHtml(rec.title)}`;
    card.appendChild(title);

    // Category badge
    const categoryBadge = document.createElement('span');
    categoryBadge.textContent = rec.category.toUpperCase();
    categoryBadge.className = 'nx-insight__tag';
    card.appendChild(categoryBadge);

    // Improvement badge
    const improvementBadge = document.createElement('span');
    improvementBadge.textContent = rec.estimatedImprovement;
    improvementBadge.style.cssText = `
      display: inline-block;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    `;
    card.appendChild(improvementBadge);

    // Description
    const description = document.createElement('div');
    description.style.cssText = `
      margin-top: 8px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.4;
    `;
    description.textContent = rec.description;
    card.appendChild(description);

    // Suggestion code block
    const suggestionContainer = document.createElement('div');
    suggestionContainer.style.cssText = 'margin-top: 8px;';
    
    const suggestionLabel = document.createElement('div');
    suggestionLabel.textContent = 'Suggestion:';
    suggestionLabel.style.cssText = `
      font-weight: 600;
      font-size: 11px;
      margin-bottom: 4px;
      color: var(--vscode-descriptionForeground);
    `;
    suggestionContainer.appendChild(suggestionLabel);

    const suggestionCode = document.createElement('code');
    suggestionCode.textContent = rec.suggestion;
    suggestionCode.className = 'nx-insight__code';
    suggestionContainer.appendChild(suggestionCode);

    // Copy button
    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy';
    copyButton.className = 'nx-insight__copy';
    copyButton.onclick = () => {
      navigator.clipboard.writeText(rec.suggestion).then(() => {
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied';
        setTimeout(() => {
          copyButton.textContent = originalText;
        }, 2000);
      });
    };
    suggestionContainer.appendChild(copyButton);
    
    card.appendChild(suggestionContainer);

    return card;
  }

  /**
   * Render empty state
   */
  private renderEmptyState(): HTMLElement {
    const empty = document.createElement('div');
    empty.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 4px;
      padding: 24px 0;
      color: var(--vscode-descriptionForeground);
    `;
    empty.innerHTML = `
      <div style="font-size: 14px; font-weight: 600; color: var(--vscode-editor-foreground);">No recommendations</div>
      <div style="font-size: 12px;">Your query plan looks optimal!</div>
    `;
    return empty;
  }

  /**
   * Export recommendations as JSON
   */
  public export(): PerformanceRecommendation[] {
    return [...this.recommendations];
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
