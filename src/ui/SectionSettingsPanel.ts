// As in `ToolPalette`: the stylesheet is imported because the panel cannot
// be drawn without it, not to be read from.
import "./sectionSettingsPanel.css";
import type { SectionSettings } from "../input/SectionSettings";

/** The widths the buttons set, in meters. */
const LANE_CHOICES = [
  { label: "one lane", width: 8 },
  { label: "two lanes", width: 16 },
] as const;

/**
 * The section tools' settings: how wide they build, one lane or two each
 * way. Writes the choice into the shared `SectionSettings`, and tells
 * whoever watches that it changed.
 *
 * Lives exactly as long as the tool that shows it.
 */
export class SectionSettingsPanel {
  private readonly root: HTMLElement;
  private readonly buttons: { element: HTMLButtonElement; width: number }[] =
    [];
  private readonly settingsChangedListeners = new Set<() => void>();

  /**
   * Builds the panel and puts it in `host`, which decides where on the page
   * it lands. Shows the width `settings` already holds as chosen.
   */
  constructor(
    host: HTMLElement,
    private readonly settings: SectionSettings,
  ) {
    const doc = host.ownerDocument;

    this.root = doc.createElement("div");
    this.root.className = "panel section-settings-panel";

    for (const { label, width } of LANE_CHOICES) {
      const element = doc.createElement("button");
      element.type = "button";
      element.textContent = label;
      element.addEventListener("click", () => {
        this.choose(width);
        // As in the palette: keys mean the same over the panel as over the
        // canvas.
        element.blur();
      });
      this.root.append(element);
      this.buttons.push({ element, width });
    }

    this.markChosen();
    host.append(this.root);
  }

  /**
   * Watch for the settings changing. Returns the function that stops
   * watching.
   */
  onSettingsChanged(listener: () => void): () => void {
    this.settingsChangedListeners.add(listener);
    return () => this.settingsChangedListeners.delete(listener);
  }

  /** Takes the panel off the page. It is unusable after. */
  dispose(): void {
    this.root.remove();
  }

  /** Choosing the width already chosen is no change, and says nothing. */
  private choose(width: number): void {
    if (width === this.settings.width) return;

    this.settings.width = width;
    this.markChosen();
    for (const listener of this.settingsChangedListeners) listener();
  }

  private markChosen(): void {
    for (const { element, width } of this.buttons) {
      element.classList.toggle("is-selected", width === this.settings.width);
    }
  }
}
