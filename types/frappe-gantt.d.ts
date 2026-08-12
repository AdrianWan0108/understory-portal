declare module "frappe-gantt" {
  export type GanttTask = {
    id: string;
    name: string;
    start: string;
    end: string;
    progress: number;
    dependencies?: string;
    custom_class?: string;
    description?: string;
    thumbnail?: string;
    [key: string]: unknown;
  };

  export type GanttOptions = {
    view_mode?: "Day" | "Week" | "Month" | "Year";
    readonly?: boolean;
    readonly_dates?: boolean;
    readonly_progress?: boolean;
    move_dependencies?: boolean;
    scroll_to?: "today" | "start" | "end" | string;
    today_button?: boolean;
    view_mode_select?: boolean;
    auto_move_label?: boolean;
    infinite_padding?: boolean;
    bar_corner_radius?: number;
    bar_height?: number;
    padding?: number;
    container_height?: number | "auto";
    popup_on?: "click" | "hover";
    popup?: false;
    on_click?: (task: GanttTask) => void;
    on_date_change?: (task: GanttTask, start: Date, end: Date) => void;
  };

  export default class Gantt {
    constructor(
      wrapper: HTMLElement | SVGElement | string,
      tasks: GanttTask[],
      options?: GanttOptions,
    );
    change_view_mode(
      mode: "Day" | "Week" | "Month" | "Year",
      maintainPosition?: boolean,
    ): void;
    scroll_current(): void;
  }
}
