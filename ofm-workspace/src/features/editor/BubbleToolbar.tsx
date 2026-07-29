import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  Strikethrough,
  Underline,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Notion-style palettes (also the target for the importer's color mapping).
const TEXT_COLORS: { label: string; value: string | null }[] = [
  { label: "Default", value: null },
  { label: "Gray", value: "#787774" },
  { label: "Brown", value: "#9f6b53" },
  { label: "Orange", value: "#d9730d" },
  { label: "Yellow", value: "#cb912f" },
  { label: "Green", value: "#448361" },
  { label: "Blue", value: "#337ea9" },
  { label: "Purple", value: "#9065b0" },
  { label: "Pink", value: "#c14c8a" },
  { label: "Red", value: "#d44c47" },
];

const HIGHLIGHTS: { label: string; value: string | null }[] = [
  { label: "None", value: null },
  { label: "Gray", value: "#f1f1ef" },
  { label: "Brown", value: "#f3eeee" },
  { label: "Orange", value: "#faebdd" },
  { label: "Yellow", value: "#fbf3db" },
  { label: "Green", value: "#edf3ec" },
  { label: "Blue", value: "#e7f3f8" },
  { label: "Purple", value: "#f6f3f9" },
  { label: "Pink", value: "#faf1f5" },
  { label: "Red", value: "#fdebec" },
];

function Btn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "flex size-7 items-center justify-center rounded transition-colors hover:bg-accent",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function BubbleToolbar({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed, from, to }) =>
        ed.isEditable && from !== to && !ed.isActive("codeBlock")
      }
    >
      <div className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-4" />
        </Btn>
        <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-4" />
        </Btn>
        <Btn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline className="size-4" />
        </Btn>
        <Btn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="size-4" />
        </Btn>
        <Btn title="Code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="size-4" />
        </Btn>
        <Btn
          title="Link"
          active={editor.isActive("link")}
          onClick={() => {
            const prev = (editor.getAttributes("link").href as string) ?? "";
            const url = window.prompt("Link URL", prev);
            if (url === null) return;
            if (url === "") editor.chain().focus().unsetLink().run();
            else editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          <Link2 className="size-4" />
        </Btn>

        <span className="mx-0.5 h-5 w-px bg-border" />

        {/* Text color */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" title="Text color" className="flex size-7 items-center justify-center rounded hover:bg-accent" onMouseDown={(e) => e.preventDefault()}>
              <Baseline className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="grid grid-cols-5 gap-1 p-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                title={c.label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (c.value) editor.chain().focus().setColor(c.value).run();
                  else editor.chain().focus().unsetColor().run();
                }}
                className="flex size-7 items-center justify-center rounded border text-sm font-semibold hover:ring-2 hover:ring-ring"
                style={{ color: c.value ?? "inherit" }}
              >
                A
              </button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Highlight */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" title="Highlight" className="flex size-7 items-center justify-center rounded hover:bg-accent" onMouseDown={(e) => e.preventDefault()}>
              <Highlighter className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="grid grid-cols-5 gap-1 p-1.5">
            {HIGHLIGHTS.map((c) => (
              <button
                key={c.label}
                type="button"
                title={c.label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (c.value) editor.chain().focus().setHighlight({ color: c.value }).run();
                  else editor.chain().focus().unsetHighlight().run();
                }}
                className="size-7 rounded border hover:ring-2 hover:ring-ring"
                style={{ backgroundColor: c.value ?? "transparent" }}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="mx-0.5 h-5 w-px bg-border" />

        <Btn title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="size-4" />
        </Btn>
        <Btn title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="size-4" />
        </Btn>
        <Btn title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="size-4" />
        </Btn>
      </div>
    </BubbleMenu>
  );
}
