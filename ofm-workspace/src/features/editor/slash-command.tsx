import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ComponentType,
} from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { toast } from "sonner";
import {
  Bookmark as BookmarkIcon,
  CheckSquare,
  ChevronRight,
  Code2,
  Columns2,
  Database,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  Minus,
  Paperclip,
  Quote,
  Table as TableIcon,
  Type,
  Video as VideoIcon,
  MessageSquareQuote,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { uploadAsset } from "./upload";

interface CommandItem {
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
}

function pickFile(accept: string, cb: (file: File) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) cb(f);
  };
  input.click();
}

async function uploadImage(editor: Editor, range: Range) {
  editor.chain().focus().deleteRange(range).run();
  pickFile("image/*", async (file) => {
    const id = toast.loading(`Uploading ${file.name}…`);
    try {
      const { path } = await uploadAsset(file);
      editor
        .chain()
        .focus()
        .insertContent({ type: "image", attrs: { path, alt: file.name } })
        .run();
      toast.success("Image added", { id });
    } catch (e) {
      toast.error((e as Error).message, { id });
    }
  });
}

async function uploadFile(editor: Editor, range: Range) {
  editor.chain().focus().deleteRange(range).run();
  pickFile("*/*", async (file) => {
    const id = toast.loading(`Uploading ${file.name}…`);
    try {
      const { path, name, size } = await uploadAsset(file);
      editor
        .chain()
        .focus()
        .insertContent({ type: "fileBlock", attrs: { path, name, size } })
        .run();
      toast.success("File attached", { id });
    } catch (e) {
      toast.error((e as Error).message, { id });
    }
  });
}

export const SLASH_COMMANDS: CommandItem[] = [
  {
    title: "Text",
    subtitle: "Plain paragraph",
    icon: Type,
    keywords: ["text", "paragraph", "plain"],
    run: (e, r) => e.chain().focus().deleteRange(r).setNode("paragraph").run(),
  },
  {
    title: "Heading 1",
    subtitle: "Large section heading",
    icon: Heading1,
    keywords: ["h1", "title", "heading", "big"],
    run: (e, r) =>
      e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "Heading 2",
    subtitle: "Medium section heading",
    icon: Heading2,
    keywords: ["h2", "heading", "subtitle"],
    run: (e, r) =>
      e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Heading 3",
    subtitle: "Small section heading",
    icon: Heading3,
    keywords: ["h3", "heading"],
    run: (e, r) =>
      e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "To-do list",
    subtitle: "Track tasks with checkboxes",
    icon: CheckSquare,
    keywords: ["todo", "task", "checkbox", "check"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
  },
  {
    title: "Bulleted list",
    subtitle: "A simple bulleted list",
    icon: List,
    keywords: ["bullet", "unordered", "list", "ul"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    subtitle: "A numbered list",
    icon: ListOrdered,
    keywords: ["number", "ordered", "list", "ol"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    title: "Toggle list",
    subtitle: "Collapsible content",
    icon: ChevronRight,
    keywords: ["toggle", "collapse", "accordion", "details"],
    run: (e, r) =>
      e
        .chain()
        .focus()
        .deleteRange(r)
        .insertContent({ type: "toggle", content: [{ type: "paragraph" }] })
        .run(),
  },
  {
    title: "Quote",
    subtitle: "Capture a quote",
    icon: Quote,
    keywords: ["quote", "blockquote", "citation"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    title: "Callout",
    subtitle: "Make text stand out",
    icon: MessageSquareQuote,
    keywords: ["callout", "info", "note", "highlight"],
    run: (e, r) =>
      e
        .chain()
        .focus()
        .deleteRange(r)
        .insertContent({
          type: "callout",
          attrs: { emoji: "💡" },
          content: [{ type: "paragraph" }],
        })
        .run(),
  },
  {
    title: "Divider",
    subtitle: "Visually separate content",
    icon: Minus,
    keywords: ["divider", "hr", "line", "separator", "rule"],
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
  {
    title: "Code",
    subtitle: "Capture a code snippet",
    icon: Code2,
    keywords: ["code", "snippet", "pre"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
  },
  {
    title: "Table",
    subtitle: "Insert a table",
    icon: TableIcon,
    keywords: ["table", "grid", "rows"],
    run: (e, r) =>
      e
        .chain()
        .focus()
        .deleteRange(r)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: "2 columns",
    subtitle: "Side-by-side column layout",
    icon: Columns2,
    keywords: ["column", "columns", "layout", "grid", "side"],
    run: (e, r) =>
      e
        .chain()
        .focus()
        .deleteRange(r)
        .insertContent({
          type: "columnList",
          content: [
            { type: "column", content: [{ type: "paragraph" }] },
            { type: "column", content: [{ type: "paragraph" }] },
          ],
        })
        .run(),
  },
  {
    title: "Video",
    subtitle: "Embed YouTube/Loom or upload",
    icon: VideoIcon,
    keywords: ["video", "youtube", "loom", "vimeo", "embed", "mp4"],
    run: (e, r) =>
      e.chain().focus().deleteRange(r).insertContent({ type: "video" }).run(),
  },
  {
    title: "Bookmark",
    subtitle: "Save a link as a card",
    icon: BookmarkIcon,
    keywords: ["bookmark", "link", "url", "web", "preview"],
    run: (e, r) =>
      e.chain().focus().deleteRange(r).insertContent({ type: "bookmark" }).run(),
  },
  {
    title: "Image",
    subtitle: "Upload an image",
    icon: ImageIcon,
    keywords: ["image", "picture", "photo", "upload"],
    run: (e, r) => uploadImage(e, r),
  },
  {
    title: "File",
    subtitle: "Upload a file attachment",
    icon: Paperclip,
    keywords: ["file", "attachment", "upload", "document", "pdf"],
    run: (e, r) => uploadFile(e, r),
  },
];

interface MenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashMenu = forwardRef<
  MenuRef,
  { items: CommandItem[]; command: (item: CommandItem) => void }
>((props, ref) => {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [props.items]);

  const select = (i: number) => {
    const item = props.items[i];
    if (item) props.command(item);
  };

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelected((s) => (s + props.items.length - 1) % props.items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % props.items.length);
          return true;
        }
        if (event.key === "Enter") {
          select(selected);
          return true;
        }
        return false;
      },
    }),
    [props, selected],
  );

  if (props.items.length === 0) {
    return <div className="slash-menu">
      <div className="slash-empty">No matching blocks</div>
    </div>;
  }

  return (
    <div className="slash-menu">
      {props.items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          className={cn("slash-item", i === selected && "is-selected")}
          onMouseEnter={() => setSelected(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            select(i);
          }}
        >
          <span className="slash-icon">
            <item.icon className="size-4" />
          </span>
          <span className="slash-text">
            <span className="slash-title">{item.title}</span>
            <span className="slash-sub">{item.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  );
});
SlashMenu.displayName = "SlashMenu";

function place(el: HTMLElement | null, rect: (() => DOMRect | null) | null) {
  if (!el || !rect) return;
  const r = rect();
  if (!r) return;
  const maxTop = window.innerHeight - 360;
  el.style.position = "fixed";
  el.style.left = `${Math.round(r.left)}px`;
  el.style.top = `${Math.round(Math.min(r.bottom + 6, maxTop))}px`;
  el.style.zIndex = "50";
}

interface SlashCommandOptions {
  onCreatePage: ((editor: Editor, range: Range) => void) | null;
  onCreateDatabase: ((editor: Editor, range: Range) => void) | null;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",
  addOptions() {
    return { onCreatePage: null, onCreateDatabase: null };
  },
  addProseMirrorPlugins() {
    const onCreatePage = this.options.onCreatePage;
    const onCreateDatabase = this.options.onCreateDatabase;
    const pageCommand: CommandItem[] = onCreatePage
      ? [
          {
            title: "Page",
            subtitle: "Create a sub-page inside this one",
            icon: FileText,
            keywords: ["page", "subpage", "sub-page", "child", "nested"],
            run: (editor, range) => onCreatePage(editor, range),
          },
        ]
      : [];
    const databaseCommand: CommandItem[] = onCreateDatabase
      ? [
          {
            title: "Database",
            subtitle: "Insert a table/database inside this page",
            icon: Database,
            keywords: ["database", "table", "grid", "inline", "collection"],
            run: (editor, range) => onCreateDatabase(editor, range),
          },
        ]
      : [];
    const commands = [...pageCommand, ...databaseCommand, ...SLASH_COMMANDS];
    return [
      Suggestion<CommandItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => {
          const q = query.toLowerCase();
          return commands.filter((c) =>
            `${c.title} ${c.keywords.join(" ")}`.toLowerCase().includes(q),
          );
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let component: ReactRenderer<MenuRef> | null = null;
          let el: HTMLElement | null = null;
          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, {
                props,
                editor: props.editor,
              });
              el = document.createElement("div");
              document.body.appendChild(el);
              el.appendChild(component.element);
              place(el, props.clientRect ?? null);
            },
            onUpdate: (props) => {
              component?.updateProps(props);
              place(el, props.clientRect ?? null);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") return true;
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              el?.remove();
              el = null;
              component?.destroy();
              component = null;
            },
          };
        },
      }),
    ];
  },
});
