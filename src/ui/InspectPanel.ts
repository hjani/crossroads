// As in `ToolPalette`: the stylesheet is imported because the panel cannot
// be drawn without it, not to be read from.
import "./inspectPanel.css";

/**
 * The panel reporting what the Inspect tool has selected: a title naming
 * the thing, then rows of label and value.
 *
 * Lives exactly as long as the tool that shows it.
 */
export class InspectPanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly rows: HTMLElement;

  /**
   * Builds the panel and puts it in `host`, which decides where on the page
   * it lands. The document is taken from `host` rather than reached for
   * globally, so the panel builds into whichever page it was handed.
   */
  constructor(host: HTMLElement) {
    const doc = host.ownerDocument;

    this.root = doc.createElement("div");
    this.root.className = "panel inspect-panel";

    this.title = doc.createElement("div");
    this.title.className = "inspect-panel-title";

    // A description list: the HTML element for pairs of term and value, so
    // what the rows are is in the markup and not only in the styling.
    this.rows = doc.createElement("dl");
    this.rows.className = "inspect-panel-rows";

    this.root.append(this.title, this.rows);
    host.append(this.root);
  }

  /**
   * Replaces what the panel shows: `title` over one row per label and value.
   *
   * No rows is a panel of its title alone — the stylesheet drops the empty
   * list and the rule above it, so nothing dangles under the line.
   */
  show(title: string, rows: readonly (readonly [string, string])[]): void {
    const doc = this.root.ownerDocument;

    this.title.textContent = title;
    this.rows.replaceChildren();
    for (const [label, value] of rows) {
      const term = doc.createElement("dt");
      term.textContent = label;
      const measure = doc.createElement("dd");
      measure.textContent = value;
      this.rows.append(term, measure);
    }
  }

  /** Takes the panel off the page. It is unusable after. */
  dispose(): void {
    this.root.remove();
  }
}
