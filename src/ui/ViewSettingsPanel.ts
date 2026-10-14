// As in `ToolPalette`: the stylesheet is imported because the panel cannot
// be drawn without it, not to be read from.
import "./viewSettingsPanel.css";
import type { ViewSettings } from "./ViewSettings";

/**
 * The view settings: a checkbox per setting, each changing only what is
 * drawn. Writes the choice into the shared `ViewSettings`, and tells whoever
 * watches that it changed.
 *
 * Lives as long as the page, like the palette.
 */
export class ViewSettingsPanel {
  private readonly settingsChangedListeners = new Set<() => void>();

  /**
   * Builds the panel and puts it in `host`, which decides where on the page
   * it lands. Shows what `settings` already holds.
   */
  constructor(
    host: HTMLElement,
    private readonly settings: ViewSettings,
  ) {
    const doc = host.ownerDocument;

    const root = doc.createElement("div");
    root.className = "panel view-settings-panel";

    const title = doc.createElement("div");
    title.className = "view-settings-panel-title";
    title.textContent = "View";

    const lanes = doc.createElement("input");
    lanes.type = "checkbox";
    lanes.checked = settings.lanesVisible;
    lanes.addEventListener("change", () => {
      this.settings.lanesVisible = lanes.checked;
      for (const listener of this.settingsChangedListeners) listener();
      // As in the palette: a focused checkbox toggles on Space, and keys
      // mean the same over the panel as over the canvas.
      lanes.blur();
    });

    // The checkbox inside its label: a click on the text toggles it too.
    const lanesRow = doc.createElement("label");
    lanesRow.append(lanes, "Lanes");

    root.append(title, lanesRow);
    host.append(root);
  }

  /**
   * Watch for the settings changing. Returns the function that stops
   * watching.
   */
  onSettingsChanged(listener: () => void): () => void {
    this.settingsChangedListeners.add(listener);
    return () => this.settingsChangedListeners.delete(listener);
  }
}
