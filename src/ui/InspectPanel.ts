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

  /**
   * Builds the panel and puts it in `host`, which decides where on the page
   * it lands. The document is taken from `host` rather than reached for
   * globally, so the panel builds into whichever page it was handed.
   */
  constructor(host: HTMLElement) {
    const doc = host.ownerDocument;

    this.root = doc.createElement("div");
    this.root.className = "panel inspect-panel";

    const title = doc.createElement("div");
    title.className = "inspect-panel-title";
    title.textContent = "Section info";

    // A description list: the HTML element for pairs of term and value, so
    // what the rows are is in the markup and not only in the styling.
    const rows = doc.createElement("dl");
    rows.className = "inspect-panel-rows";
    for (const [label, value] of [
      ["Id", "7"],
      ["Length", "128.40 m"],
      ["Roadway", "112.90 m"],
    ]) {
      const term = doc.createElement("dt");
      term.textContent = label;
      const measure = doc.createElement("dd");
      measure.textContent = value;
      rows.append(term, measure);
    }

    this.root.append(title, rows);
    host.append(this.root);
  }

  /** Takes the panel off the page. It is unusable after. */
  dispose(): void {
    this.root.remove();
  }
}
